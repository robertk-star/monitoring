import pg from 'pg';
import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;
let pool: any;
const SESSION_COOKIE = 'saffhire_session';
const SAFETY_STATUSES = new Set(['S1 Complete', 'Emp Sent', 'Emp Complete', 'Completed']);
const USER_ROLES = new Set(['admin', 'user', 'viewer', 'client_admin', 'client_user']);
const BOOL_REPORT_FIELDS = new Set([
  'vehicleStraightTruck', 'vehicleTractorSemitrailer', 'vehicleBus', 'vehicleCargoTank', 'vehicleDoublesTriples', 'vehicleOther',
  'dotAlcoholTestPositive', 'dotDrugTestPositive', 'dotRefusedTest', 'dotOtherViolations',
]);
const REPORT_FIELDS = [
  'applicantName', 'fileNumber', 'created', 'status', 'followUpDate', 'notes',
  'prevEmployerName', 'prevEmployerEmail', 'prevEmployerStreet', 'prevEmployerPhone', 'prevEmployerFax', 'prevEmployerCityStateZip',
  'employerName', 'employerAttention', 'employerStreet', 'employerCityStateZip', 'employerPhone', 'employerFax', 'employerEmail', 'confFax', 'confEmail',
  'employedByCompany', 'jobTitle', 'fromDate', 'toDate', 'droveMotorVehicle',
  'vehicleStraightTruck', 'vehicleTractorSemitrailer', 'vehicleBus', 'vehicleCargoTank', 'vehicleDoublesTriples', 'vehicleOther',
  'accidentHistory', 'accidentDate1', 'accidentLocation1', 'accidentInjuries1', 'accidentFatalities1', 'accidentHazmat1',
  'accidentDate2', 'accidentLocation2', 'accidentInjuries2', 'accidentFatalities2', 'accidentHazmat2',
  'accidentDate3', 'accidentLocation3', 'accidentInjuries3', 'accidentFatalities3', 'accidentHazmat3', 'otherAccidents',
  'dotCompany', 'dotEmployee', 'dotAlcoholTestPositive', 'dotDrugTestPositive', 'dotRefusedTest', 'dotOtherViolations',
  'infoReceivedFrom', 'infoReceivedDate',
];
const reportCols = ['"companyId"', ...REPORT_FIELDS.map((field) => `"${field}"`).map((col) => col === '"created"' || col === '"status"' || col === '"notes"' ? col.replaceAll('"', '') : col)];

function json(res: any, statusCode: number, payload: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
function errorMessage(error: any) { if (!error) return 'Unknown server error'; if (typeof error === 'string') return error; if (error.message) return error.message; try { return JSON.stringify(error); } catch { return String(error); } }
function getPool() { if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing in Vercel Environment Variables'); if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); return pool; }
async function query(text: string, params: any[] = []) { return getPool().query(text, params); }
async function readBody(req: any) { if (req.body && typeof req.body === 'object') return req.body; if (typeof req.body === 'string' && req.body.trim()) { try { return JSON.parse(req.body); } catch { return {}; } } const chunks: any[] = []; for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); if (!chunks.length) return {}; try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; } }
function secret() { if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing in Vercel Environment Variables'); return new TextEncoder().encode(process.env.JWT_SECRET); }
function parseCookies(req: any) { const header = req.headers?.cookie || ''; const out: any = {}; for (const part of header.split(';')) { const idx = part.indexOf('='); if (idx === -1) continue; const key = part.slice(0, idx).trim(); const val = part.slice(idx + 1).trim(); if (!key) continue; try { out[key] = decodeURIComponent(val); } catch { out[key] = val; } } return out; }
function setSessionCookie(res: any, token: string, maxAgeSeconds: number) { res.setHeader('Set-Cookie', [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure', `Max-Age=${maxAgeSeconds}`].join('; ')); }
function clearSessionCookie(res: any) { res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`); }
function publicUser(user: any) { if (!user) return null; return { id: user.id, username: user.username, displayName: user.displayName || user.username, role: user.role, companyId: user.companyId ?? null, isActive: user.isActive, mustChangePassword: user.mustChangePassword || false, lastSignedIn: user.lastSignedIn || null }; }
async function getUserFromRequest(req: any) { const token = parseCookies(req)[SESSION_COOKIE]; if (!token) return null; try { const { payload } = await jwtVerify(token, secret()); const id = Number(payload.sub); const result = await query('select id, username, "displayName", role, "companyId", "isActive", "mustChangePassword", "lastSignedIn" from local_users where id=$1 limit 1', [id]); const user = result.rows[0] || null; if (!user || !user.isActive) return null; return user; } catch { return null; } }
async function requireUser(req: any, res: any) { const user = await getUserFromRequest(req); if (!user) { json(res, 401, { status: 'error', message: 'Login required' }); return null; } return user; }
function requireAdmin(user: any, res: any) { if (user.role !== 'admin') { json(res, 403, { status: 'error', message: 'Admin access required' }); return false; } return true; }
function isAdmin(user: any) { return user?.role === 'admin'; }
function isClientAdmin(user: any) { return user?.role === 'client_admin'; }
function canManageClientUsers(user: any) { return isAdmin(user) || isClientAdmin(user); }
function requestedCompanyId(req: any, user: any) {
  const url = new URL(req.url || '/', 'https://local.test');
  const requested = Number(url.searchParams.get('companyId') || user.companyId || 1);
  return isAdmin(user) ? requested : Number(user.companyId || requested || 1);
}
function requireCompanyScope(user: any, res: any) {
  if (isAdmin(user)) return true;
  if (!user.companyId) {
    json(res, 403, { status: 'error', message: 'Client company access is required' });
    return false;
  }
  return true;
}

function getRoute(req: any) { const url = new URL(req.url || '/', 'https://local.test'); return url.searchParams.get('path') || url.pathname.replace(/^\/api\/?/, '').replace(/^\//, ''); }
function slugify(value: string) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company'; }
function normalizeMonitorStatus(value: any) { return String(value || '').trim().toLowerCase() === 'on' ? 'On' : 'Off'; }
function asBool(value: any) { const raw = String(value ?? '').trim().toLowerCase(); return value === true || raw === 'true' || raw === 'yes' || raw === 'y' || raw === '1' || raw === 'on' || raw === 'x'; }
function pick(row: any, keys: string[]) { for (const key of keys) if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key]; return ''; }


async function clientAuth(req: any, res: any, route: string) {
  if (route === 'client-auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');

    const result = await query(
      'select id, username, "passwordHash", "displayName", role, "companyId", "isActive", "mustChangePassword", "lastSignedIn" from local_users where lower(username)=lower($1) limit 1',
      [username]
    );

    const user = result.rows[0];

    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      return json(res, 401, { status: 'error', message: 'Invalid username or password' });
    }

    if (!user.companyId) {
      return json(res, 403, { status: 'error', message: 'Client account is not assigned to a company' });
    }

    const allowedClientRoles = new Set(['client_admin', 'client_user', 'viewer', 'user']);
    if (!allowedClientRoles.has(user.role)) {
      return json(res, 403, { status: 'error', message: 'This login is for client users only' });
    }

    await query('update local_users set "lastSignedIn"=now() where id=$1', [user.id]);

    const token = await new SignJWT({
      sub: String(user.id),
      role: user.role,
      name: user.displayName || user.username,
      clientPortal: true,
    }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(body.rememberMe ? '30d' : '1d').sign(secret());

    setSessionCookie(res, token, body.rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24);

    return json(res, 200, { status: 'ok', user: publicUser(user), redirect: '/client-portal.html' });
  }

  if (route === 'client-auth/me' && req.method === 'GET') {
    const user = await getUserFromRequest(req);
    if (!user) return json(res, 401, { status: 'error', message: 'Login required' });
    if (!user.companyId) return json(res, 403, { status: 'error', message: 'Client company access is required' });
    return json(res, 200, { status: 'ok', user: publicUser(user) });
  }

  if (route === 'client-auth/logout' && req.method === 'POST') {
    clearSessionCookie(res);
    return json(res, 200, { status: 'ok' });
  }

  return false;
}


async function auth(req: any, res: any, route: string) {
  if (route === 'debug' && req.method === 'GET') return json(res, 200, { status: 'ok', route, hasDatabaseUrl: Boolean(process.env.DATABASE_URL), hasJwtSecret: Boolean(process.env.JWT_SECRET) });
  if (route === 'auth/setup-status' && req.method === 'GET') { const result = await query("select count(*)::int as count from local_users where role='admin'"); return json(res, 200, { status: 'ok', hasAdmin: Number(result.rows[0]?.count || 0) > 0 }); }
  if (route === 'auth/setup-admin' && req.method === 'POST') { const count = await query("select count(*)::int as count from local_users where role='admin'"); if (Number(count.rows[0]?.count || 0) > 0) return json(res, 400, { status: 'error', message: 'Admin already exists' }); const body = await readBody(req); const username = String(body.username || '').trim().toLowerCase(); const password = String(body.password || ''); if (username.length < 3 || password.length < 6) return json(res, 400, { status: 'error', message: 'Username and password are required' }); const company = await query("select id from companies where slug='driver-pipeline' limit 1"); const companyId = company.rows[0]?.id || null; const passwordHash = await bcrypt.hash(password, 12); const result = await query('insert into local_users (username, "passwordHash", "displayName", role, "companyId", "isActive") values ($1,$2,$3,$4,$5,true) returning id, username, "displayName", role, "companyId", "isActive", "mustChangePassword", "lastSignedIn"', [username, passwordHash, username, 'admin', companyId]); const user = result.rows[0]; const token = await new SignJWT({ sub: String(user.id), role: user.role, name: user.displayName || user.username }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(secret()); setSessionCookie(res, token, 60 * 60 * 24 * 30); return json(res, 200, { status: 'ok', user: publicUser(user) }); }
  if (route === 'auth/login' && req.method === 'POST') { const body = await readBody(req); const username = String(body.username || '').trim().toLowerCase(); const password = String(body.password || ''); const result = await query('select id, username, "passwordHash", "displayName", role, "companyId", "isActive", "mustChangePassword", "lastSignedIn" from local_users where lower(username)=lower($1) limit 1', [username]); const user = result.rows[0]; if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) return json(res, 401, { status: 'error', message: 'Invalid username or password' }); await query('update local_users set "lastSignedIn"=now() where id=$1', [user.id]); const token = await new SignJWT({ sub: String(user.id), role: user.role, name: user.displayName || user.username }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(body.rememberMe ? '30d' : '1d').sign(secret()); setSessionCookie(res, token, body.rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24); return json(res, 200, { status: 'ok', user: publicUser(user) }); }
  if (route === 'auth/me' && req.method === 'GET') { const user = await getUserFromRequest(req); return json(res, 200, { status: 'ok', user: publicUser(user) }); }
  if (route === 'auth/logout' && req.method === 'POST') { clearSessionCookie(res); return json(res, 200, { status: 'ok' }); }
  return false;
}

async function companies(req: any, res: any, user: any) {
  if (req.method === 'GET') { const result = await query('select id, name, slug, "isActive" from companies where "isActive"=true order by name'); return json(res, 200, { status: 'ok', companies: result.rows }); }
  if (!requireAdmin(user, res)) return;
  const body = await readBody(req);
  if (req.method === 'POST') { const name = String(body.name || '').trim(); if (!name) return json(res, 400, { status: 'error', message: 'Company name is required' }); const result = await query('insert into companies (name, slug, "isActive") values ($1,$2,true) on conflict (slug) do update set name=excluded.name, "isActive"=true, "updatedAt"=now() returning id, name, slug, "isActive"', [name, slugify(body.slug || name)]); return json(res, 200, { status: 'ok', company: result.rows[0] }); }
  if (req.method === 'PATCH') { const id = Number(body.id); const name = String(body.name || '').trim(); if (!id || !name) return json(res, 400, { status: 'error', message: 'Company id and name are required' }); const result = await query('update companies set name=$1, "isActive"=$2, "updatedAt"=now() where id=$3 returning id, name, slug, "isActive"', [name, body.isActive !== false, id]); return json(res, 200, { status: 'ok', company: result.rows[0] }); }
  return json(res, 405, { status: 'error', message: 'Method not allowed' });
}

async function applicants(req: any, res: any, user: any) {
  const url = new URL(req.url || '/', 'https://local.test'); const companyId = requestedCompanyId(req, user);
  if (req.method === 'GET') { const result = await query('select id, "fileNumber", "applicantName" as name, "orderDate", "monitorStatus", "mvrStatus", "medExpire", "terminated", notes from applicants where "companyId"=$1 order by id desc limit 10000', [companyId]); return json(res, 200, { status: 'ok', applicants: result.rows }); }
  if (req.method === 'PATCH') { const body = await readBody(req); const id = Number(body.id); if (!id) return json(res, 400, { status: 'error', message: 'Applicant id is required' }); const current = await query('select * from applicants where id=$1 and "companyId"=$2 limit 1', [id, companyId]); if (!current.rows[0]) return json(res, 404, { status: 'error', message: 'Applicant not found' }); const monitorStatus = normalizeMonitorStatus(body.monitorStatus ?? current.rows[0].monitorStatus); const medExpire = body.medExpire ?? current.rows[0].medExpire; const notes = body.notes ?? current.rows[0].notes; const terminated = body.terminated === undefined ? Boolean(current.rows[0].terminated) : asBool(body.terminated); const result = await query('update applicants set "monitorStatus"=$1, "medExpire"=$2, "medExpireOverridden"=$3, notes=$4, "terminated"=$5, "updatedAt"=now() where id=$6 and "companyId"=$7 returning id, "fileNumber", "applicantName" as name, "orderDate", "monitorStatus", "mvrStatus", "medExpire", "terminated", notes', [monitorStatus, medExpire || null, Boolean(medExpire), String(notes || ''), terminated, id, companyId]); return json(res, 200, { status: 'ok', applicant: result.rows[0] }); }
  return json(res, 405, { status: 'error', message: 'Method not allowed' });
}

function cleanReport(body: any, companyId: number) {
  const out: any = { companyId };
  for (const field of REPORT_FIELDS) {
    if (field === 'status') out[field] = SAFETY_STATUSES.has(body[field]) ? body[field] : 'S1 Complete';
    else if (field === 'created') out[field] = String(body[field] || new Date().toISOString().slice(0, 10)).trim();
    else if (BOOL_REPORT_FIELDS.has(field)) out[field] = asBool(body[field]);
    else out[field] = String(body[field] ?? '').trim();
  }
  if (!out.employerName) out.employerName = 'Driver Pipeline';
  if (!out.employerStreet) out.employerStreet = '1200 N. Union Bower Road';
  if (!out.employerCityStateZip) out.employerCityStateZip = 'Irving, TX 75061';
  if (!out.employerPhone) out.employerPhone = '972-573-2301';
  if (!out.employerEmail) out.employerEmail = 'lmercado@driverpipeline.com';
  return out;
}
function reportValues(v: any) { return ['companyId', ...REPORT_FIELDS].map((field) => v[field]); }

function safetyCsvToReport(row: any) {
  const out: any = {};
  const aliases: Record<string, string[]> = {
    applicantName: ['applicantName', 'Applicant Name', 'Applicant', 'Name', 'Driver Name'],
    fileNumber: ['fileNumber', 'File Number', 'File #', 'FileNumber', 'file_number'],
    created: ['created', 'Created', 'Create Date', 'Date Created'],
    status: ['status', 'Status'],
    followUpDate: ['followUpDate', 'Follow Up Date', 'Follow-Up Date', 'Follow Up'],
    notes: ['notes', 'Notes'],
    prevEmployerName: ['prevEmployerName', 'Previous Employer', 'Prev Employer Name', 'Previous Employer Name', 'Employer Name'],
    prevEmployerEmail: ['prevEmployerEmail', 'Previous Employer Email', 'Prev Employer Email', 'Employer Email'],
    prevEmployerStreet: ['prevEmployerStreet', 'Previous Employer Street', 'Prev Employer Street', 'Employer Street'],
    prevEmployerPhone: ['prevEmployerPhone', 'Previous Employer Phone', 'Prev Employer Phone', 'Employer Phone'],
    prevEmployerFax: ['prevEmployerFax', 'Previous Employer Fax', 'Prev Employer Fax', 'Employer Fax'],
    prevEmployerCityStateZip: ['prevEmployerCityStateZip', 'Previous Employer City State Zip', 'Previous Employer City/State/Zip', 'City State Zip'],
    employerName: ['employerName', 'Prospective Employer', 'Prospective Employer Name', 'Current Employer'],
    employerAttention: ['employerAttention', 'Attention', 'Employer Attention'],
    employerStreet: ['employerStreet', 'Prospective Employer Street'],
    employerCityStateZip: ['employerCityStateZip', 'Prospective Employer City State Zip', 'Prospective Employer City/State/Zip'],
    employerPhone: ['employerPhone', 'Prospective Employer Phone'],
    employerFax: ['employerFax', 'Prospective Employer Fax'],
    employerEmail: ['employerEmail', 'Prospective Employer Email'],
    confFax: ['confFax', 'Confidential Fax'],
    confEmail: ['confEmail', 'Confidential Email'],
  };
  for (const field of REPORT_FIELDS) out[field] = pick(row, aliases[field] || [field, field.replace(/[A-Z]/g, (m) => ` ${m}`).trim()]);
  return out;
}

async function safetyReports(req: any, res: any, user: any) {
  const url = new URL(req.url || '/', 'https://local.test'); const companyId = requestedCompanyId(req, user);
  if (req.method === 'GET') {
    let r = await query('select * from safety_reports where "companyId"=$1 order by id desc limit 1000', [companyId]);
    let source = 'selected_company';
    if (r.rows.length === 0 && user.role === 'admin') {
      const fallback = await query('select * from safety_reports order by id desc limit 1000');
      if (fallback.rows.length > 0) { r = fallback; source = 'all_companies_fallback'; }
    }
    return json(res, 200, { status: 'ok', reports: r.rows, source, requestedCompanyId: companyId });
  }
  if (req.method === 'POST') { const v = cleanReport(await readBody(req), companyId); if (!v.fileNumber && !v.applicantName) return json(res, 400, { status: 'error', message: 'File number or applicant name is required' }); const placeholders = reportCols.map((_, i) => `$${i + 1}`).join(','); const r = await query(`insert into safety_reports (${reportCols.join(',')}) values (${placeholders}) returning *`, reportValues(v)); return json(res, 200, { status: 'ok', report: r.rows[0] }); }
  if (req.method === 'PATCH') { const body = await readBody(req); const id = Number(body.id); if (!id) return json(res, 400, { status: 'error', message: 'Report id is required' }); const v = cleanReport(body, companyId); const assignments = reportCols.slice(1).map((col, i) => `${col}=$${i + 1}`).join(','); const params = reportValues(v).slice(1); params.push(id, companyId); const r = await query(`update safety_reports set ${assignments}, "updatedAt"=now() where id=$${params.length - 1} and "companyId"=$${params.length} returning *`, params); return json(res, 200, { status: 'ok', report: r.rows[0] }); }
  if (req.method === 'DELETE') { const id = Number(url.searchParams.get('id')); await query('delete from safety_reports where id=$1 and "companyId"=$2', [id, companyId]); return json(res, 200, { status: 'ok', success: true }); }
  return json(res, 405, { status: 'error', message: 'Method not allowed' });
}

async function importSafetyReports(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;
  if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  const body = await readBody(req);
  const companyId = Number(body.companyId || user.companyId || 1);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  let imported = 0, updated = 0, skipped = 0;
  for (const row of rows) {
    const v = cleanReport(safetyCsvToReport(row), companyId);
    if (!v.fileNumber && !v.applicantName) { skipped++; continue; }
    const existing = v.fileNumber ? await query('select id from safety_reports where "companyId"=$1 and "fileNumber"=$2 order by id asc limit 1', [companyId, v.fileNumber]) : { rows: [] };
    if (existing.rows[0]?.id) {
      const assignments = reportCols.slice(1).map((col, i) => `${col}=$${i + 1}`).join(',');
      const params = reportValues(v).slice(1); params.push(existing.rows[0].id, companyId);
      await query(`update safety_reports set ${assignments}, "updatedAt"=now() where id=$${params.length - 1} and "companyId"=$${params.length}`, params);
      updated++;
    } else {
      const placeholders = reportCols.map((_, i) => `$${i + 1}`).join(',');
      await query(`insert into safety_reports (${reportCols.join(',')}) values (${placeholders})`, reportValues(v));
      imported++;
    }
  }
  return json(res, 200, { status: 'ok', imported, updated, skipped });
}

async function users(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;
  if (req.method === 'GET') { const r = await query('select id, username, "displayName", role, "companyId", "isActive", "mustChangePassword", "lastSignedIn" from local_users order by id asc'); return json(res, 200, { status: 'ok', users: r.rows.map(publicUser) }); }
  const body = await readBody(req);
  if (req.method === 'POST') { const username = String(body.username || '').trim().toLowerCase(); const rawPassword = String(body.password || ''); if (username.length < 3 || rawPassword.length < 6) return json(res, 400, { status: 'error', message: 'Username and password are required' }); const role = USER_ROLES.has(body.role) ? body.role : 'user'; const passwordHash = await bcrypt.hash(rawPassword, 12); const r = await query('insert into local_users (username,"passwordHash","displayName",role,"companyId","isActive","mustChangePassword") values ($1,$2,$3,$4,$5,true,false) returning id, username, "displayName", role, "companyId", "isActive", "mustChangePassword", "lastSignedIn"', [username, passwordHash, String(body.displayName || username), role, body.companyId ? Number(body.companyId) : null]); return json(res, 200, { status: 'ok', user: publicUser(r.rows[0]) }); }
  if (req.method === 'PATCH') { const id = Number(body.id); const role = USER_ROLES.has(body.role) ? body.role : 'user'; const baseParams: any[] = [String(body.displayName || ''), role, body.companyId ? Number(body.companyId) : null, body.isActive !== false]; let sql = 'update local_users set "displayName"=$1, role=$2, "companyId"=$3, "isActive"=$4, "updatedAt"=now()'; if (body.password) { baseParams.push(await bcrypt.hash(String(body.password), 12)); sql += `, "passwordHash"=$${baseParams.length}, "mustChangePassword"=false`; } baseParams.push(id); sql += ` where id=$${baseParams.length} returning id, username, "displayName", role, "companyId", "isActive", "mustChangePassword", "lastSignedIn"`; const r = await query(sql, baseParams); return json(res, 200, { status: 'ok', user: publicUser(r.rows[0]) }); }
  if (req.method === 'DELETE') { const url = new URL(req.url || '/', 'https://local.test'); const id = Number(url.searchParams.get('id')); if (id === user.id) return json(res, 400, { status: 'error', message: 'You cannot delete your own account' }); await query('delete from local_users where id=$1', [id]); return json(res, 200, { status: 'ok', success: true }); }
  return json(res, 405, { status: 'error', message: 'Method not allowed' });
}

async function notificationEmails(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return; const url = new URL(req.url || '/', 'https://local.test');
  if (req.method === 'GET') { const r = await query('select id, label, email, "isActive" from notification_emails order by id asc'); return json(res, 200, { status: 'ok', emails: r.rows }); }
  const body = await readBody(req);
  if (req.method === 'POST') { const email = String(body.email || '').trim().toLowerCase(); if (!email.includes('@')) return json(res, 400, { status: 'error', message: 'Valid email is required' }); const r = await query('insert into notification_emails (label,email,"isActive") values ($1,$2,true) returning id,label,email,"isActive"', [String(body.label || '').trim(), email]); return json(res, 200, { status: 'ok', email: r.rows[0] }); }
  if (req.method === 'PATCH') { const email = String(body.email || '').trim().toLowerCase(); if (!email.includes('@')) return json(res, 400, { status: 'error', message: 'Valid email is required' }); const r = await query('update notification_emails set label=$1,email=$2,"isActive"=$3,"updatedAt"=now() where id=$4 returning id,label,email,"isActive"', [String(body.label || '').trim(), email, body.isActive !== false, Number(body.id)]); return json(res, 200, { status: 'ok', email: r.rows[0] }); }
  if (req.method === 'DELETE') { await query('delete from notification_emails where id=$1', [Number(url.searchParams.get('id'))]); return json(res, 200, { status: 'ok', success: true }); }
  return json(res, 405, { status: 'error', message: 'Method not allowed' });
}

async function importApplicants(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return; if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' }); const body = await readBody(req); const companyId = Number(body.companyId || user.companyId || 1); const rows = Array.isArray(body.rows) ? body.rows : []; let imported = 0, skipped = 0; for (const row of rows) { const fileNumber = String(pick(row, ['fileNumber','File Number','File #','FileNumber','file_number'])).trim(); if (!fileNumber) { skipped++; continue; } const medExpire = String(pick(row, ['medExpire','Med Expire','Medical Expiration','medicalExpiration'])).trim(); await query('insert into applicants ("companyId","fileNumber","applicantName","orderDate","monitorStatus","mvrStatus","medExpire","medExpireOverridden",notes) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict ("fileNumber","companyId") do update set "applicantName"=excluded."applicantName","orderDate"=excluded."orderDate","monitorStatus"=excluded."monitorStatus","mvrStatus"=excluded."mvrStatus","medExpire"=excluded."medExpire","medExpireOverridden"=excluded."medExpireOverridden",notes=excluded.notes,"updatedAt"=now()', [companyId, fileNumber, String(pick(row, ['name','Name','Applicant Name','applicantName'])).trim(), String(pick(row, ['orderDate','Order Date','Created','created'])).trim(), normalizeMonitorStatus(pick(row, ['monitorStatus','Monitor Status','Monitoring','monitoring'])), String(pick(row, ['mvrStatus','MVR Status','Status'])).trim(), medExpire || null, Boolean(medExpire), String(pick(row, ['notes','Notes'])).trim()]); imported++; } return json(res, 200, { status: 'ok', imported, skipped });
}

async function changePassword(req: any, res: any, user: any) {
  if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  const body = await readBody(req); const currentPassword = String(body.currentPassword || ''); const newPassword = String(body.newPassword || '');
  if (newPassword.length < 8) return json(res, 400, { status: 'error', message: 'New password must be at least 8 characters' });
  const result = await query('select id, "passwordHash" from local_users where id=$1 limit 1', [user.id]); const row = result.rows[0];
  if (!row || !(await bcrypt.compare(currentPassword, row.passwordHash))) return json(res, 400, { status: 'error', message: 'Current password is incorrect' });
  await query('update local_users set "passwordHash"=$1, "mustChangePassword"=false, "updatedAt"=now() where id=$2', [await bcrypt.hash(newPassword, 12), user.id]);
  return json(res, 200, { status: 'ok', success: true });
}



async function clientApplicantUpdate(req: any, res: any, user: any) {
  if (req.method !== 'PATCH') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  if (!requireCompanyScope(user, res)) return;

  const companyId = requestedCompanyId(req, user);
  const body = await readBody(req);
  const id = Number(body.id);

  if (!id) return json(res, 400, { status: 'error', message: 'Applicant id is required' });

  const current = await query(
    'select id, "terminated" from applicants where id=$1 and "companyId"=$2 limit 1',
    [id, companyId]
  );

  if (!current.rows[0]) {
    return json(res, 404, { status: 'error', message: 'Monitoring record not found for this client' });
  }

  const monitorStatus = normalizeMonitorStatus(body.monitorStatus);
  const notes = String(body.notes ?? '').trim();
  const terminated = body.terminated === undefined ? Boolean(current.rows[0].terminated) : asBool(body.terminated);

  const result = await query(
    `update applicants
     set "monitorStatus"=$1,
         notes=$2,
         "terminated"=$3,
         "updatedAt"=now()
     where id=$4 and "companyId"=$5
     returning id, "fileNumber", "applicantName" as name, "orderDate", "monitorStatus", "mvrStatus", "medExpire", "terminated", notes`,
    [monitorStatus, notes, terminated, id, companyId]
  );

  return json(res, 200, { status: 'ok', applicant: result.rows[0] });
}


// PHASE12A39_CLIENT_MONITORING_LIMIT: client dashboard returns up to 1000 monitoring records to match admin scale.
async function clientDashboard(req: any, res: any, user: any) {
  if (req.method !== 'GET') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  if (!requireCompanyScope(user, res)) return;
  const companyId = requestedCompanyId(req, user);

  const company = await query('select id, name, slug, "isActive" from companies where id=$1 limit 1', [companyId]);
  const applicantStats = await query(
    `select count(*)::int as total,
      count(*) filter (where "monitorStatus"='On')::int as on_monitoring,
      count(*) filter (where "monitorStatus"<>'On' or "monitorStatus" is null)::int as off_monitoring,
      count(*) filter (where "medExpire" is null or "medExpire"='')::int as blank_med_expire,
      count(*) filter (where "medExpire" is not null and "medExpire"<>'' and "medExpire"::date < current_date)::int as expired_medical,
      count(*) filter (where "medExpire" is not null and "medExpire"<>'' and "medExpire"::date between current_date and current_date + interval '30 days')::int as expiring_30,
      count(*) filter (where "medExpire" is not null and "medExpire"<>'' and "medExpire"::date between current_date + interval '31 days' and current_date + interval '60 days')::int as expiring_60
     from applicants where "companyId"=$1`, [companyId]);

  const safetyStats = await query(
    `select count(*)::int as total,
      count(*) filter (where status='S1 Complete')::int as s1_complete,
      count(*) filter (where status='Emp Sent')::int as emp_sent,
      count(*) filter (where status='Emp Complete')::int as emp_complete,
      count(*) filter (where status='Completed')::int as completed
     from safety_reports where "companyId"=$1`, [companyId]);

  const recentApplicants = await query(
    `select id, "fileNumber", "applicantName" as name, "orderDate", "monitorStatus", "mvrStatus", "medExpire", "terminated", notes
     from applicants where "companyId"=$1 order by id desc limit 1000`, [companyId]);

  const recentSafety = await query(
    `select id, "fileNumber", "applicantName", created, status, "followUpDate", "prevEmployerName", notes
     from safety_reports where "companyId"=$1 order by id desc limit 1000`, [companyId]);

  const clientUsers = await query(
    `select id, username, "displayName", role, "companyId", "isActive", "mustChangePassword", "lastSignedIn"
     from local_users where "companyId"=$1 order by id asc`, [companyId]);

  return json(res, 200, {
    status: 'ok',
    company: company.rows[0] || { id: companyId, name: `Company ${companyId}` },
    applicantStats: applicantStats.rows[0] || {},
    safetyStats: safetyStats.rows[0] || {},
    recentApplicants: recentApplicants.rows,
    recentSafetyReports: recentSafety.rows,
    users: clientUsers.rows.map(publicUser),
    canManageUsers: canManageClientUsers(user)
  });
}

async function clientUsers(req: any, res: any, user: any) {
  if (!canManageClientUsers(user)) return json(res, 403, { status: 'error', message: 'Client admin access required' });
  if (!requireCompanyScope(user, res)) return;
  const companyId = requestedCompanyId(req, user);

  if (req.method === 'GET') {
    const r = await query(`select id, username, "displayName", role, "companyId", "isActive", "mustChangePassword", "lastSignedIn" from local_users where "companyId"=$1 order by id asc`, [companyId]);
    return json(res, 200, { status: 'ok', users: r.rows.map(publicUser) });
  }

  const body = await readBody(req);

  if (req.method === 'POST') {
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (username.length < 3 || password.length < 8) return json(res, 400, { status: 'error', message: 'Username and temporary password of at least 8 characters are required' });
    let role = String(body.role || 'client_user');
    const allowed = isAdmin(user) ? new Set(['client_admin','client_user','viewer','user']) : new Set(['client_user','viewer']);
    if (!allowed.has(role)) role = 'client_user';
    const hash = await bcrypt.hash(password, 12);
    const r = await query(`insert into local_users (username,"passwordHash","displayName",role,"companyId","isActive","mustChangePassword") values ($1,$2,$3,$4,$5,true,true) returning id, username, "displayName", role, "companyId", "isActive", "mustChangePassword", "lastSignedIn"`, [username, hash, String(body.displayName || username), role, companyId]);
    return json(res, 200, { status: 'ok', user: publicUser(r.rows[0]) });
  }

  if (req.method === 'PATCH') {
    const id = Number(body.id);
    if (!id) return json(res, 400, { status: 'error', message: 'User id is required' });
    const current = await query('select id, role from local_users where id=$1 and "companyId"=$2 limit 1', [id, companyId]);
    if (!current.rows[0]) return json(res, 404, { status: 'error', message: 'User not found for this client' });
    let role = String(body.role || current.rows[0].role || 'client_user');
    const allowed = isAdmin(user) ? new Set(['client_admin','client_user','viewer','user']) : new Set(['client_user','viewer']);
    if (!allowed.has(role)) role = current.rows[0].role || 'client_user';

    let params: any[] = [String(body.displayName || ''), role, body.isActive !== false];
    let sql = 'update local_users set "displayName"=$1, role=$2, "isActive"=$3, "updatedAt"=now()';
    if (body.password) {
      params.push(await bcrypt.hash(String(body.password), 12));
      sql += `, "passwordHash"=$${params.length}, "mustChangePassword"=true`;
    }
    params.push(id, companyId);
    sql += ` where id=$${params.length-1} and "companyId"=$${params.length} returning id, username, "displayName", role, "companyId", "isActive", "mustChangePassword", "lastSignedIn"`;
    const r = await query(sql, params);
    return json(res, 200, { status: 'ok', user: publicUser(r.rows[0]) });
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url || '/', 'https://local.test');
    const id = Number(url.searchParams.get('id'));
    if (!id) return json(res, 400, { status: 'error', message: 'User id is required' });
    if (id === user.id) return json(res, 400, { status: 'error', message: 'You cannot delete your own account' });
    await query('delete from local_users where id=$1 and "companyId"=$2', [id, companyId]);
    return json(res, 200, { status: 'ok', success: true });
  }

  return json(res, 405, { status: 'error', message: 'Method not allowed' });
}


// PHASE12A40_CLIENT_COMPLETED_SAFETY_PDF START
function pdfClean(value: any) { return String(value ?? '').trim(); }
function pdfSame(value: any, expected: string) { return pdfClean(value).toLowerCase() === expected.toLowerCase(); }
function pdfShortDate(value: any) { return pdfClean(value).slice(0, 10); }
function pdfSplitText(value: any, maxLen = 82, maxLines = 4) {
  const text = pdfClean(value).replace(/\s+/g, ' ');
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    if (!word) continue;
    if ((current + ' ' + word).trim().length > maxLen) {
      lines.push(current.trim());
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current && lines.length < maxLines) lines.push(current.trim());
  while (lines.length < maxLines) lines.push('');
  return lines;
}
function pdfSetText(form: any, name: string, value: any) {
  try { form.getTextField(name).setText(pdfClean(value)); } catch {}
}
function pdfCheck(form: any, name: string, shouldCheck: any) {
  try {
    const cb = form.getCheckBox(name);
    if (shouldCheck) cb.check(); else cb.uncheck();
  } catch {}
}
function pdfSetAccidentRows(form: any, report: any) {
  pdfSetText(form, 'Date_4', report.accidentDate1);
  pdfSetText(form, 'Location 1', report.accidentLocation1);
  pdfSetText(form, 'No of Injuries No of Fatalities', report.accidentInjuries1);
  pdfSetText(form, '1_2', report.accidentFatalities1);
  pdfSetText(form, 'Hazmat Spill 1', report.accidentHazmat1);
  pdfSetText(form, '2', report.accidentDate2);
  pdfSetText(form, 'Location 2', report.accidentLocation2);
  pdfSetText(form, '1', report.accidentInjuries2);
  pdfSetText(form, '2_3', report.accidentFatalities2);
  pdfSetText(form, 'Hazmat Spill 2', report.accidentHazmat2);
  pdfSetText(form, '3', report.accidentDate3);
  pdfSetText(form, 'Location 3', report.accidentLocation3);
  pdfSetText(form, '2_2', report.accidentInjuries3);
  pdfSetText(form, '3_2', report.accidentFatalities3);
  pdfSetText(form, 'Hazmat Spill 3', report.accidentHazmat3);
  const lines = pdfSplitText(report.otherAccidents, 88, 4);
  pdfSetText(form, 'Please provide information concerning any other commercial motor vehicle accidents involving the applicant that were reported', lines[0]);
  pdfSetText(form, 'to government agencies or insurers or retained under internal company policies 1', lines[1]);
  pdfSetText(form, 'to government agencies or insurers or retained under internal company policies 2', lines[2]);
  pdfSetText(form, 'to government agencies or insurers or retained under internal company policies 3', lines[3]);
}
async function buildCompletedSafetyPdf(report: any) {
  const templatePath = path.join(process.cwd(), 'public', 'fmcsa-safety-performance-template.pdf');
  if (!fs.existsSync(templatePath)) throw new Error('FMCSA PDF template is missing from public/fmcsa-safety-performance-template.pdf');
  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  pdfSetText(form, 'I Print Name', report.applicantName);
  pdfSetText(form, 'Previous Employer 1', report.prevEmployerName);
  pdfSetText(form, 'Previous Employer 2', report.prevEmployerStreet);
  pdfSetText(form, 'Email', report.prevEmployerEmail);
  pdfSetText(form, 'Telephone', report.prevEmployerPhone);
  pdfSetText(form, 'City State Zip', report.prevEmployerCityStateZip);
  pdfSetText(form, 'Fax No', report.prevEmployerFax);
  pdfSetText(form, 'records within the previous 3 years from', pdfShortDate(report.created));
  pdfSetText(form, 'Prospective Employer 1', report.employerName || 'Driver Pipeline');
  pdfSetText(form, 'Prospective Employer 2', report.employerAttention);
  pdfSetText(form, 'Telephone_2', report.employerPhone);
  pdfSetText(form, 'Prospective Employer 3', report.employerStreet);
  pdfSetText(form, 'City State Zip_2', report.employerCityStateZip);
  pdfSetText(form, 'Prospective employers confidential fax number', report.confFax || report.employerFax);
  pdfSetText(form, 'Prospective employers confidential email address', report.confEmail || report.employerEmail);
  pdfSetText(form, 'Date', pdfShortDate(report.created));

  pdfCheck(form, 'The applicant named above was or is employed or used by us Yes', pdfSame(report.employedByCompany, 'Yes'));
  pdfSetText(form, 'Employed as job title', report.jobTitle);
  pdfSetText(form, 'from my', report.fromDate);
  pdfSetText(form, 'to my', report.toDate);
  pdfCheck(form, 'Did heshe drive a motor vehicle for you  Yes', pdfSame(report.droveMotorVehicle, 'Yes'));
  pdfCheck(form, 'No_2', pdfSame(report.droveMotorVehicle, 'No'));
  pdfCheck(form, 'Straight Truck', report.vehicleStraightTruck);
  pdfCheck(form, 'TractorSemitrailer', report.vehicleTractorSemitrailer);
  pdfCheck(form, 'Bus', report.vehicleBus);
  pdfCheck(form, 'Cargo Tank', report.vehicleCargoTank);
  pdfCheck(form, 'DoublesTriples', report.vehicleDoublesTriples);
  pdfSetText(form, 'Other Specify', report.vehicleOther ? 'Other' : '');
  pdfSetText(form, 'Completed by', report.infoReceivedFrom);
  pdfSetText(form, 'Company 1', report.prevEmployerName);
  pdfSetText(form, 'Company 2', report.prevEmployerStreet);
  pdfSetText(form, 'City State Zip_3', report.prevEmployerCityStateZip);
  pdfSetText(form, 'Telephone_3', report.prevEmployerPhone);
  pdfSetText(form, 'Date_2', report.infoReceivedDate || pdfShortDate(report.created));

  const noSafetyHistory = pdfSame(report.accidentHistory, 'No accidents reported') && !report.dotAlcoholTestPositive && !report.dotDrugTestPositive && !report.dotRefusedTest && !report.dotOtherViolations;
  pdfCheck(form, 'If there is no safety performance history to report check here', noSafetyHistory);

  pdfSetText(form, 'Employee Name', report.applicantName);
  pdfSetText(form, 'Date_3', report.infoReceivedDate || pdfShortDate(report.created));
  pdfCheck(form, '3 years prior to the application date shown on SIDE 1 or check here', pdfSame(report.accidentHistory, 'No accidents reported'));
  pdfSetAccidentRows(form, report);

  const anyDotViolation = Boolean(report.dotAlcoholTestPositive || report.dotDrugTestPositive || report.dotRefusedTest || report.dotOtherViolations);
  pdfCheck(form, 'Yes', anyDotViolation);
  pdfSetText(form, 'to', report.fromDate);
  pdfSetText(form, 'undefined', report.toDate);

  pdfCheck(form, 'Check Box3', true);
  pdfSetText(form, 'This form was check one', 'Emailed to previous employer');
  pdfSetText(form, 'undefined_7', report.infoReceivedFrom);
  pdfSetText(form, 'Date_5', report.infoReceivedDate || pdfShortDate(report.created));
  pdfSetText(form, 'Subsequent attempts to contact previous employer 39123c1 1', pdfClean(report.followUpDate) ? `Follow-up date: ${report.followUpDate}` : '');

  pdfSetText(form, 'Information received from', report.infoReceivedFrom);
  pdfCheck(form, 'Check Box7', true);
  pdfSetText(form, 'Recorded by', report.employerName || 'SaffHire');
  pdfSetText(form, 'undefined_8', report.infoReceivedDate || pdfShortDate(report.created));

  form.flatten();
  return await pdfDoc.save();
}
async function clientSafetyPdf(req: any, res: any, user: any) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  if (!requireCompanyScope(user, res)) return;

  const companyId = requestedCompanyId(req, user);
  const url = new URL(req.url || '/', 'https://local.test');
  let id = Number(url.searchParams.get('id') || 0);
  let fileNumber = String(url.searchParams.get('fileNumber') || '').trim();

  if (req.method === 'POST') {
    const body = await readBody(req);
    id = Number(body.id || id || 0);
    fileNumber = String(body.fileNumber || fileNumber || '').trim();
  }

  let result;
  if (id) {
    result = await query('select * from safety_reports where id=$1 and "companyId"=$2 limit 1', [id, companyId]);
  } else if (fileNumber) {
    result = await query('select * from safety_reports where "companyId"=$1 and "fileNumber"=$2 order by id desc limit 1', [companyId, fileNumber]);
  } else {
    return json(res, 400, { status: 'error', message: 'Report id or file number is required' });
  }

  const report = result.rows[0];
  if (!report) return json(res, 404, { status: 'error', message: 'Safety report not found for this client' });
  if (String(report.status || '') !== 'Completed') return json(res, 400, { status: 'error', message: 'Completed PDF is available only when the Safety Performance report status is Completed' });

  const bytes = await buildCompletedSafetyPdf(report);
  const safeFile = String(report.fileNumber || report.id || 'safety-performance').replace(/[^0-9A-Za-z_-]/g, '') || 'safety-performance';
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="completed-safety-performance-${safeFile}.pdf"`);
  res.end(Buffer.from(bytes));
}
// PHASE12A40_CLIENT_COMPLETED_SAFETY_PDF END

async function systemCheck(req: any, res: any, user: any) {
  if (req.method !== 'GET') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  if (!requireAdmin(user, res)) return;
  const checks: any[] = [];
  async function check(name: string, sql: string) { try { const r = await query(sql); checks.push({ name, ok: true, detail: String(r.rows[0]?.count ?? r.rows[0]?.exists ?? 'ok') }); } catch (error: any) { checks.push({ name, ok: false, detail: errorMessage(error) }); } }
  await check('Database connected', 'select 1 as count');
  await check('Admin user exists', "select count(*)::int as count from local_users where role='admin'");
  await check('Companies table exists', "select exists (select 1 from information_schema.tables where table_name='companies') as exists");
  await check('Applicants table exists', "select exists (select 1 from information_schema.tables where table_name='applicants') as exists");
  await check('Safety reports table exists', "select exists (select 1 from information_schema.tables where table_name='safety_reports') as exists");
  await check('Safety reports count', 'select count(*)::int as count from safety_reports');
  await check('Notification emails table exists', "select exists (select 1 from information_schema.tables where table_name='notification_emails') as exists");
  return json(res, 200, { status: 'ok', checks });
}

// PHASE12A11_TAZWORKS_SYNC START
function tazEnv() {
  const baseUrl = String(process.env.TAZWORKS_PROXY_BASE_URL || '').replace(/\/+$/, '');
  const proxySecret = String(process.env.TAZWORKS_PROXY_SECRET || '');
  const clientGuid = String(process.env.TAZWORKS_CLIENT_GUID || '');
  if (!baseUrl) throw new Error('TAZWORKS_PROXY_BASE_URL is missing');
  if (!proxySecret) throw new Error('TAZWORKS_PROXY_SECRET is missing');
  if (!clientGuid) throw new Error('TAZWORKS_CLIENT_GUID is missing');
  return { baseUrl, proxySecret, clientGuid };
}

function tazSafe(errorText: string, statusCode?: number) {
  const value = String(errorText || '');
  if (statusCode === 401 || statusCode === 403 || /NOT_AUTHORIZED|NOT_AUTHENTICATED|not authorized|unauthorized/i.test(value)) return 'Order access could not be verified.';
  return 'The order connection is currently unavailable.';
}

function arrays(payload: any, depth = 0): any[] {
  if (!payload || depth > 4) return [];
  if (Array.isArray(payload)) return [payload];
  if (typeof payload !== 'object') return [];
  const out: any[] = [];
  for (const val of Object.values(payload)) {
    if (Array.isArray(val)) out.push(val);
    else if (val && typeof val === 'object') out.push(...arrays(val, depth + 1));
  }
  return out;
}

function flat(value: any, depth = 0): string {
  if (value == null || depth > 6) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((v) => flat(v, depth + 1)).join('\n');
  if (typeof value === 'object') return Object.entries(value).map(([k,v]) => `${k}: ${flat(v, depth + 1)}`).join('\n');
  return '';
}

function looksOrder(row: any) {
  if (!row || typeof row !== 'object') return false;
  return Boolean(row.orderGuid || row.guid || row.id || row.fileNumber || row.fileNo || row.orderNumber || row.applicantName || row.subjectName || row.orderStatus || row.status);
}

function looksSearch(row: any) {
  if (!row || typeof row !== 'object') return false;
  return Boolean(row.searchGuid || row.searchGUID || row.searchId || row.searchID || row.search_id || row.guid || row.id || row.searchName || row.searchType || row.name || row.type || row.productName || row.providerName || row._links || row.links);
}

function arr(payload: any, kind: 'order' | 'search' = 'order') {
  const candidates = [
    payload, payload?.content, payload?.orders, payload?.searches, payload?.items, payload?.data, payload?.results,
    payload?.response?.content, payload?.response?.orders, payload?.response?.searches,
    payload?._embedded?.orders, payload?._embedded?.searches, payload?._embedded?.content
  ];
  const test = kind === 'search' ? looksSearch : looksOrder;
  for (const c of candidates) if (Array.isArray(c) && c.some(test)) return c;
  const found = arrays(payload).find((a) => a.some(test));
  return found || [];
}

function iso(value: any) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dateOnly(value: any) {
  const v = iso(value);
  return v ? v.slice(0, 10) : null;
}

function dateFromText(value: any) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let m = raw.match(/\b(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = raw.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
  if (m) return `${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  m = raw.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})\b/);
  if (m) return `20${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  return null;
}

function findUuidText(value: any) {
  const text = flat(value);
  return Array.from(new Set((text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig) || []).map((v) => v.toLowerCase())));
}

function dig(obj: any, paths: string[]) {
  for (const path of paths) {
    const parts = path.split('.');
    let cur = obj;
    for (const part of parts) {
      if (!cur || typeof cur !== 'object') { cur = null; break; }
      cur = cur[part];
    }
    if (cur !== undefined && cur !== null && String(cur).trim() !== '') return cur;
  }
  return '';
}

function searchGuidFrom(row: any, orderGuid?: string) {
  const direct = dig(row, [
    'searchGuid', 'searchGUID', 'searchId', 'searchID', 'search_id',
    'guid', 'id', 'resultGuid', 'resultGUID', 'orderSearchGuid', 'orderSearchGUID',
    'componentGuid', 'componentGUID', 'packageSearchGuid',
    'search.guid', 'search.id', 'search.searchGuid',
    '_links.self.href', '_links.result.href', '_links.results.href',
    'links.self.href', 'links.result.href', 'links.results.href'
  ]);

  if (direct) {
    const directText = String(direct).trim();
    const uuid = directText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuid) return uuid[0];
    return directText;
  }

  const uuids = findUuidText(row).filter((uuid) => uuid !== String(orderGuid || '').toLowerCase());
  return uuids[0] || '';
}

function cleanResultText(value: any) {
  return flat(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dateLabelPattern() {
  return `([0-9]{4}[\\/\\-][0-9]{1,2}[\\/\\-][0-9]{1,2}|[0-9]{1,2}[\\/\\-][0-9]{1,2}[\\/\\-][0-9]{2,4})`;
}

function issueLabelIsCloser(context: string, dateValue: string) {
  const lower = String(context || '').toLowerCase();
  const dateIndex = lower.indexOf(String(dateValue || '').toLowerCase());
  const beforeDate = dateIndex >= 0 ? lower.slice(Math.max(0, dateIndex - 180), dateIndex) : lower.slice(0, 320);

  const issue = Math.max(
    beforeDate.lastIndexOf('issue date'),
    beforeDate.lastIndexOf('issued'),
    beforeDate.lastIndexOf('original issue')
  );

  const expire = Math.max(
    beforeDate.lastIndexOf('expiration'),
    beforeDate.lastIndexOf('expiry'),
    beforeDate.lastIndexOf('expires'),
    beforeDate.lastIndexOf('expire'),
    beforeDate.lastIndexOf('exp date'),
    beforeDate.lastIndexOf('exp dt'),
    beforeDate.lastIndexOf('valid until'),
    beforeDate.lastIndexOf('cert exp'),
    beforeDate.lastIndexOf('medical exp')
  );

  return issue >= 0 && issue > expire;
}

function findExpirationDateInText(text: string) {
  const date = dateLabelPattern();
  const patterns = [
    new RegExp(`(?:medical\\s*)?(?:expiration|expiry|expires|expire)\\s*(?:date)?\\s*[:#\\-]?\\s*${date}`, 'i'),
    new RegExp(`(?:med\\s*exp|medical\\s*exp|cert\\s*exp|exp\\.?\\s*date|exp\\.?\\s*dt)\\s*[:#\\-]?\\s*${date}`, 'i'),
    new RegExp(`(?:valid\\s*until|valid\\s*thru|valid\\s*through)\\s*[:#\\-]?\\s*${date}`, 'i'),
    new RegExp(`(?:medical|med\\s*cert|certificate|dot\\s*medical|medical\\s*card|medical\\s*info|medical\\s*information)[\\s\\S]{0,500}?(?:expiration|expiry|expires|expire|exp\\.?\\s*date|exp\\.?\\s*dt|valid\\s*until)\\s*(?:date)?\\s*[:#\\-]?\\s*${date}`, 'i')
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const context = match[0].slice(0, 1000);
      if (issueLabelIsCloser(context, match[1])) continue;
      const d = dateFromText(match[1]);
      if (d) return { date: d, match: context };
    }
  }

  return null;
}

function mvrMedicalAnchors() {
  return [
    'medical information',
    'medical info',
    'medical certificate information',
    'certificate information',
    'medical certificate',
    'medical certification',
    'medical examiner',
    'medical card',
    'medical status',
    'medical expiration',
    'med cert',
    'med info',
    'dot medical',
    'dot med',
    'cdl medical',
    'self certification',
    'self-certification'
  ];
}

function findMedicalSections(text: string) {
  const lower = text.toLowerCase();
  const starts: number[] = [];

  for (const anchor of mvrMedicalAnchors()) {
    let index = lower.indexOf(anchor);
    while (index >= 0) {
      starts.push(index);
      index = lower.indexOf(anchor, index + anchor.length);
    }
  }

  return Array.from(new Set(starts)).sort((a, b) => a - b);
}

function findMedExpire(payload: any) {
  const text = cleanResultText(payload);
  if (!text) return null;

  // New rule:
  // Medical information may appear inside the MVR License Info result.
  // We therefore scan medical subsections inside the full MVR/license text.
  // We still do NOT use the regular driver license expiration date.
  const starts = findMedicalSections(text);

  for (const start of starts) {
    const section = text.slice(start, start + 2400);
    const found = findExpirationDateInText(section);
    if (found?.date) {
      return {
        date: found.date,
        match: found.match,
        extractor: 'mvr-medical-subsection'
      };
    }
  }

  // Secondary fallback:
  // If the matched expiration text itself contains medical/certificate wording,
  // accept it. This still avoids plain License Info expiration.
  const found = findExpirationDateInText(text);
  if (found?.date && /(medical|med\s*cert|med info|certificate information|medical\s*certificate|medical\s*information|dot\s*medical|medical card|medical examiner|medical status|cdl medical|self certification|self-certification)/i.test(found.match)) {
    return {
      date: found.date,
      match: found.match,
      extractor: 'medical-context-fallback'
    };
  }

  return null;
}

function mvrMedicalPreview(payload: any) {
  const text = cleanResultText(payload);
  const starts = findMedicalSections(text);
  if (starts.length) {
    const start = starts[0];
    return text.slice(Math.max(0, start - 120), start + 1400);
  }

  const lower = text.toLowerCase();
  const licenseIndex = lower.indexOf('license info');
  if (licenseIndex >= 0) return text.slice(licenseIndex, licenseIndex + 1800);

  return text.slice(0, 1200);
}

function orderFrom(row: any) {
  return {
    orderGuid: row.orderGuid || row.guid || row.id || '',
    fileNumber: row.fileNumber || row.fileNo || row.orderNumber || '',
    orderStatus: row.orderStatus || row.status || '',
    orderType: row.orderType || row.type || '',
    orderedDate: iso(row.orderedDate || row.orderDate),
    completedDate: iso(row.completedDate),
    applicantName: row.applicantName || row.subjectName || row.name || '',
    clientName: row.clientName || '',
    clientCode: row.clientCode || '',
    productName: row.productName || row.packageName || '',
    requestedBy: row.requestedBy || row.requestor || '',
    searchFlagged: Boolean(row.searchFlagged || row.flagged),
    createdDate: iso(row.createdDate || row.createdAt),
    modifiedDate: iso(row.modifiedDate || row.updatedAt),
    raw: row
  };
}

function searchFrom(row: any, orderGuid?: string) {
  return {
    searchGuid: searchGuidFrom(row, orderGuid),
    label: [row.searchName, row.searchType, row.name, row.type, row.productName, row.providerName, row.description].filter(Boolean).join(' '),
    rawKeys: row && typeof row === 'object' ? Object.keys(row).slice(0, 25) : [],
    rawUuids: findUuidText(row).filter((uuid) => uuid !== String(orderGuid || '').toLowerCase()).slice(0, 10),
    raw: row
  };
}

function isMvr(search: any) {
  return /\bmvr\b|motor vehicle|driving record|driver record|driver license|dl record|dmv/i.test(search.label + ' ' + flat(search.raw));
}

async function proxyGet(proxyPath: string) {
  const e = tazEnv();
  const response = await fetch(`${e.baseUrl}${proxyPath}`, { method: 'GET', headers: { Authorization: `Bearer ${e.proxySecret}`, Accept: 'application/json' } });
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
  if (!response.ok) {
    const msg = payload?.message || payload?.error || raw || `Proxy returned ${response.status}`;
    const err: any = new Error(tazSafe(msg, response.status));
    err.statusCode = err.message === 'Order access could not be verified.' ? 403 : 503;
    throw err;
  }
  return payload;
}


function certPreview(payload: any) {
  const preview = mvrMedicalPreview(payload);
  if (preview) return preview.slice(0, 1400);
  return '';
}

async function tryResultVariant(orderGuid: string, searchGuid: string, resultType: string | null) {
  const e = tazEnv();
  const encodedOrder = encodeURIComponent(orderGuid);
  const encodedSearch = encodeURIComponent(searchGuid);
  const base = `/tazworks/orders/${encodedOrder}/searches/${encodedSearch}/results`;
  const path = resultType
    ? `${base}?resultType=${encodeURIComponent(resultType)}&clientGuid=${encodeURIComponent(e.clientGuid)}`
    : `${base}?clientGuid=${encodeURIComponent(e.clientGuid)}`;
  return proxyGet(path);
}

async function tryOrderLevelVariant(orderGuid: string, resultType: string | null) {
  const e = tazEnv();
  const encodedOrder = encodeURIComponent(orderGuid);
  const base = `/tazworks/orders/${encodedOrder}/results`;
  const path = resultType
    ? `${base}?resultType=${encodeURIComponent(resultType)}&clientGuid=${encodeURIComponent(e.clientGuid)}`
    : `${base}?clientGuid=${encodeURIComponent(e.clientGuid)}`;
  return proxyGet(path);
}


async function pullMvrMed(orderGuid: string, order: any) {
  const e = tazEnv();
  const summary: any = {
    orderGuid,
    fileNumber: order.fileNumber || '',
    searchesPulled: 0,
    mvrSearches: 0,
    fallbackAllSearches: false,
    scannedNonMvrAfterMvr: false,
    searchRowScans: 0,
    resultPulls: 0,
    noSearchGuid: 0,
    resultErrors: [],
    resultVariantsTried: [],
    orderLevelResultTries: [],
    medExpire: null,
    mvrSearchDetails: [],
    scannedSearchDetails: [],
    certificatePreview: '',
    searchRowPreview: ''
  };

  if (!orderGuid) return summary;

  const searchesPayload = await proxyGet(`/tazworks/orders/${encodeURIComponent(orderGuid)}/searches?clientGuid=${encodeURIComponent(e.clientGuid)}`);
  const searches = arr(searchesPayload, 'search').map((row: any) => searchFrom(row, orderGuid));
  summary.searchesPulled = searches.length;

  const mvrs = searches.filter(isMvr);
  summary.mvrSearches = mvrs.length;

  const nonMvrs = searches.filter((s: any) => !mvrs.includes(s));
  const orderedCandidates = mvrs.length ? [...mvrs, ...nonMvrs] : searches;

  summary.fallbackAllSearches = mvrs.length === 0 && searches.length > 0;
  summary.scannedNonMvrAfterMvr = mvrs.length > 0 && nonMvrs.length > 0;

  summary.mvrSearchDetails = mvrs.slice(0, 5).map((s: any) => ({
    searchGuid: s.searchGuid,
    label: s.label,
    rawKeys: s.rawKeys,
    rawUuids: s.rawUuids,
    fallbackCandidate: false
  }));

  summary.scannedSearchDetails = orderedCandidates.slice(0, 8).map((s: any) => ({
    searchGuid: s.searchGuid,
    label: s.label,
    rawKeys: s.rawKeys,
    rawUuids: s.rawUuids,
    isMvrCandidate: mvrs.includes(s),
    fallbackCandidate: !mvrs.includes(s)
  }));

  // New in 12A-16:
  // TazWorks search rows include displayValue. Some dates may appear there,
  // before the result endpoint is even needed.
  for (const s of orderedCandidates) {
    summary.searchRowScans++;

    const rowFound = findMedExpire(s.raw);
    if (!summary.searchRowPreview) {
      const preview = certPreview(s.raw);
      if (preview && /(certificate|medical|expire|expiration|expiry|med cert|dot medical)/i.test(preview)) {
        summary.searchRowPreview = preview.slice(0, 1000);
      }
    }

    if (rowFound?.date) {
      summary.medExpire = rowFound.date;
      summary.searchGuid = s.searchGuid;
      summary.searchLabel = s.label;
      summary.resultTypeUsed = 'search-row-displayValue';
      summary.rawMatch = rowFound.match;
      summary.usedFallbackSearch = !mvrs.includes(s);
      return summary;
    }
  }

  const resultTypes: Array<string | null> = ['EDITOR', null, 'CLIENT', 'HTML', 'RAW', 'JSON', 'FULL'];

  for (const s of orderedCandidates) {
    if (!s.searchGuid) {
      summary.noSearchGuid++;
      continue;
    }

    for (const resultType of resultTypes) {
      try {
        summary.resultPulls++;
        summary.resultVariantsTried.push({ searchGuid: s.searchGuid, label: s.label, resultType: resultType || 'none' });

        const result = await tryResultVariant(orderGuid, s.searchGuid, resultType);
        const found = findMedExpire(result);

        if (!summary.certificatePreview) {
          const preview = certPreview(result);
          if (preview && /(certificate|medical|expire|expiration|expiry|med cert|dot medical)/i.test(preview)) {
            summary.certificatePreview = preview.slice(0, 1000);
          }
        }

        if (found?.date) {
          summary.medExpire = found.date;
          summary.searchGuid = s.searchGuid;
          summary.searchLabel = s.label;
          summary.resultTypeUsed = resultType || 'none';
          summary.rawMatch = found.match;
          summary.usedFallbackSearch = !mvrs.includes(s);
          return summary;
        }
      } catch (err: any) {
        summary.resultErrors.push({
          searchGuid: s.searchGuid,
          label: s.label,
          resultType: resultType || 'none',
          message: String(err?.message || err)
        });
      }
    }
  }

  for (const resultType of resultTypes) {
    try {
      summary.orderLevelResultTries.push({ resultType: resultType || 'none' });
      const result = await tryOrderLevelVariant(orderGuid, resultType);
      const found = findMedExpire(result);

      if (!summary.certificatePreview) {
        const preview = certPreview(result);
        if (preview && /(certificate|medical|expire|expiration|expiry|med cert|dot medical)/i.test(preview)) {
          summary.certificatePreview = preview.slice(0, 1000);
        }
      }

      if (found?.date) {
        summary.medExpire = found.date;
        summary.searchGuid = '';
        summary.searchLabel = 'order-level-result';
        summary.resultTypeUsed = resultType || 'none';
        summary.rawMatch = found.match;
        summary.usedOrderLevelResult = true;
        return summary;
      }
    } catch (err: any) {
      summary.resultErrors.push({
        searchGuid: '',
        label: 'order-level-result',
        resultType: resultType || 'none',
        message: String(err?.message || err)
      });
    }
  }

  return summary;
}


// PHASE12A17_MVR_TEST_PAGE START
function safePreview(value: any, max = 120000) {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return text.length > max ? text.slice(0, max) + '\n\n...[truncated]' : text;
  } catch {
    const text = String(value || '');
    return text.length > max ? text.slice(0, max) + '\n\n...[truncated]' : text;
  }
}

function diagnosticDatesFromText(text: string) {
  const clean = String(text || '');
  const datePattern = /([0-9]{4}[\/\-][0-9]{1,2}[\/\-][0-9]{1,2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/g;
  const out: any[] = [];
  let match: RegExpExecArray | null;
  while ((match = datePattern.exec(clean)) !== null && out.length < 75) {
    const start = Math.max(0, match.index - 180);
    const end = Math.min(clean.length, match.index + match[0].length + 180);
    const context = clean.slice(start, end);
    out.push({
      dateText: match[1],
      normalized: dateFromText(match[1]),
      context,
      looksLikeMedical: /(medical|med\s*cert|med info|certificate information|medical\s*certificate|medical\s*information|dot\s*medical|medical card|medical examiner|medical status|cdl medical|self certification|self-certification)/i.test(context),
      looksLikeLicense: /(license info|license type|driver license|class description|commercial lic|lic type)/i.test(context),
      hasExpirationLabel: /(expiration|expiry|expires|expire|exp\.?\s*date|valid until|cert exp|medical exp)/i.test(context),
      hasIssueLabel: /(issue date|issued|original issue)/i.test(context),
      wouldBeRejectedAsIssueDate: issueLabelIsCloser(context, match[1])
    });
  }
  return out;
}

async function tazworksMvrTest(req: any, res: any, user: any) {
  if (req.method !== 'GET') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  if (!requireAdmin(user, res)) return;

  const url = new URL(req.url || '/', 'https://local.test');
  const fileNumber = String(url.searchParams.get('fileNumber') || '6328').trim();
  const maxPages = Math.min(20, Math.max(1, Number(url.searchParams.get('pages') || 10)));
  const resultTypes: Array<string | null> = ['EDITOR', null];

  const e = tazEnv();
  const pages: any[] = [];
  const allOrders: any[] = [];
  let foundOrder: any = null;

  for (let page = 0; page < maxPages; page++) {
    const payload = await proxyGet(`/tazworks/orders?page=${page}&size=10&clientGuid=${encodeURIComponent(e.clientGuid)}`);
    const list = arr(payload);
    pages.push({
      page,
      arrayCount: list.length,
      topLevelKeys: payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 30) : [],
      fileNumbers: list.map((row: any) => String(row.fileNumber || row.fileNo || row.orderNumber || '')).filter(Boolean)
    });

    for (const row of list) {
      const normalized = orderFrom(row);
      allOrders.push({ normalized, raw: row });
      if (String(normalized.fileNumber) === fileNumber) {
        foundOrder = { normalized, raw: row };
      }
    }

    if (foundOrder || list.length < 10) break;
  }

  if (!foundOrder) {
    return json(res, 404, {
      status: 'error',
      message: `File number ${fileNumber} was not found in the first ${maxPages} page(s).`,
      fileNumber,
      pages,
      ordersSeen: allOrders.map((item) => item.normalized.fileNumber).filter(Boolean)
    });
  }

  const orderGuid = String(foundOrder.normalized.orderGuid || '');
  const searchesPayload = await proxyGet(`/tazworks/orders/${encodeURIComponent(orderGuid)}/searches?clientGuid=${encodeURIComponent(e.clientGuid)}`);
  const rawSearches = arr(searchesPayload, 'search');
  const searches = rawSearches.map((row: any) => searchFrom(row, orderGuid));

  const searchResults: any[] = [];

  for (let i = 0; i < searches.length; i++) {
    const search = searches[i];
    const rawSearch = rawSearches[i];
    const searchRowText = cleanResultText(rawSearch);
    const searchRowFound = findMedExpire(rawSearch);

    const item: any = {
      index: i,
      searchGuid: search.searchGuid,
      label: search.label,
      isMvr: isMvr(search),
      rawKeys: search.rawKeys,
      rawUuids: search.rawUuids,
      rawSearch,
      searchRowCleanText: safePreview(searchRowText, 40000),
      searchRowCertificatePreview: certPreview(rawSearch),
      searchRowDateDiagnostics: diagnosticDatesFromText(searchRowText),
      searchRowMedExpireFound: searchRowFound,
      resultVariants: []
    };

    if (!search.searchGuid) {
      item.resultVariants.push({ resultType: 'none', ok: false, error: 'No searchGuid found for this search row.' });
      searchResults.push(item);
      continue;
    }

    for (const resultType of resultTypes) {
      try {
        const result = await tryResultVariant(orderGuid, search.searchGuid, resultType);
        const cleanText = cleanResultText(result);
        const found = findMedExpire(result);

        item.resultVariants.push({
          resultType: resultType || 'none',
          ok: true,
          topLevelKeys: result && typeof result === 'object' ? Object.keys(result).slice(0, 50) : [],
          medExpireFound: found,
          certificatePreview: certPreview(result),
          cleanTextPreview: safePreview(cleanText, 80000),
          dateDiagnostics: diagnosticDatesFromText(cleanText),
          rawResult: safePreview(result, 120000)
        });
      } catch (error: any) {
        item.resultVariants.push({
          resultType: resultType || 'none',
          ok: false,
          error: String(error?.message || error)
        });
      }
    }

    searchResults.push(item);
  }

  const allFoundDates = searchResults.flatMap((search) => {
    const found: any[] = [];
    if (search.searchRowMedExpireFound?.date) found.push({ source: 'search-row', searchGuid: search.searchGuid, value: search.searchRowMedExpireFound });
    for (const variant of search.resultVariants || []) {
      if (variant.medExpireFound?.date) found.push({ source: `result-${variant.resultType}`, searchGuid: search.searchGuid, value: variant.medExpireFound });
    }
    return found;
  });

  return json(res, 200, {
    status: 'ok',
    fileNumber,
    orderGuid,
    pages,
    order: foundOrder,
    searchesPulled: searches.length,
    searches: searchResults,
    allFoundMedicalExpirationDates: allFoundDates,
    notes: [
      'This test page shows the exact order, search rows, and result payloads pulled through the server-side proxy.',
      'License expiration dates should not be saved into Med Expire.',
      'Med Expire should only come from medical/certificate related expiration labels.'
    ]
  });
}
// PHASE12A17_MVR_TEST_PAGE END



async function tazworksSyncClear(req: any, res: any, user: any) {
  if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  if (!requireAdmin(user, res)) return;

  const body = await readBody(req);
  const keepLatest = Math.max(0, Math.min(10, Number(body.keepLatest || 0)));

  if (keepLatest > 0) {
    const result = await query(
      `delete from tazworks_sync_runs
       where id not in (
         select id from tazworks_sync_runs
         order by started_at desc
         limit $1
       )`,
      [keepLatest]
    );

    return json(res, 200, {
      status: 'ok',
      cleared: result.rowCount || 0,
      keepLatest,
      message: `Sync log cleared. Kept the latest ${keepLatest} run(s).`
    });
  }

  const result = await query('delete from tazworks_sync_runs');

  return json(res, 200, {
    status: 'ok',
    cleared: result.rowCount || 0,
    keepLatest: 0,
    message: 'Sync log cleared.'
  });
}

async function tazworksSyncRuns(req: any, res: any, user: any) {
  if (req.method !== 'GET') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  if (!requireAdmin(user, res)) return;
  const result = await query('select * from tazworks_sync_runs order by started_at desc limit 1000');
  return json(res, 200, { status: 'ok', runs: result.rows });
}

async function tazworksSyncRun(req: any, res: any, user: any) {
  if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  if (!requireAdmin(user, res)) return;

  const companyId = Number(user.companyId || 1);
  const runInsert = await query('insert into tazworks_sync_runs (status, triggered_by, message) values ($1,$2,$3) returning id', ['running', user.username || user.displayName || 'admin', 'Manual sync started']);
  const runId = runInsert.rows[0].id;

  let ordersPulled = 0, applicantsUpserted = 0, safetyReportsUpdated = 0, medExpireUpdated = 0, medExpireCleared = 0, mvrSearchesChecked = 0, errorsCount = 0;
  const errors: string[] = [], pageSummaries: any[] = [], mvrSamples: any[] = [];
  const dedupe = new Map<string, any>();

  try {
    const e = tazEnv();

    for (let page = 0; page < 5; page++) {
      const payload = await proxyGet(`/tazworks/orders?page=${page}&size=10&clientGuid=${encodeURIComponent(e.clientGuid)}`);
      const list = arr(payload);
      pageSummaries.push({ page, arrayCount: list.length, topLevelKeys: payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 20) : [] });

      for (const row of list) {
        const o = orderFrom(row);
        const key = String(o.orderGuid || o.fileNumber || JSON.stringify(row).slice(0, 100));
        if (!dedupe.has(key)) dedupe.set(key, o);
      }

      if (list.length < 10) break;
    }

    const orders = Array.from(dedupe.values()).filter((o: any) => o.orderGuid || o.fileNumber);
    ordersPulled = orders.length;

    for (const o of orders) {
      try {
        let medExpire: string | null = null;

        if (o.orderGuid) {
          try {
            const mvr = await pullMvrMed(o.orderGuid, o);
            mvrSamples.push(mvr);
            mvrSearchesChecked += Number(mvr.mvrSearches || 0);
            if (mvr.medExpire) medExpire = mvr.medExpire;
          } catch (err: any) {
            errors.push(`MVR check failed for ${o.fileNumber || o.orderGuid}: ${String(err?.message || err)}`);
          }
        }

        await query(
          `insert into tazworks_order_cache (company_id, order_guid, file_number, applicant_name, order_status, order_type, ordered_date, completed_date, client_name, client_code, product_name, requested_by, search_flagged, source_modified_date, raw_order, last_seen_at, last_sync_run_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),$16)
           on conflict (order_guid) do update set company_id=excluded.company_id,file_number=excluded.file_number,applicant_name=excluded.applicant_name,order_status=excluded.order_status,order_type=excluded.order_type,ordered_date=excluded.ordered_date,completed_date=excluded.completed_date,client_name=excluded.client_name,client_code=excluded.client_code,product_name=excluded.product_name,requested_by=excluded.requested_by,search_flagged=excluded.search_flagged,source_modified_date=excluded.source_modified_date,raw_order=excluded.raw_order,last_seen_at=now(),last_sync_run_id=excluded.last_sync_run_id`,
          [companyId, o.orderGuid || `file-${o.fileNumber}`, o.fileNumber || null, o.applicantName || null, o.orderStatus || null, o.orderType || null, o.orderedDate, o.completedDate, o.clientName || null, o.clientCode || null, o.productName || null, o.requestedBy || null, Boolean(o.searchFlagged), o.modifiedDate || o.createdDate || null, JSON.stringify(o.raw || {}), runId]
        );

        if (o.fileNumber) {
          const existingApplicant = await query(
            'select "medExpire", "medExpireOverridden" from applicants where "companyId"=$1 and "fileNumber"=$2 limit 1',
            [companyId, String(o.fileNumber)]
          );
          const existingMedExpire = existingApplicant.rows[0]?.medExpire || null;
          const existingOverridden = Boolean(existingApplicant.rows[0]?.medExpireOverridden);

          await query(
            `insert into applicants ("companyId","fileNumber","applicantName","orderDate","monitorStatus","mvrStatus","medExpire","medExpireOverridden",notes)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             on conflict ("fileNumber","companyId") do update set
               "applicantName"=case when excluded."applicantName"<>'' then excluded."applicantName" else applicants."applicantName" end,
               "orderDate"=coalesce(excluded."orderDate",applicants."orderDate"),
               "mvrStatus"=coalesce(excluded."mvrStatus",applicants."mvrStatus"),
               "medExpire"=case
                 when applicants."medExpireOverridden"=true then applicants."medExpire"
                 when excluded."medExpire" is not null then excluded."medExpire"
                 else null
               end,
               "updatedAt"=now()`,
            [companyId, String(o.fileNumber), String(o.applicantName || 'REVIEW NAME NEEDED'), dateOnly(o.orderedDate || o.createdDate), 'Off', String(o.orderStatus || ''), medExpire, false, '']
          );

          applicantsUpserted++;
          if (medExpire) medExpireUpdated++;
          else if (existingMedExpire && !existingOverridden) medExpireCleared++;
          const safetyUpdate = await query(
            `update safety_reports set "applicantName"=case when $1<>'' then $1 else "applicantName" end,"updatedAt"=now() where "companyId"=$2 and "fileNumber"=$3 returning id`,
            [String(o.applicantName || ''), companyId, String(o.fileNumber)]
          );
          safetyReportsUpdated += safetyUpdate.rowCount || 0;
        }
      } catch (err: any) {
        errorsCount++;
        errors.push(String(err?.message || err));
      }
    }

    const message = `Sync completed. Pulled ${ordersPulled} orders. Updated ${medExpireUpdated} medical expiration date(s). Cleared ${medExpireCleared} stale medical date(s).`;
    await query(
      'update tazworks_sync_runs set status=$1, completed_at=now(), orders_pulled=$2, applicants_upserted=$3, safety_reports_updated=$4, errors_count=$5, message=$6, raw_summary=$7 where id=$8',
      [errorsCount ? 'completed_with_errors' : 'completed', ordersPulled, applicantsUpserted, safetyReportsUpdated, errorsCount, message, JSON.stringify({ pages: pageSummaries, mvrSearchesChecked, medExpireUpdated, medExpireCleared, mvrSamples: mvrSamples.slice(0, 20), errors: errors.slice(0, 10) }), runId]
    );

    return json(res, 200, { status: 'ok', runId, ordersPulled, applicantsUpserted, safetyReportsUpdated, medExpireUpdated, medExpireCleared, mvrSearchesChecked, errorsCount, message, pages: pageSummaries });
  } catch (error: any) {
    const safe = error?.message || 'The order connection is currently unavailable.';
    await query('update tazworks_sync_runs set status=$1, completed_at=now(), errors_count=$2, message=$3, raw_summary=$4 where id=$5', ['failed', errorsCount + 1, safe, JSON.stringify({ pages: pageSummaries, mvrSearchesChecked, medExpireUpdated, medExpireCleared, mvrSamples: mvrSamples.slice(0, 20), errors: [safe, ...errors].slice(0, 10) }), runId]);
    return json(res, error?.statusCode || 503, { status: 'error', message: safe, runId });
  }
}

// PHASE12A52_ADMIN_INVOICES START
function invoiceDateOnly(value: any) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
function invoiceMonthStart(value?: any) {
  const raw = String(value || '').trim();
  const d = raw ? new Date(raw.length === 7 ? `${raw}-01T00:00:00Z` : raw) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
function invoiceMonthLabel(value: any) {
  const raw = invoiceMonthStart(value);
  const [year, month] = raw.split('-').map(Number);
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${names[(month || 1) - 1]} ${year}`;
}
function invoiceDefaultNumber(companyId: number, monthStart: string) {
  const [year, month] = monthStart.split('-');
  return `CM${String(companyId || 1).padStart(2, '0')}${String(year).slice(-2)}${String(month).padStart(2, '0')}`;
}
function moneyNumber(value: any) {
  const n = Number(value || 0);
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
function moneyText(value: any) {
  return `$${moneyNumber(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function invoiceTotals(quantity: any, unitPrice: any, salesTaxRate: any) {
  const qty = Math.max(0, Math.round(Number(quantity || 0)));
  const price = moneyNumber(unitPrice);
  const taxRate = Number(salesTaxRate || 0);
  const subtotal = moneyNumber(qty * price);
  const salesTax = moneyNumber(subtotal * (Number.isFinite(taxRate) ? taxRate : 0));
  const total = moneyNumber(subtotal + salesTax);
  return { quantity: qty, unitPrice: price, salesTaxRate: Number.isFinite(taxRate) ? taxRate : 0, subtotal, salesTax, total };
}
async function invoiceCurrentMvrCount(companyId: number) {
  const result = await query(
    `select count(*)::int as count
     from applicants
     where "companyId"=$1
       and coalesce("terminated", false)=false
       and lower(trim(coalesce("mvrStatus", '')))='on'`,
    [companyId]
  );
  return Number(result.rows[0]?.count || 0);
}
function invoiceSelectSql() {
  return `select id, "companyId", "invoiceNumber", "invoiceMonth", "invoiceDate", "dueDate", description, "serviceMonthLabel",
                 quantity, "unitPrice", "salesTaxRate", subtotal, "salesTax", total, status,
                 "billToName", "billToAddress1", "billToAddress2", "billToPhone", notes,
                 "approvedAt", "createdAt", "updatedAt"
          from invoices`;
}
async function getInvoiceById(id: number, companyId: number) {
  const result = await query(`${invoiceSelectSql()} where id=$1 and "companyId"=$2 limit 1`, [id, companyId]);
  return result.rows[0] || null;
}
async function ensureMonthlyInvoice(companyId: number, monthInput?: any) {
  const monthStart = invoiceMonthStart(monthInput);
  const existing = await query(`${invoiceSelectSql()} where "companyId"=$1 and "invoiceMonth"=$2 limit 1`, [companyId, monthStart]);
  if (existing.rows[0]) return existing.rows[0];

  const quantity = await invoiceCurrentMvrCount(companyId);
  const totals = invoiceTotals(quantity, 1.00, 0.0825);
  const invoiceDate = new Date().toISOString().slice(0, 10);
  const due = new Date(`${invoiceDate}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 30);
  const dueDate = due.toISOString().slice(0, 10);

  const result = await query(
    `insert into invoices (
      "companyId", "invoiceNumber", "invoiceMonth", "invoiceDate", "dueDate", description, "serviceMonthLabel",
      quantity, "unitPrice", "salesTaxRate", subtotal, "salesTax", total, status,
      "billToName", "billToAddress1", "billToAddress2", "billToPhone", notes
    ) values (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12,$13,'Draft',
      $14,$15,$16,$17,$18
    )
    returning *`,
    [
      companyId,
      invoiceDefaultNumber(companyId, monthStart),
      monthStart,
      invoiceDate,
      dueDate,
      'MVR Continuous Monitoring',
      invoiceMonthLabel(monthStart),
      totals.quantity,
      totals.unitPrice,
      totals.salesTaxRate,
      totals.subtotal,
      totals.salesTax,
      totals.total,
      'Driver Pipeline Company',
      '1200 N Union Bower Rd.',
      'Irving, TX 75061-5828',
      '214-535-9174',
      ''
    ]
  );
  return result.rows[0];
}
function invoiceStatus(value: any) {
  const raw = String(value || '').trim();
  return raw === 'Approved' ? 'Approved' : 'Draft';
}
async function invoices(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;
  const companyId = requestedCompanyId(req, user);

  if (req.method === 'GET') {
    await ensureMonthlyInvoice(companyId);
    const list = await query(`${invoiceSelectSql()} where "companyId"=$1 order by "invoiceMonth" desc, id desc limit 36`, [companyId]);
    const currentCount = await invoiceCurrentMvrCount(companyId);
    return json(res, 200, { status: 'ok', currentMvrOnCount: currentCount, invoices: list.rows });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const action = String(body.action || 'create-current').trim();

    if (action === 'create-current' || action === 'create-month') {
      const invoice = await ensureMonthlyInvoice(companyId, body.invoiceMonth);
      return json(res, 200, { status: 'ok', invoice });
    }

    if (action === 'recalculate-count') {
      const id = Number(body.id || 0);
      const invoice = await getInvoiceById(id, companyId);
      if (!invoice) return json(res, 404, { status: 'error', message: 'Invoice not found' });
      if (invoice.status === 'Approved') return json(res, 400, { status: 'error', message: 'Approved invoices cannot be recalculated. Create a new invoice or edit before approval.' });

      const quantity = await invoiceCurrentMvrCount(companyId);
      const totals = invoiceTotals(quantity, invoice.unitPrice, invoice.salesTaxRate);
      const result = await query(
        `update invoices set quantity=$1, subtotal=$2, "salesTax"=$3, total=$4, "updatedAt"=now()
         where id=$5 and "companyId"=$6 returning *`,
        [totals.quantity, totals.subtotal, totals.salesTax, totals.total, id, companyId]
      );
      return json(res, 200, { status: 'ok', invoice: result.rows[0] });
    }

    if (action === 'approve') {
      const id = Number(body.id || 0);
      const invoice = await getInvoiceById(id, companyId);
      if (!invoice) return json(res, 404, { status: 'error', message: 'Invoice not found' });

      const result = await query(
        `update invoices
         set status='Approved', "approvedAt"=coalesce("approvedAt", now()), "updatedAt"=now()
         where id=$1 and "companyId"=$2 returning *`,
        [id, companyId]
      );
      return json(res, 200, { status: 'ok', invoice: result.rows[0] });
    }

    if (action === 'reopen') {
      const id = Number(body.id || 0);
      const invoice = await getInvoiceById(id, companyId);
      if (!invoice) return json(res, 404, { status: 'error', message: 'Invoice not found' });

      const result = await query(
        `update invoices
         set status='Draft', "approvedAt"=null, "updatedAt"=now()
         where id=$1 and "companyId"=$2 returning *`,
        [id, companyId]
      );
      return json(res, 200, { status: 'ok', invoice: result.rows[0] });
    }

    return json(res, 400, { status: 'error', message: 'Unknown invoice action' });
  }

  if (req.method === 'PATCH') {
    const body = await readBody(req);
    const id = Number(body.id || 0);
    const invoice = await getInvoiceById(id, companyId);
    if (!invoice) return json(res, 404, { status: 'error', message: 'Invoice not found' });
    if (invoice.status === 'Approved') return json(res, 400, { status: 'error', message: 'Approved invoices are locked. Reopen the invoice before editing.' });

    const quantity = body.quantity === undefined ? invoice.quantity : Number(body.quantity || 0);
    const unitPrice = body.unitPrice === undefined ? invoice.unitPrice : Number(body.unitPrice || 0);
    const salesTaxRate = body.salesTaxRate === undefined ? invoice.salesTaxRate : Number(body.salesTaxRate || 0);
    const totals = invoiceTotals(quantity, unitPrice, salesTaxRate);

    const result = await query(
      `update invoices set
        "invoiceNumber"=$1,
        "invoiceDate"=$2,
        "dueDate"=$3,
        description=$4,
        "serviceMonthLabel"=$5,
        quantity=$6,
        "unitPrice"=$7,
        "salesTaxRate"=$8,
        subtotal=$9,
        "salesTax"=$10,
        total=$11,
        "billToName"=$12,
        "billToAddress1"=$13,
        "billToAddress2"=$14,
        "billToPhone"=$15,
        notes=$16,
        status=$17,
        "updatedAt"=now()
       where id=$18 and "companyId"=$19
       returning *`,
      [
        String(body.invoiceNumber ?? invoice.invoiceNumber ?? '').trim(),
        invoiceDateOnly(body.invoiceDate ?? invoice.invoiceDate) || new Date().toISOString().slice(0, 10),
        invoiceDateOnly(body.dueDate ?? invoice.dueDate) || invoiceDateOnly(invoice.dueDate),
        String(body.description ?? invoice.description ?? 'MVR Continuous Monitoring').trim(),
        String(body.serviceMonthLabel ?? invoice.serviceMonthLabel ?? '').trim(),
        totals.quantity,
        totals.unitPrice,
        totals.salesTaxRate,
        totals.subtotal,
        totals.salesTax,
        totals.total,
        String(body.billToName ?? invoice.billToName ?? '').trim(),
        String(body.billToAddress1 ?? invoice.billToAddress1 ?? '').trim(),
        String(body.billToAddress2 ?? invoice.billToAddress2 ?? '').trim(),
        String(body.billToPhone ?? invoice.billToPhone ?? '').trim(),
        String(body.notes ?? invoice.notes ?? '').trim(),
        invoiceStatus(body.status ?? invoice.status),
        id,
        companyId
      ]
    );
    return json(res, 200, { status: 'ok', invoice: result.rows[0] });
  }

  return json(res, 405, { status: 'error', message: 'Method not allowed' });
}
function pdfText(value: any) {
  return String(value ?? '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}
function drawRight(page: any, textValue: string, xRight: number, y: number, options: any) {
  const width = options.font.widthOfTextAtSize(textValue, options.size);
  page.drawText(textValue, { ...options, x: xRight - width, y });
}
async function invoicePdf(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;
  const companyId = requestedCompanyId(req, user);
  const url = new URL(req.url || '/', 'https://local.test');
  const id = Number(url.searchParams.get('id') || 0);
  const invoice = await getInvoiceById(id, companyId);
  if (!invoice) return json(res, 404, { status: 'error', message: 'Invoice not found' });
  if (invoice.status !== 'Approved') return json(res, 400, { status: 'error', message: 'Invoice must be approved before PDF download' });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(0.13, 0.20, 0.58);
  const green = rgb(0.24, 0.78, 0.20);
  const dark = rgb(0.05, 0.06, 0.10);
  const gray = rgb(0.35, 0.38, 0.42);
  const light = rgb(0.94, 0.95, 0.97);

  const left = 42;
  const right = 570;
  let y = 742;

  page.drawRectangle({ x: 0, y: 784, width: 612, height: 8, color: blue });

  page.drawText('Make Payable To:', { x: left, y, size: 16, font: bold, color: dark });
  y -= 22;
  page.drawText('Saffhire', { x: left, y, size: 13, font: bold, color: dark });
  y -= 17;
  page.drawText('3245 Main St. Suite 235-200', { x: left, y, size: 12, font, color: dark });
  y -= 16;
  page.drawText('Frisco, TX 75034', { x: left, y, size: 12, font, color: dark });
  y -= 16;
  page.drawText('Phone: 888-250-1033', { x: left, y, size: 12, font, color: dark });

  page.drawText('Invoice', { x: 264, y: 742, size: 18, font: bold, color: dark });
  page.drawText('SAFF', { x: 404, y: 744, size: 24, font: bold, color: blue });
  page.drawText('HIRE', { x: 465, y: 744, size: 24, font: bold, color: green });
  page.drawText('BACKGROUND SCREENING', { x: 404, y: 728, size: 9, font: bold, color: blue });

  y = 610;
  page.drawText('Bill To:', { x: left, y, size: 14, font: bold, color: gray });
  y -= 20;
  page.drawText(pdfText(invoice.billToName || 'Driver Pipeline Company'), { x: left, y, size: 12, font: bold, color: dark });
  y -= 17;
  page.drawText(pdfText(invoice.billToAddress1 || ''), { x: left, y, size: 12, font, color: dark });
  y -= 17;
  page.drawText(pdfText(invoice.billToAddress2 || ''), { x: left, y, size: 12, font, color: dark });
  if (invoice.billToPhone) {
    y -= 17;
    page.drawText(pdfText(invoice.billToPhone), { x: left, y, size: 12, font, color: dark });
  }

  const labelX = 398;
  const valueX = 560;
  y = 610;
  page.drawText('Invoice #', { x: labelX, y, size: 14, font: bold, color: gray });
  drawRight(page, pdfText(invoice.invoiceNumber), valueX, y, { size: 14, font: bold, color: gray });
  y -= 22;
  page.drawText('Invoice Date:', { x: labelX, y, size: 12, font, color: dark });
  drawRight(page, invoiceDateOnly(invoice.invoiceDate), valueX, y, { size: 12, font, color: dark });
  y -= 22;
  page.drawText('Customer #:', { x: labelX, y, size: 12, font, color: dark });
  drawRight(page, `Company ${invoice.companyId}`, valueX, y, { size: 12, font, color: dark });
  y -= 22;
  page.drawText('Representative:', { x: labelX, y, size: 12, font, color: dark });
  drawRight(page, 'Robert Krebsbach', valueX, y, { size: 12, font, color: dark });
  y -= 22;
  page.drawText('Date Due:', { x: labelX, y, size: 12, font, color: dark });
  drawRight(page, invoiceDateOnly(invoice.dueDate), valueX, y, { size: 12, font, color: dark });

  y = 456;
  page.drawRectangle({ x: left, y, width: right - left, height: 18, color: blue });
  y -= 32;

  page.drawText('Description', { x: left, y, size: 13, font: bold, color: dark });
  page.drawText('Qty', { x: 392, y, size: 13, font: bold, color: dark });
  page.drawText('Unit price', { x: 452, y, size: 13, font: bold, color: dark });
  page.drawText('Total price', { x: 522, y, size: 13, font: bold, color: dark });

  y -= 20;
  page.drawRectangle({ x: left, y: y - 6, width: right - left, height: 22, color: light });
  page.drawText(pdfText(invoice.description || 'MVR Continuous Monitoring'), { x: left + 4, y, size: 12, font, color: dark });
  page.drawText(String(invoice.quantity || 0), { x: 395, y, size: 12, font, color: gray });
  drawRight(page, moneyText(invoice.unitPrice), 512, y, { size: 12, font, color: gray });
  drawRight(page, moneyText(invoice.subtotal), right - 4, y, { size: 12, font, color: gray });

  y -= 22;
  page.drawText(pdfText(invoice.serviceMonthLabel || invoiceMonthLabel(invoice.invoiceMonth)), { x: left + 4, y, size: 12, font, color: dark });

  y = 224;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: gray });

  y -= 36;
  page.drawText('Sales Tax', { x: 452, y, size: 12, font, color: dark });
  drawRight(page, moneyText(invoice.salesTax), right - 4, y, { size: 12, font: bold, color: dark });
  y -= 20;
  page.drawLine({ start: { x: 416, y: y + 12 }, end: { x: right, y: y + 12 }, thickness: 0.5, color: gray });
  page.drawText('Total Amount Due:', { x: 430, y, size: 12, font, color: dark });
  drawRight(page, moneyText(invoice.total), right - 4, y, { size: 12, font: bold, color: dark });

  y = 104;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: dark });
  y -= 28;
  page.drawText('Terms: Upon Invoicing', { x: 258, y, size: 10, font, color: dark });
  y -= 26;
  page.drawText('All Discrepancies Must Be Brought To Our Attention Within 30 Days.', { x: 156, y, size: 10, font, color: dark });
  y -= 14;
  page.drawText("All Late Fees, Collection Costs, And Attorney's Fees May Be Added To Past Due Accounts.", { x: 112, y, size: 10, font, color: dark });

  const bytes = await pdfDoc.save();
  const safeNumber = pdfText(invoice.invoiceNumber || id).replace(/[^a-zA-Z0-9_-]/g, '') || `invoice-${id}`;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeNumber}.pdf"`);
  res.end(Buffer.from(bytes));
}
// PHASE12A52_ADMIN_INVOICES END


// PHASE12A11_TAZWORKS_SYNC END


export default async function handler(req: any, res: any) {
  const route = getRoute(req);
  try {
    const clientAuthResult = await clientAuth(req, res, route);
    if (clientAuthResult !== false) return;
    const authResult = await auth(req, res, route);
    if (authResult !== false) return;
    const user = await requireUser(req, res);
    if (!user) return;
    if (route === 'companies') return companies(req, res, user);
    if (route === 'applicants') return applicants(req, res, user);
    if (route === 'safety-reports') return safetyReports(req, res, user);
    if (route === 'import-safety-reports') return importSafetyReports(req, res, user);
    if (route === 'users') return users(req, res, user);
    if (route === 'notification-emails') return notificationEmails(req, res, user);
    if (route === 'import-applicants') return importApplicants(req, res, user);
    if (route === 'change-password') return changePassword(req, res, user);
    if (route === 'tazworks-sync/run') return tazworksSyncRun(req, res, user);
    if (route === 'tazworks-sync/runs') return tazworksSyncRuns(req, res, user);
    if (route === 'tazworks-sync/clear') return tazworksSyncClear(req, res, user);
    if (route === 'tazworks-mvr-test') return tazworksMvrTest(req, res, user);
    if (route === 'client-applicant') return clientApplicantUpdate(req, res, user);
    if (route === 'client-dashboard') return clientDashboard(req, res, user);
    if (route === 'client-users') return clientUsers(req, res, user);
    if (route === 'client-safety-pdf') return clientSafetyPdf(req, res, user);
    if (route === 'invoices') return invoices(req, res, user);
    if (route === 'invoices/pdf') return invoicePdf(req, res, user);
    if (route === 'system-check') return systemCheck(req, res, user);
    return json(res, 404, { status: 'error', message: `Route not found: ${route}` });
  } catch (error: any) {
    return json(res, 500, { status: 'error', message: `API ${route} failed: ${errorMessage(error)}` });
  }
}