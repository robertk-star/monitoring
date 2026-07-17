import pg from 'pg';
import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
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
  'dotPriorEmployerReportedViolation', 'dotCompletedReturnToDutyProcess',
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
  'dotPriorEmployerReportedViolation', 'dotCompletedReturnToDutyProcess',
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
  if (req.method === 'PATCH') { const body = await readBody(req); const id = Number(body.id); if (!id) return json(res, 400, { status: 'error', message: 'Applicant id is required' }); const current = await query('select * from applicants where id=$1 and "companyId"=$2 limit 1', [id, companyId]); if (!current.rows[0]) return json(res, 404, { status: 'error', message: 'Applicant not found' }); const monitorStatus = normalizeMonitorStatus(body.monitorStatus ?? current.rows[0].monitorStatus); const medExpire = body.medExpire ?? current.rows[0].medExpire; const notes = body.notes ?? current.rows[0].notes; const terminated = body.terminated === undefined ? Boolean(current.rows[0].terminated) : asBool(body.terminated); await logMonitoringOnOffChange(companyId, current.rows[0], monitorStatus, user); const result = await query('update applicants set "monitorStatus"=$1, "medExpire"=$2, "medExpireOverridden"=$3, notes=$4, "terminated"=$5, "updatedAt"=now() where id=$6 and "companyId"=$7 returning id, "fileNumber", "applicantName" as name, "orderDate", "monitorStatus", "mvrStatus", "medExpire", "terminated", notes', [monitorStatus, medExpire || null, Boolean(medExpire), String(notes || ''), terminated, id, companyId]); return json(res, 200, { status: 'ok', applicant: result.rows[0] }); }
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


// PHASE12A79_EMAIL_TEMPLATE_SETTINGS START
function emailTemplateType(value: any) {
  const raw = String(value || 'fax').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return raw || 'fax';
}

function renderTemplateText(input: any, report: any, extra: any = {}) {
  const applicantName = pdfClean(report?.applicantName) || '';
  const fileNumber = pdfClean(report?.fileNumber) || '';
  const previousEmployer = pdfClean(report?.prevEmployerName) || '';
  const prospectiveEmployer = pdfClean(report?.employerName) || '';
  const recipientName = pdfClean(extra?.recipientName) || previousEmployer;
  const faxNumber = pdfClean(extra?.faxNumber) || '';
  const today = new Date().toISOString().slice(0, 10);
  const values: Record<string, string> = {
    applicantName,
    applicant: applicantName,
    fileNumber,
    previousEmployer,
    prevEmployer: previousEmployer,
    employer: previousEmployer,
    prospectiveEmployer,
    recipientName,
    recipient: recipientName,
    faxNumber,
    today,
    date: today,
  };
  return String(input || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, key) => values[String(key)] ?? '');
}

async function emailTemplates(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;
  const url = new URL(req.url || '/', 'https://local.test');
  const companyId = requestedCompanyId(req, user);
  const type = emailTemplateType(url.searchParams.get('type') || 'fax');

  if (req.method === 'GET') {
    const result = await query(
      'select id, "companyId", type, name, subject, body, "isActive", "createdAt", "updatedAt" from email_templates where "companyId"=$1 and type=$2 order by name asc, id asc',
      [companyId, type]
    );
    return json(res, 200, { status: 'ok', templates: result.rows });
  }

  const body = await readBody(req);
  const nextType = emailTemplateType(body.type || type);

  if (req.method === 'POST') {
    const name = String(body.name || '').trim();
    const subject = String(body.subject || '').trim();
    const templateBody = String(body.body ?? body.emailBody ?? '').trim();
    if (!name) return json(res, 400, { status: 'error', message: 'Template name is required' });
    if (!subject) return json(res, 400, { status: 'error', message: 'Template subject is required' });
    if (!templateBody) return json(res, 400, { status: 'error', message: 'Template body is required' });
    const result = await query(
      'insert into email_templates ("companyId", type, name, subject, body, "isActive") values ($1,$2,$3,$4,$5,$6) returning id, "companyId", type, name, subject, body, "isActive", "createdAt", "updatedAt"',
      [companyId, nextType, name, subject, templateBody, body.isActive !== false]
    );
    return json(res, 200, { status: 'ok', template: result.rows[0] });
  }

  if (req.method === 'PATCH') {
    const id = Number(body.id);
    if (!id) return json(res, 400, { status: 'error', message: 'Template id is required' });
    const name = String(body.name || '').trim();
    const subject = String(body.subject || '').trim();
    const templateBody = String(body.body ?? body.emailBody ?? '').trim();
    if (!name) return json(res, 400, { status: 'error', message: 'Template name is required' });
    if (!subject) return json(res, 400, { status: 'error', message: 'Template subject is required' });
    if (!templateBody) return json(res, 400, { status: 'error', message: 'Template body is required' });
    const result = await query(
      'update email_templates set type=$1, name=$2, subject=$3, body=$4, "isActive"=$5, "updatedAt"=now() where id=$6 and "companyId"=$7 returning id, "companyId", type, name, subject, body, "isActive", "createdAt", "updatedAt"',
      [nextType, name, subject, templateBody, body.isActive !== false, id, companyId]
    );
    if (!result.rows[0]) return json(res, 404, { status: 'error', message: 'Template not found' });
    return json(res, 200, { status: 'ok', template: result.rows[0] });
  }

  if (req.method === 'DELETE') {
    const id = Number(url.searchParams.get('id') || body.id || 0);
    if (!id) return json(res, 400, { status: 'error', message: 'Template id is required' });
    await query('delete from email_templates where id=$1 and "companyId"=$2', [id, companyId]);
    return json(res, 200, { status: 'ok', success: true });
  }

  return json(res, 405, { status: 'error', message: 'Method not allowed' });
}
// PHASE12A79_EMAIL_TEMPLATE_SETTINGS END

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
    'select id, "fileNumber", "applicantName", "monitorStatus", "terminated", notes from applicants where id=$1 and "companyId"=$2 limit 1',
    [id, companyId]
  );

  if (!current.rows[0]) {
    return json(res, 404, { status: 'error', message: 'Monitoring record not found for this client' });
  }

  const monitorStatus = normalizeMonitorStatus(body.monitorStatus ?? current.rows[0].monitorStatus);
  const notes = body.notes === undefined ? String(current.rows[0].notes || '') : String(body.notes ?? '').trim();
  const terminated = body.terminated === undefined ? Boolean(current.rows[0].terminated) : asBool(body.terminated);

  await logMonitoringOnOffChange(companyId, current.rows[0], monitorStatus, user);

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
  const { PDFDocument } = await import('pdf-lib');
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

  const noSafetyHistory = pdfSame(report.accidentHistory, 'No accidents reported') && !report.dotAlcoholTestPositive && !report.dotDrugTestPositive && !report.dotRefusedTest && !report.dotOtherViolations && !report.dotPriorEmployerReportedViolation && !report.dotCompletedReturnToDutyProcess;
  pdfCheck(form, 'If there is no safety performance history to report check here', noSafetyHistory);

  pdfSetText(form, 'Employee Name', report.applicantName);
  pdfSetText(form, 'Date_3', report.infoReceivedDate || pdfShortDate(report.created));
  pdfCheck(form, '3 years prior to the application date shown on SIDE 1 or check here', pdfSame(report.accidentHistory, 'No accidents reported'));
  pdfSetAccidentRows(form, report);

  const anyDotViolation = Boolean(report.dotAlcoholTestPositive || report.dotDrugTestPositive || report.dotRefusedTest || report.dotOtherViolations || report.dotPriorEmployerReportedViolation || report.dotCompletedReturnToDutyProcess);
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


// PHASE12A78_EFAX_FMCSA_REPORT START
function faxDigits(value: any) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.length < 7) throw new Error('Recipient fax number is required');
  return digits;
}

function faxDomain() {
  return String(process.env.EFAX_SEND_DOMAIN || 'send.efax.com').replace(/^@+/, '').trim() || 'send.efax.com';
}

function faxFromEmail() {
  return String(process.env.SAFETY_FROM_EMAIL || process.env.EMAIL_FROM || '').trim();
}

function faxReplyToEmail() {
  return String(process.env.SAFETY_REPLY_TO_EMAIL || process.env.EMAIL_REPLY_TO || '').trim();
}

function faxFetchTimeoutMs() {
  const raw = Number(process.env.EFAX_SEND_TIMEOUT_MS || 15000);
  return Number.isFinite(raw) && raw >= 5000 ? raw : 15000;
}

function makeAbortSignal(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function defaultFaxCoverMessage(report: any, recipientName?: string) {
  const parts = [
    recipientName ? `Attention: ${recipientName}` : '',
    '',
    'Please see the attached FMCSA Safety Performance report.',
    '',
    `Applicant: ${pdfClean(report.applicantName) || 'N/A'}`,
    `File Number: ${pdfClean(report.fileNumber) || 'N/A'}`,
    report.prevEmployerName ? `Previous Employer: ${report.prevEmployerName}` : '',
    '',
    'Thank you,',
    'SaffHire Background Screening'
  ].filter((line, index, arr) => line || arr[index - 1] !== '');
  return parts.join('\n').trim();
}

async function sendViaResendToEfax(params: { toFaxEmail: string; fromEmail: string; replyToEmail?: string; subject: string; text: string; filename: string; pdfBase64: string; }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) throw new Error('RESEND_API_KEY is missing in Vercel Environment Variables');
  if (!params.fromEmail || !params.fromEmail.includes('@')) throw new Error('EMAIL_FROM or SAFETY_FROM_EMAIL is missing in Vercel Environment Variables');
  if (!params.toFaxEmail || !params.toFaxEmail.includes('@')) throw new Error('eFax destination email could not be created from the fax number');

  const payload: any = {
    from: params.fromEmail,
    to: [params.toFaxEmail],
    subject: params.subject || 'FMCSA Safety Performance Report',
    text: params.text || 'Please see the attached FMCSA Safety Performance report.',
    attachments: [
      {
        filename: params.filename,
        content: params.pdfBase64,
      }
    ]
  };
  if (params.replyToEmail && params.replyToEmail.includes('@')) payload.reply_to = params.replyToEmail;

  const timeout = makeAbortSignal(faxFetchTimeoutMs());
  let response: any;
  let raw = '';
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: timeout.signal
    });
    raw = await response.text();
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Resend/eFax email request timed out before Vercel finished the function. Try again, or increase EFAX_SEND_TIMEOUT_MS.');
    }
    throw new Error(`Resend/eFax email request failed before a response was received: ${errorMessage(error)}`);
  } finally {
    timeout.clear();
  }

  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const detail = typeof data === 'object' ? (data?.message || data?.error || JSON.stringify(data)) : String(data || '');
    throw new Error(`eFax email send failed: ${detail || response.statusText}`);
  }
  return data;
}
async function safetyReportsFaxFmcsaInner(req: any, res: any, user: any) {
  if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  if (!requireCompanyScope(user, res)) return;

  const body = await readBody(req);
  const companyId = Number(body.companyId || requestedCompanyId(req, user));
  const id = Number(body.id || 0);
  const fileNumber = String(body.fileNumber || '').trim();
  const recipientFaxDigits = faxDigits(body.faxNumber || body.recipientFaxNumber || body.prevEmployerFax);
  const recipientName = String(body.recipientName || '').trim();
  const domain = faxDomain();
  const toFaxEmail = `${recipientFaxDigits}@${domain}`;

  let result;
  if (id) {
    result = await query('select * from safety_reports where id=$1 and "companyId"=$2 limit 1', [id, companyId]);
  } else if (fileNumber) {
    result = await query('select * from safety_reports where "companyId"=$1 and "fileNumber"=$2 order by id desc limit 1', [companyId, fileNumber]);
  } else {
    return json(res, 400, { status: 'error', message: 'Report id or file number is required' });
  }

  const report = result.rows[0];
  if (!report) return json(res, 404, { status: 'error', message: 'Safety Performance report not found' });

  let selectedTemplate: any = null;
  const templateId = Number(body.templateId || body.emailTemplateId || 0);
  if (templateId) {
    try {
      const templateResult = await query(
        'select id, name, subject, body from email_templates where id=$1 and "companyId"=$2 and "isActive"=true limit 1',
        [templateId, companyId]
      );
      selectedTemplate = templateResult.rows[0] || null;
    } catch {
      // Template lookup should not prevent faxing if the table has not been added yet.
      selectedTemplate = null;
    }
  }

  const bytes = await buildCompletedSafetyPdf(report);
  const safeFile = String(report.fileNumber || report.id || 'safety-performance').replace(/[^0-9A-Za-z_-]/g, '') || 'safety-performance';
  const filename = `fmcsa-safety-performance-${safeFile}.pdf`;
  const defaultSubject = `FMCSA Safety Performance Report${report.fileNumber ? ` - File #${report.fileNumber}` : ''}`;
  const subjectRaw = String(body.subject || body.emailSubject || selectedTemplate?.subject || defaultSubject).trim() || defaultSubject;
  const textRaw = String(body.coverMessage || body.body || selectedTemplate?.body || '').trim() || defaultFaxCoverMessage(report, recipientName);
  const subject = renderTemplateText(subjectRaw, report, { recipientName, faxNumber: recipientFaxDigits });
  const text = renderTemplateText(textRaw, report, { recipientName, faxNumber: recipientFaxDigits });
  const fromEmail = faxFromEmail();
  const replyToEmail = faxReplyToEmail();

  const emailResult = await sendViaResendToEfax({
    toFaxEmail,
    fromEmail,
    replyToEmail,
    subject,
    text,
    filename,
    pdfBase64: Buffer.from(bytes).toString('base64')
  });

  try {
    await query(
      'update safety_reports set "lastFaxSentAt"=now(), "lastFaxSentTo"=$1, "lastFaxStatus"=$2, "lastFaxMessage"=$3, "updatedAt"=now() where id=$4 and "companyId"=$5',
      [recipientFaxDigits, 'sent_to_efax', `Sent to ${toFaxEmail}`, report.id, companyId]
    );
  } catch {
    // Fax should not fail just because the optional logging columns have not been added yet.
  }

  return json(res, 200, {
    status: 'ok',
    success: true,
    message: `Fax sent to eFax for delivery to ${recipientFaxDigits}.`,
    faxEmail: toFaxEmail,
    reportId: report.id,
    fileNumber: report.fileNumber,
    emailProviderId: emailResult?.id || null
  });
}


async function safetyReportsFaxFmcsa(req: any, res: any, user: any) {
  try {
    return await safetyReportsFaxFmcsaInner(req, res, user);
  } catch (error: any) {
    return json(res, 500, {
      status: 'error',
      message: `Fax FMCSA failed: ${errorMessage(error)}`,
      code: 'FAX_FMCSA_FAILED'
    });
  }
}
// PHASE12A78_EFAX_FMCSA_REPORT END

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
  const subject = row?.subject || row?.applicant || row?.candidate || {};
  const applicantName = row.applicantName || row.subjectName || row.name || subject.fullName || subject.name || row.candidateName || [subject.lastName, subject.firstName].filter(Boolean).join(', ');
  const fileNumber = row.fileNumber || row.fileNo || row.file_number || row.orderNumber || row.orderNo || row.referenceId || row.ReferenceId || row.referenceID || row.referenceNumber || row.clientReference || row.clientReferenceId || row.customerReference || row.customerReferenceId || row.externalId || row.externalOrderId || row.orderReference || row.order?.fileNumber || row.order?.referenceId || '';
  return {
    orderGuid: row.orderGuid || row.orderGUID || row.guid || row.order?.orderGuid || row.order?.guid || row.id || '',
    fileNumber,
    orderStatus: row.orderStatus || row.status || '',
    orderType: row.orderType || row.type || '',
    orderedDate: iso(row.orderedDate || row.orderDate || row.createdDate || row.createdAt),
    completedDate: iso(row.completedDate || row.completedAt),
    applicantName,
    clientName: row.clientName || row.client?.name || '',
    clientCode: row.clientCode || row.client?.code || '',
    productName: row.productName || row.packageName || row.package?.name || '',
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


// PHASE12A60_MONITORING_ON_OFF_EXPORT_QUEUE START
function splitMonitoringExportName(rawName: any) {
  const raw = String(rawName || '').replace(/\s+/g, ' ').trim();
  if (!raw) return { firstName: '', middleName: '', lastName: '' };

  if (raw.includes(',')) {
    const [lastPart, restPart] = raw.split(',', 2);
    const rest = String(restPart || '').trim().split(/\s+/).filter(Boolean);
    return {
      firstName: rest[0] || '',
      middleName: rest.slice(1).join(' '),
      lastName: String(lastPart || '').trim()
    };
  }

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts[parts.length - 1] };
}

function monitoringExportValueAfterLabels(text: string, labels: string[], maxLength = 80) {
  const source = String(text || '');
  if (!source) return '';

  // PHASE12A61: TazWorks data can be flattened together like:
  // LicenseNumber173221566LicenseStateCOFullName...
  // Stop extracted values at the next known field label.
  const nextFieldLabels = [
    'LicenseState', 'License State', 'DL State', 'State',
    'FullName', 'Full Name', 'FirstName', 'First Name', 'MiddleName', 'Middle Name', 'LastName', 'Last Name',
    'DOB', 'DateOfBirth', 'Date of Birth', 'BirthDate', 'Birth Date',
    'Address', 'Street', 'City', 'Zip',
    'LicenseNumber', 'License Number', 'DriverLicenseNumber', 'Driver License Number', 'DLNumber', 'DL Number',
    'LicenseClass', 'License Class', 'Class',
    'LicenseStatus', 'License Status', 'Status',
    'IssueDate', 'Issue Date', 'ExpirationDate', 'Expiration Date', 'ExpireDate', 'Expire Date',
    'Restrictions', 'Endorsements', 'Sex', 'Gender', 'Height', 'Weight', 'EyeColor', 'HairColor'
  ];

  function cleanExtracted(rawValue: string) {
    let value = String(rawValue || '');

    for (const nextLabel of nextFieldLabels) {
      const idx = value.toLowerCase().indexOf(nextLabel.toLowerCase());
      if (idx > 0) value = value.slice(0, idx);
    }

    return value
      .replace(/\s{2,}/g, ' ')
      .replace(/\b(Date|Class|Type|Status|Restrictions|Endorsements|Expiration|Issue)\\b.*$/i, '')
      .trim();
  }

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Normal label/value extraction. Stop at line breaks first.
    let match = source.match(new RegExp(`${escaped}\\s*[:#\\-]?\\s*([^\\n\\r|;]{1,${maxLength}})`, 'i'));
    if (match?.[1]) {
      const value = cleanExtracted(match[1]);
      if (value) return value;
    }

    // Flattened JSON/text extraction.
    match = source.match(new RegExp(`${escaped}\\s*[:#\\-]?\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/. ]{0,${maxLength}})`, 'i'));
    if (match?.[1]) {
      const value = cleanExtracted(match[1]);
      if (value) return value;
    }
  }

  return '';
}

function monitoringExportLicenseContext(payload: any) {
  const full = cleanResultText(payload);
  if (!full) return '';

  const lower = full.toLowerCase();
  const anchors = [
    'license info',
    'driver license',
    'drivers license',
    'driver licence',
    'dl number',
    'license number',
    'mvr',
    'motor vehicle'
  ];

  for (const anchor of anchors) {
    const idx = lower.indexOf(anchor);
    if (idx >= 0) return full.slice(Math.max(0, idx - 250), idx + 2600);
  }

  return full.slice(0, 3000);
}

function monitoringExportFullDateOnly(value: any) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Reject redacted/partial DOB values like XXXX/06/21 or XX-06-21.
  if (/x{2,}/i.test(raw)) return '';

  const source = raw
    .replace(/([A-Za-z]+)(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/g, '$1 $2')
    .replace(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})([A-Za-z]+)/g, '$1 $2');

  let match = source.match(/\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b/);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  match = source.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (match) {
    const m = Number(match[1]);
    const d = Number(match[2]);
    const y = Number(match[3]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const d = dateFromText(source);
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;

  return '';
}

function monitoringExportDateFromContext(value: any) {
  // PHASE12A62: only return a complete DOB. Do not return partial/redacted DOB values.
  return monitoringExportFullDateOnly(value);
}

function monitoringExportFindDobDeep(payload: any): string {
  const seen = new Set<any>();

  function scan(value: any, keyName = ''): string {
    if (value === null || value === undefined) return '';

    if (typeof value === 'string' || typeof value === 'number') {
      const key = String(keyName || '').toLowerCase();
      const raw = String(value || '');

      if (/(dob|birth|dateofbirth|birthdate|date_of_birth)/i.test(key)) {
        const direct = monitoringExportFullDateOnly(raw);
        if (direct) return direct;
      }

      // Some flattened payloads contain DOBYYYY/MM/DD or DateOfBirthYYYY-MM-DD.
      const labeled = monitoringExportValueAfterLabels(raw, [
        'Date of Birth',
        'DateOfBirth',
        'Birth Date',
        'BirthDate',
        'Birthdate',
        'DOB',
        'D.O.B.'
      ], 60);
      const fromLabel = monitoringExportFullDateOnly(labeled);
      if (fromLabel) return fromLabel;

      const anyDate = monitoringExportFullDateOnly(raw);
      if (anyDate && /(dob|birth|dateofbirth|birthdate)/i.test(raw)) return anyDate;

      return '';
    }

    if (typeof value !== 'object') return '';
    if (seen.has(value)) return '';
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = scan(item, keyName);
        if (found) return found;
      }
      return '';
    }

    for (const [key, child] of Object.entries(value)) {
      const found = scan(child, key);
      if (found) return found;
    }

    return '';
  }

  return scan(payload);
}

function monitoringExportApplicantDob(row: any): string {
  return monitoringExportFindDobDeep(row);
}

function monitoringExportDetailsFromOrderDetail(payload: any) {
  const base = monitoringExportDetailsFromPayload(payload);
  const dob = base.dob || monitoringExportFindDobDeep(payload);

  return {
    dob,
    dlNumber: base.dlNumber || '',
    dlState: base.dlState || '',
    rawFound: Boolean(dob || base.dlNumber || base.dlState || base.rawFound)
  };
}

async function monitoringExportOrderDetailPayload(orderGuid: string) {
  const e = tazEnv();
  const encodedOrder = encodeURIComponent(String(orderGuid || '').trim());
  if (!encodedOrder) return null;

  // PHASE12A64: Best DOB source from TazWorks Order Detail.
  // Another TazWorks implementation confirmed this endpoint returns the full DOB:
  // /v1/clients/{clientGuid}/orders/{orderGuid}
  const paths = [
    `/v1/clients/${encodeURIComponent(e.clientGuid)}/orders/${encodedOrder}`,
    `/tazworks/orders/${encodedOrder}?clientGuid=${encodeURIComponent(e.clientGuid)}`,
    `/tazworks/orders/${encodedOrder}/detail?clientGuid=${encodeURIComponent(e.clientGuid)}`
  ];

  for (const path of paths) {
    try {
      const payload = await proxyGet(path);
      if (payload) return payload;
    } catch {}
  }

  return null;
}

function monitoringExportDetailsFromPayload(payload: any) {
  const context = monitoringExportLicenseContext(payload);
  if (!context) return { dob: '', dlNumber: '', dlState: '', rawFound: false };

  const dobRaw = monitoringExportValueAfterLabels(context, [
    'Date of Birth',
    'DateOfBirth',
    'Birth Date',
    'BirthDate',
    'Birthdate',
    'DOB',
    'D.O.B.'
  ], 60);

  let dlNumber = monitoringExportValueAfterLabels(context, [
    'Driver License Number',
    'Drivers License Number',
    'Driver Lic Number',
    'DL Number',
    'DL #',
    'License Number',
    'License #',
    'Lic Number',
    'DLN'
  ], 70);

  dlNumber = String(dlNumber || '')
    .replace(/\b(State|Class|Type|Status|DOB|Date of Birth|Expiration|Issue)\\b.*$/i, '')
    .replace(/[^A-Za-z0-9-]/g, '')
    .trim();

  let dlState = monitoringExportValueAfterLabels(context, [
    'Driver License State',
    'Drivers License State',
    'DL State',
    'License State',
    'Lic State',
    'State'
  ], 30);

  const stateMatch = String(dlState || '').toUpperCase().match(/\b[A-Z]{2}\b/);
  dlState = stateMatch ? stateMatch[0] : String(dlState || '').slice(0, 2).toUpperCase();

  const dob = monitoringExportDateFromContext(dobRaw) || monitoringExportFindDobDeep(payload);

  return {
    dob,
    dlNumber,
    dlState,
    rawFound: Boolean(dob || dobRaw || dlNumber || dlState)
  };
}

function monitoringExportMergeDetails(base: any, candidate: any) {
  const baseDob = monitoringExportFullDateOnly(base.dob);
  const candidateDob = monitoringExportFullDateOnly(candidate.dob);

  return {
    dob: baseDob || candidateDob || '',
    dlNumber: base.dlNumber || candidate.dlNumber || '',
    dlState: base.dlState || candidate.dlState || '',
    rawFound: Boolean(base.rawFound || candidate.rawFound || baseDob || candidateDob)
  };
}

async function monitoringExportTazworksDetails(companyId: number, fileNumber: string) {
  const blank = { dob: '', dlNumber: '', dlState: '', source: 'not-found' };
  const file = String(fileNumber || '').trim();
  if (!file) return blank;

  try {
    const cached = await query(
      `select order_guid, applicant_name, raw_order
       from tazworks_order_cache
       where company_id=$1 and file_number=$2
       order by last_seen_at desc nulls last, id desc
       limit 1`,
      [companyId, file]
    );

    const order = cached.rows[0];

    if (!order?.order_guid) {
      const fromRaw = monitoringExportDetailsFromOrderDetail(order?.raw_order || {});
      return {
        ...blank,
        ...fromRaw,
        source: fromRaw.rawFound ? 'tazworks-order-cache-no-guid' : 'not-found'
      };
    }

    let details = monitoringExportDetailsFromOrderDetail(order.raw_order || {});
    let bestSource = details.rawFound ? 'tazworks-order-cache' : 'not-found';

    // PHASE12A64: Try Order Detail before MVR/search result parsing.
    // This is the best full DOB source when the MVR only shows a redacted DOB.
    const orderDetail = await monitoringExportOrderDetailPayload(order.order_guid);
    if (orderDetail) {
      const orderDetails = monitoringExportDetailsFromOrderDetail(orderDetail);
      details = monitoringExportMergeDetails(details, orderDetails);
      if (orderDetails.rawFound) bestSource = 'tazworks-order-detail';
    }

    // If Order Detail gives DOB and cache gives DL fields, this is enough.
    if (details.dob && details.dlNumber && details.dlState) {
      return {
        dob: monitoringExportFullDateOnly(details.dob),
        dlNumber: details.dlNumber,
        dlState: details.dlState,
        source: bestSource
      };
    }

    const e = tazEnv();
    const searchesPayload = await proxyGet(`/tazworks/orders/${encodeURIComponent(order.order_guid)}/searches?clientGuid=${encodeURIComponent(e.clientGuid)}`);
    const rawSearches = Array.isArray(searchesPayload) ? searchesPayload : (searchesPayload.searches || searchesPayload.data || searchesPayload.items || []);
    const searches = rawSearches.map((row: any) => searchFrom(row, order.order_guid));
    const candidates = searches.filter(isMvr);
    const scan = candidates.length ? candidates : searches;

    for (const search of scan.slice(0, 6)) {
      const searchDetails = monitoringExportDetailsFromOrderDetail(search.raw);
      details = monitoringExportMergeDetails(details, searchDetails);
      if (searchDetails.rawFound && bestSource === 'not-found') bestSource = 'tazworks-search-row';

      if (details.dob && details.dlNumber && details.dlState) {
        return {
          dob: monitoringExportFullDateOnly(details.dob),
          dlNumber: details.dlNumber,
          dlState: details.dlState,
          source: bestSource === 'not-found' ? 'tazworks-search-row' : bestSource
        };
      }

      for (const resultType of ['EDITOR', 'CLIENT', 'FINAL', null] as any[]) {
        try {
          const result = await tryResultVariant(order.order_guid, search.searchGuid, resultType);
          const resultDetails = monitoringExportDetailsFromOrderDetail(result);
          details = monitoringExportMergeDetails(details, resultDetails);
          if (resultDetails.rawFound && bestSource === 'not-found') bestSource = `tazworks-result-${resultType || 'default'}`;

          if (details.dob && details.dlNumber && details.dlState) {
            return {
              dob: monitoringExportFullDateOnly(details.dob),
              dlNumber: details.dlNumber,
              dlState: details.dlState,
              source: bestSource === 'not-found' ? `tazworks-result-${resultType || 'default'}` : bestSource
            };
          }
        } catch {}
      }
    }

    return {
      dob: monitoringExportFullDateOnly(details.dob) || '',
      dlNumber: details.dlNumber || '',
      dlState: details.dlState || '',
      source: details.rawFound ? bestSource : 'not-found'
    };
  } catch (error: any) {
    return { ...blank, source: `error: ${errorMessage(error)}`.slice(0, 240) };
  }
}

async function logMonitoringOnOffChange(companyId: number, currentRow: any, newMonitorStatus: string, user: any) {
  try {
    const oldStatus = normalizeMonitorStatus(currentRow?.monitorStatus);
    const nextStatus = normalizeMonitorStatus(newMonitorStatus);
    if (oldStatus === nextStatus) return;

    const action = nextStatus === 'On' ? 'on' : 'off';
    const fileNumber = String(currentRow?.fileNumber || '').trim();
    if (!fileNumber) return;

    const nameParts = splitMonitoringExportName(currentRow?.applicantName || currentRow?.name || '');
    const taz = await monitoringExportTazworksDetails(companyId, fileNumber);
    const fallbackDob = monitoringExportApplicantDob(currentRow);

    await query(
      `insert into monitoring_on_off_exports (
        "companyId", "applicantId", "fileNumber", action,
        "firstName", "middleName", "lastName", dob, "dlNumber", "dlState",
        source, "createdBy", "rawDetails"
      ) values (
        $1,$2,$3,$4,
        $5,$6,$7,$8,$9,$10,
        $11,$12,$13
      )`,
      [
        companyId,
        currentRow?.id || null,
        fileNumber,
        action,
        nameParts.firstName,
        nameParts.middleName,
        nameParts.lastName,
        monitoringExportFullDateOnly(taz.dob) || fallbackDob || '',
        taz.dlNumber || '',
        taz.dlState || '',
        taz.source || '',
        user?.username || user?.displayName || '',
        JSON.stringify({ previousMonitorStatus: oldStatus, newMonitorStatus: nextStatus, tazworksSource: taz.source || '' })
      ]
    );
  } catch (error) {
    console.error('Monitoring On/Off export queue insert failed', error);
  }
}

async function monitoringOnOffExports(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;
  const companyId = requestedCompanyId(req, user);

  if (req.method === 'GET') {
    const result = await query(
      `select id, "fileNumber" as "ReferenceId", "firstName" as "FirstName", "middleName" as "MiddleName",
              "lastName" as "LastName", dob as "DOB", "dlNumber" as "DL Number", "dlState" as "DL State",
              action, source, "createdAt"
       from monitoring_on_off_exports
       where "companyId"=$1 and "clearedAt" is null
       order by "createdAt" asc, id asc`,
      [companyId]
    );

    const onRows = result.rows.filter((row: any) => row.action === 'on');
    const offRows = result.rows.filter((row: any) => row.action === 'off');

    return json(res, 200, { status: 'ok', onRows, offRows });
  }

  return json(res, 405, { status: 'error', message: 'Method not allowed' });
}

async function monitoringOnOffExportsClear(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;
  if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' });

  const companyId = requestedCompanyId(req, user);
  const body = await readBody(req);
  const action = String(body.action || '').trim().toLowerCase();

  if (!['on', 'off'].includes(action)) {
    return json(res, 400, { status: 'error', message: 'action must be on or off' });
  }

  const result = await query(
    `update monitoring_on_off_exports
     set "clearedAt"=now(), "clearedBy"=$1
     where "companyId"=$2 and action=$3 and "clearedAt" is null
     returning id`,
    [user?.username || user?.displayName || '', companyId, action]
  );

  return json(res, 200, { status: 'ok', cleared: result.rows.length });
}

async function monitoringOnOffExportsRepair(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;
  if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' });

  const companyId = requestedCompanyId(req, user);
  const rows = await query(
    `select id, "fileNumber", dob
     from monitoring_on_off_exports
     where "companyId"=$1 and "clearedAt" is null
       and (dob='' or dob ilike '%xx%' or dob ilike '%address%' or dob !~ '^\\d{4}-\\d{2}-\\d{2}$')`,
    [companyId]
  );

  let repaired = 0;

  for (const row of rows.rows) {
    let dob = '';

    const applicant = await query(
      `select *
       from applicants
       where "companyId"=$1 and "fileNumber"=$2
       limit 1`,
      [companyId, row.fileNumber]
    );

    dob = monitoringExportApplicantDob(applicant.rows[0]);

    if (!dob) {
      const details = await monitoringExportTazworksDetails(companyId, String(row.fileNumber || ''));
      dob = monitoringExportFullDateOnly(details.dob);
    }

    if (dob) {
      await query(
        `update monitoring_on_off_exports
         set dob=$1
         where id=$2 and "companyId"=$3`,
        [dob, row.id, companyId]
      );
      repaired++;
    }
  }

  return json(res, 200, { status: 'ok', checked: rows.rows.length, repaired });
}


async function monitoringOnOffExportsUpdate(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return json(res, 405, { status: 'error', message: 'Method not allowed' });
  }

  const companyId = requestedCompanyId(req, user);
  const body = await readBody(req);
  const id = Number(body.id || 0);

  if (!id) {
    return json(res, 400, { status: 'error', message: 'Queue row id is required' });
  }

  const dob = String(body.dob ?? '').trim();

  const result = await query(
    `update monitoring_on_off_exports
     set dob=$1,
         "rawDetails" = coalesce("rawDetails", '{}'::jsonb) || jsonb_build_object('manualDobUpdatedAt', now(), 'manualDobUpdatedBy', $2),
         "createdAt" = "createdAt"
     where id=$3 and "companyId"=$4 and "clearedAt" is null
     returning id, "fileNumber" as "ReferenceId", "firstName" as "FirstName", "middleName" as "MiddleName",
               "lastName" as "LastName", dob as "DOB", "dlNumber" as "DL Number", "dlState" as "DL State",
               action, source, "createdAt"`,
    [dob, user?.username || user?.displayName || '', id, companyId]
  );

  if (!result.rows[0]) {
    return json(res, 404, { status: 'error', message: 'Queue row not found or already cleared' });
  }

  return json(res, 200, { status: 'ok', row: result.rows[0] });
}

// PHASE12A60_MONITORING_ON_OFF_EXPORT_QUEUE END


// PHASE12A52_ADMIN_INVOICES START
function invoiceDateOnly(value: any) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
function invoicePreviousMonthStart() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
function invoiceCurrentMonthStart() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
function invoiceMonthStart(value?: any) {
  const raw = String(value || '').trim();

  // PHASE12A53: invoices default to the previous service month.
  // Example: invoice created in July 2026 should bill June 2026.
  const d = raw ? new Date(raw.length === 7 ? `${raw}-01T00:00:00Z` : raw) : new Date(invoicePreviousMonthStart() + 'T00:00:00Z');

  if (Number.isNaN(d.getTime())) {
    return invoicePreviousMonthStart();
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
  // PHASE12A56: cast monitorStatus enum to text before coalesce to avoid enum blank-value errors.
  // PHASE12A54: invoice quantity must match Monitoring page "On Monitoring" count.
  const result = await query(
    `select count(*)::int as count
     from applicants
     where "companyId"=$1
       and coalesce("terminated", false)=false
       and lower(trim(coalesce("monitorStatus"::text, '')))='on'`,
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
async function correctCurrentMonthDraftToPreviousMonth(companyId: number) {
  // PHASE12A53: If the first draft was accidentally created for the current month,
  // move it to the previous service month as long as there is not already a previous-month invoice.
  const currentMonth = invoiceCurrentMonthStart();
  const previousMonth = invoicePreviousMonthStart();

  const currentDraft = await query(
    `${invoiceSelectSql()} where "companyId"=$1 and "invoiceMonth"=$2 and status='Draft' order by id desc limit 1`,
    [companyId, currentMonth]
  );

  if (!currentDraft.rows[0]) return;

  const previousExists = await query(
    `${invoiceSelectSql()} where "companyId"=$1 and "invoiceMonth"=$2 limit 1`,
    [companyId, previousMonth]
  );

  if (previousExists.rows[0]) return;

  const quantity = await invoiceCurrentMvrCount(companyId);
  const totals = invoiceTotals(quantity, currentDraft.rows[0].unitPrice, currentDraft.rows[0].salesTaxRate);

  await query(
    `update invoices
     set "invoiceMonth"=$1,
         "serviceMonthLabel"=$2,
         "invoiceNumber"=$3,
         quantity=$4,
         subtotal=$5,
         "salesTax"=$6,
         total=$7,
         "updatedAt"=now()
     where id=$8 and "companyId"=$9`,
    [
      previousMonth,
      invoiceMonthLabel(previousMonth),
      invoiceDefaultNumber(companyId, previousMonth),
      totals.quantity,
      totals.subtotal,
      totals.salesTax,
      totals.total,
      currentDraft.rows[0].id,
      companyId
    ]
  );
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
    try {
      try { await correctCurrentMonthDraftToPreviousMonth(companyId); } catch (error) { console.error('invoice draft correction failed', error); }
      await ensureMonthlyInvoice(companyId);
      const list = await query(`${invoiceSelectSql()} where "companyId"=$1 order by "invoiceMonth" desc, id desc limit 36`, [companyId]);
      const currentCount = await invoiceCurrentMvrCount(companyId);
      return json(res, 200, { status: 'ok', currentMonitoringOnCount: currentCount, currentMvrOnCount: currentCount, invoices: list.rows });
    } catch (error: any) {
      return json(res, 500, {
        status: 'error',
        message: `Invoices could not load: ${errorMessage(error)}. Confirm the Phase 12A-52 invoices SQL migration has been run.`
      });
    }
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
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
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

  // PHASE12A57: Use uploaded Saffhire logo in invoice PDF.
  const invoiceLogoPath = path.join(process.cwd(), 'public', 'saffhire-logo-invoice.png');
  if (fs.existsSync(invoiceLogoPath)) {
    const logoBytes = fs.readFileSync(invoiceLogoPath);
    const logo = await pdfDoc.embedPng(logoBytes);
    const logoWidth = 220;
    const logoHeight = logoWidth * (logo.height / logo.width);
    page.drawImage(logo, {
      x: right - logoWidth,
      y: 704,
      width: logoWidth,
      height: logoHeight
    });
  } else {
    page.drawText('SAFF', { x: 404, y: 744, size: 24, font: bold, color: blue });
    page.drawText('HIRE', { x: 465, y: 744, size: 24, font: bold, color: green });
    page.drawText('BACKGROUND SCREENING', { x: 404, y: 728, size: 9, font: bold, color: blue });
  }

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

  // PHASE12A58: Move right-side invoice detail labels left so they do not overlap the values.
  const labelX = 350;
  const valueX = 560;
  y = 610;
  page.drawText('Invoice #', { x: labelX, y, size: 14, font: bold, color: gray });
  drawRight(page, pdfText(invoice.invoiceNumber), valueX, y, { size: 14, font: bold, color: gray });
  y -= 22;
  page.drawText('Invoice Date:', { x: labelX, y, size: 11, font, color: dark });
  drawRight(page, invoiceDateOnly(invoice.invoiceDate), valueX, y, { size: 12, font, color: dark });
  y -= 22;
  page.drawText('Customer #:', { x: labelX, y, size: 11, font, color: dark });
  drawRight(page, `Company ${invoice.companyId}`, valueX, y, { size: 12, font, color: dark });
  y -= 22;
  page.drawText('Representative:', { x: labelX, y, size: 11, font, color: dark });
  drawRight(page, 'Robert Krebsbach', valueX, y, { size: 12, font, color: dark });
  y -= 22;
  page.drawText('Date Due:', { x: labelX, y, size: 11, font, color: dark });
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
  // PHASE12A57: Move total labels left to prevent overlap/crowding with amount values.
  const totalsLabelX = 386;
  page.drawText('Sales Tax', { x: totalsLabelX + 18, y, size: 12, font, color: dark });
  drawRight(page, moneyText(invoice.salesTax), right - 4, y, { size: 12, font: bold, color: dark });
  y -= 20;
  page.drawLine({ start: { x: totalsLabelX, y: y + 12 }, end: { x: right, y: y + 12 }, thickness: 0.5, color: gray });
  page.drawText('Total Amount Due:', { x: totalsLabelX, y, size: 12, font, color: dark });
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

async function invoiceDiagnostics(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;
  const companyId = requestedCompanyId(req, user);
  const checks: any[] = [];

  async function add(name: string, fn: any) {
    try {
      const value = await fn();
      checks.push({ name, ok: true, value });
    } catch (error: any) {
      checks.push({ name, ok: false, error: errorMessage(error) });
    }
  }

  await add('database', async () => {
    const r = await query('select 1 as ok');
    return r.rows[0]?.ok;
  });

  await add('invoices table exists', async () => {
    const r = await query("select exists (select 1 from information_schema.tables where table_name='invoices') as exists");
    return r.rows[0]?.exists;
  });

  await add('on monitoring count', async () => invoiceCurrentMvrCount(companyId));

  await add('pdf-lib available', async () => {
    await import('pdf-lib');
    return true;
  });

  return json(res, 200, { status: 'ok', checks });
}

// PHASE12A52_ADMIN_INVOICES END


// PHASE12A11_TAZWORKS_SYNC END





// PHASE12A71_LIVE_SAFETY_PERFORMANCE_PULL START
function safetyDecodeHtml(value: any) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function safetyCleanText(value: any) {
  return safetyDecodeHtml(value).replace(/\s+/g, ' ').trim();
}

function safetyArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.content)) return value.content;
  if (Array.isArray(value.orders)) return value.orders;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.results)) return value.results;
  if (Array.isArray(value.searches)) return value.searches;
  if (Array.isArray(value?.response?.content)) return value.response.content;
  if (Array.isArray(value?.response?.data)) return value.response.data;
  if (Array.isArray(value?.response?.results)) return value.response.results;
  if (Array.isArray(value?._embedded?.content)) return value._embedded.content;
  if (Array.isArray(value?._embedded?.orders)) return value._embedded.orders;
  if (Array.isArray(value?._embedded?.searches)) return value._embedded.searches;
  if (value.result && Array.isArray(value.result)) return value.result;
  return [];
}

function safetyCityStateZip(address: any) {
  const city = safetyCleanText(address?.city);
  const state = safetyCleanText(address?.stateOrProvince || address?.state);
  const zip = safetyCleanText(address?.postalCode || address?.zip);
  return [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function safetyPhone(contactInfo: any) {
  const phones = contactInfo?.phoneNumbers;
  if (Array.isArray(phones) && phones.length) return safetyCleanText(phones[0]);
  return safetyCleanText(contactInfo?.phone || contactInfo?.phoneNumber || '');
}

function safetyFindPerformanceSearch(payload: any) {
  const searches = safetyArray(payload);
  const employment = searches.filter((row: any) => String(row?.type || '').toUpperCase() === 'EMPLOYMENT_VERIFICATION');
  const safety = employment.find((row: any) => /safety\s*performance|dot\s*verification|safety\s*performance\s*and\s*dot/i.test(`${row?.displayName || ''} ${row?.displayValue || ''}`));
  return safety || null;
}

function safetyExtractLivePayload(search: any) {
  const record = Array.isArray(search?.results?.records) ? search.results.records[0] : null;
  if (!record) return null;

  const employer = record.employer || {};
  const address = employer.address || {};
  const contactInfo = employer.contactInfo || {};
  const subjectProvided = record.subjectProvidedInfo || {};

  const extracted: any = {
    applicantName: safetyCleanText(record.subject?.fullName || ''),
    prevEmployerName: safetyCleanText(employer.name || search.displayValue || ''),
    prevEmployerEmail: safetyCleanText(contactInfo.email || ''),
    prevEmployerStreet: safetyCleanText(address.streetOne || address.street1 || ''),
    prevEmployerPhone: safetyPhone(contactInfo),
    prevEmployerCityStateZip: safetyCityStateZip(address),
    jobTitle: safetyCleanText(subjectProvided.position || ''),
    fromDate: safetyCleanText(subjectProvided.hireDate || ''),
    orderSearchGuid: safetyCleanText(search.orderSearchGuid || ''),
    searchDisplayName: safetyCleanText(search.displayName || ''),
    searchDisplayValue: safetyCleanText(search.displayValue || ''),
    verificationResponse: safetyCleanText(record.verificationResponse || ''),
    employerType: safetyCleanText(subjectProvided.employerType || ''),
    supervisor: safetyCleanText(record.supervisor || '')
  };

  return extracted;
}

function safetyNormalizeHost(value: any) {
  return safetyCleanText(value)
    .replace(/^https?:\/\//i, '')
    .replace(/^\/+/g, '')
    .replace(/\/v1\/?$/i, '')
    .replace(/\/+$/g, '');
}

function safetyQuery(path: string, params: Record<string, any>) {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  if (!pairs.length) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${pairs.join('&')}`;
}

function safetyMergeSearchWithResult(search: any, resultPayload: any) {
  if (Array.isArray(search?.results?.records)) return search;
  const merged: any = { ...(search || {}) };
  if (Array.isArray(resultPayload?.records)) merged.results = { records: resultPayload.records };
  else if (Array.isArray(resultPayload?.results?.records)) merged.results = resultPayload.results;
  else if (Array.isArray(resultPayload?.data?.records)) merged.results = { records: resultPayload.data.records };
  else if (Array.isArray(resultPayload?.response?.records)) merged.results = { records: resultPayload.response.records };
  else if (Array.isArray(resultPayload?.response?.results?.records)) merged.results = resultPayload.response.results;
  else {
    const list = safetyArray(resultPayload);
    const match = list.find((row: any) => Array.isArray(row?.results?.records) || Array.isArray(row?.records));
    if (match?.results?.records) merged.results = match.results;
    else if (match?.records) merged.results = { records: match.records };
    else merged.results = resultPayload?.results || resultPayload;
  }
  return merged;
}

async function safetyPullSearchResultPayload(orderGuid: string, searchGuid: string, clientGuid: string, host: string) {
  const encodedOrder = encodeURIComponent(orderGuid);
  const encodedSearch = encodeURIComponent(searchGuid);
  const encodedClient = encodeURIComponent(clientGuid);
  const normalizedHost = safetyNormalizeHost(host);
  const resultTypes: Array<string | null> = ['EDITOR', null, 'CLIENT', 'HTML', 'RAW', 'JSON', 'FULL'];
  const basePaths = [
    `/tazworks/clients/${encodedClient}/orders/${encodedOrder}/searches/${encodedSearch}/results`,
    `/tazworks/v1/clients/${encodedClient}/orders/${encodedOrder}/searches/${encodedSearch}/results`,
    `/tazworks/orders/${encodedOrder}/searches/${encodedSearch}/results`
  ];

  let lastError: any = null;
  for (const basePath of basePaths) {
    for (const resultType of resultTypes) {
      try {
        const path = safetyQuery(basePath, {
          clientGuid: basePath.includes('/orders/') && !basePath.includes('/clients/') ? clientGuid : '',
          host: normalizedHost,
          resultType: resultType || ''
        });
        return await proxyGet(path);
      } catch (error: any) {
        lastError = error;
      }
    }
  }
  throw lastError || new Error('Could not pull Safety Performance search result.');
}

async function safetyAllSearchResults(orderGuid: string, clientGuid: string, host: string) {
  const encodedOrder = encodeURIComponent(orderGuid);
  const encodedClient = encodeURIComponent(clientGuid);
  const normalizedHost = safetyNormalizeHost(host);

  const allSearchPaths = [
    `/tazworks/clients/${encodedClient}/orders/${encodedOrder}/searches/results`,
    `/tazworks/v1/clients/${encodedClient}/orders/${encodedOrder}/searches/results`,
    `/tazworks/orders/${encodedOrder}/searches/results`,
    `/tazworks/orders/${encodedOrder}/results`
  ].map((path) => safetyQuery(path, {
    clientGuid: path.includes('/orders/') && !path.includes('/clients/') ? clientGuid : '',
    host: normalizedHost
  }));

  let lastError: any = null;
  for (const path of allSearchPaths) {
    try {
      const payload = await proxyGet(path);
      return { payload, sourcePath: path };
    } catch (error: any) {
      lastError = error;
    }
  }

  const searchListPaths = [
    `/tazworks/clients/${encodedClient}/orders/${encodedOrder}/searches`,
    `/tazworks/v1/clients/${encodedClient}/orders/${encodedOrder}/searches`,
    `/tazworks/orders/${encodedOrder}/searches`
  ].map((path) => safetyQuery(path, {
    clientGuid: path.includes('/orders/') && !path.includes('/clients/') ? clientGuid : '',
    host: normalizedHost
  }));

  for (const path of searchListPaths) {
    try {
      const searchPayload = await proxyGet(path);
      const safetySearch = safetyFindPerformanceSearch(searchPayload);
      if (!safetySearch) return { payload: searchPayload, sourcePath: path };

      const searchGuid = searchGuidFrom(safetySearch, orderGuid);
      if (!searchGuid) return { payload: [safetySearch], sourcePath: path };

      const resultPayload = await safetyPullSearchResultPayload(orderGuid, searchGuid, clientGuid, normalizedHost);
      const mergedSearch = safetyMergeSearchWithResult(safetySearch, resultPayload);
      return { payload: [mergedSearch], sourcePath: `${path} -> search result ${searchGuid}` };
    } catch (error: any) {
      lastError = error;
    }
  }

  throw lastError || new Error('Could not pull TazWorks All Search Results.');
}

async function safetyReportsLivePull(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;
  if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' });

  const body = await readBody(req);
  const companyId = requestedCompanyId(req, user);
  const reportId = Number(body.reportId || body.id || 0);
  const fileNumber = safetyCleanText(body.fileNumber || body.referenceId || '');
  const host = safetyCleanText(body.host || body.tazworksHost || '');
  const clientGuid = safetyCleanText(body.clientGuid || body.tazworksClientGuid || process.env.TAZWORKS_CLIENT_GUID || '');
  let orderGuid = safetyCleanText(body.orderGuid || body.tazworksOrderGuid || '');

  if (!clientGuid) return json(res, 400, { status: 'error', message: 'Client GUID is required or TAZWORKS_CLIENT_GUID must be set in Vercel.' });

  let reportResult;
  if (reportId) {
    reportResult = await query('select * from safety_reports where id=$1 and "companyId"=$2 limit 1', [reportId, companyId]);
  } else if (fileNumber) {
    reportResult = await query('select * from safety_reports where trim("fileNumber"::text)=trim($1) and "companyId"=$2 order by id desc limit 1', [fileNumber, companyId]);
  } else {
    return json(res, 400, { status: 'error', message: 'File number or report id is required.' });
  }

  const report = reportResult.rows[0];
  if (!report) return json(res, 404, { status: 'error', message: 'Safety report not found.' });

  if (!orderGuid) {
    const cached = await query(
      `select order_guid from tazworks_order_cache
       where company_id=$1 and trim(file_number::text)=trim($2)
       order by last_seen_at desc nulls last, id desc
       limit 1`,
      [companyId, report.fileNumber]
    );
    orderGuid = safetyCleanText(cached.rows[0]?.order_guid || '');
  }

  if (!orderGuid) {
    return json(res, 400, { status: 'error', message: 'Order GUID is required. Paste the order-guid from Postman, or run TazWorks sync first so the app can use the cached order GUID.' });
  }

  const pulled = await safetyAllSearchResults(orderGuid, clientGuid, host);
  const safetySearch = safetyFindPerformanceSearch(pulled.payload);

  if (!safetySearch) {
    await query(
      `update safety_reports
       set "tazworksHost"=$1, "tazworksClientGuid"=$2, "tazworksOrderGuid"=$3,
           "lastLiveSafetySyncAt"=now(), "lastLiveSafetySyncStatus"='no_safety_search',
           "lastLiveSafetySyncMessage"=$4, "updatedAt"=now()
       where id=$5 and "companyId"=$6`,
      [host, clientGuid, orderGuid, 'No Safety Performance and DOT Verification search was found on this order.', report.id, companyId]
    );
    return json(res, 200, {
      status: 'ok',
      found: false,
      message: 'No Safety Performance and DOT Verification search was found on this order.',
      orderGuid
    });
  }

  const extracted = safetyExtractLivePayload(safetySearch);
  if (!extracted) {
    await query(
      `update safety_reports
       set "tazworksHost"=$1, "tazworksClientGuid"=$2, "tazworksOrderGuid"=$3,
           "tazworksOrderSearchGuid"=$4, "lastLiveSafetySyncAt"=now(),
           "lastLiveSafetySyncStatus"='no_records', "lastLiveSafetySyncMessage"=$5, "updatedAt"=now()
       where id=$6 and "companyId"=$7`,
      [host, clientGuid, orderGuid, safetyCleanText(safetySearch.orderSearchGuid || ''), 'Safety Performance search was found, but it did not include records.', report.id, companyId]
    );
    return json(res, 200, {
      status: 'ok',
      found: false,
      message: 'Safety Performance search was found, but it did not include records.',
      orderGuid,
      orderSearchGuid: safetySearch.orderSearchGuid || ''
    });
  }

  const liveNoteParts = [
    extracted.searchDisplayName || 'Safety Performance and DOT Verification',
    extracted.verificationResponse ? `Verification Response: ${extracted.verificationResponse}` : '',
    extracted.employerType ? `Employer Type: ${extracted.employerType}` : '',
    extracted.supervisor ? `Supervisor: ${extracted.supervisor}` : ''
  ].filter(Boolean);

  const liveMessage = `Live Safety Pull: ${liveNoteParts.join(' | ')}`;

  const update = await query(
    `update safety_reports
     set "applicantName"=coalesce(nullif($1,''), "applicantName"),
         "prevEmployerName"=coalesce(nullif($2,''), "prevEmployerName"),
         "prevEmployerEmail"=coalesce(nullif($3,''), "prevEmployerEmail"),
         "prevEmployerStreet"=coalesce(nullif($4,''), "prevEmployerStreet"),
         "prevEmployerPhone"=coalesce(nullif($5,''), "prevEmployerPhone"),
         "prevEmployerCityStateZip"=coalesce(nullif($6,''), "prevEmployerCityStateZip"),
         "jobTitle"=coalesce(nullif($7,''), "jobTitle"),
         "fromDate"=coalesce(nullif($8,''), "fromDate"),
         status=case when status in ('Completed','Emp Complete') then status else 'S1 Complete' end,
         "tazworksHost"=$9,
         "tazworksClientGuid"=$10,
         "tazworksOrderGuid"=$11,
         "tazworksOrderSearchGuid"=$12,
         "lastLiveSafetySyncAt"=now(),
         "lastLiveSafetySyncStatus"='updated',
         "lastLiveSafetySyncMessage"=$13,
         "liveSafetyRaw"=$14::jsonb,
         notes=case when position($13 in coalesce(notes,'')) > 0 then notes else trim(both E'\n' from concat(coalesce(notes,''), E'\n', $13::text)) end,
         "updatedAt"=now()
     where id=$15 and "companyId"=$16
     returning *`,
    [
      extracted.applicantName,
      extracted.prevEmployerName,
      extracted.prevEmployerEmail,
      extracted.prevEmployerStreet,
      extracted.prevEmployerPhone,
      extracted.prevEmployerCityStateZip,
      extracted.jobTitle,
      extracted.fromDate,
      host,
      clientGuid,
      orderGuid,
      extracted.orderSearchGuid,
      liveMessage,
      JSON.stringify(safetySearch || {}),
      report.id,
      companyId
    ]
  );

  return json(res, 200, {
    status: 'ok',
    found: true,
    message: 'Live Safety Performance information pulled and saved.',
    orderGuid,
    orderSearchGuid: extracted.orderSearchGuid,
    extracted,
    report: update.rows[0]
  });
}


// PHASE12A72_AUTO_CREATE_NEW_SAFETY_REPORTS START
function safetyNumericFileNumber(value: any) {
  const match = String(value ?? '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function safetyBuildLiveMessage(extracted: any) {
  const liveNoteParts = [
    extracted.searchDisplayName || 'Safety Performance and DOT Verification',
    extracted.verificationResponse ? `Verification Response: ${extracted.verificationResponse}` : '',
    extracted.employerType ? `Employer Type: ${extracted.employerType}` : '',
    extracted.supervisor ? `Supervisor: ${extracted.supervisor}` : ''
  ].filter(Boolean);
  return `Live Safety Pull: ${liveNoteParts.join(' | ')}`;
}

async function safetyCompanyDefaults(companyId: number) {
  try {
    const r = await query('select name from companies where id=$1 limit 1', [companyId]);
    const companyName = safetyCleanText(r.rows[0]?.name || 'Driver Pipeline') || 'Driver Pipeline';
    return { companyName };
  } catch {
    return { companyName: 'Driver Pipeline' };
  }
}

async function safetyUpdateExistingReportFromLive(reportId: number, companyId: number, host: string, clientGuid: string, orderGuid: string, safetySearch: any, extracted: any) {
  const liveMessage = safetyBuildLiveMessage(extracted);
  const update = await query(
    `update safety_reports
     set "applicantName"=coalesce(nullif($1,''), "applicantName"),
         "prevEmployerName"=coalesce(nullif($2,''), "prevEmployerName"),
         "prevEmployerEmail"=coalesce(nullif($3,''), "prevEmployerEmail"),
         "prevEmployerStreet"=coalesce(nullif($4,''), "prevEmployerStreet"),
         "prevEmployerPhone"=coalesce(nullif($5,''), "prevEmployerPhone"),
         "prevEmployerCityStateZip"=coalesce(nullif($6,''), "prevEmployerCityStateZip"),
         "jobTitle"=coalesce(nullif($7,''), "jobTitle"),
         "fromDate"=coalesce(nullif($8,''), "fromDate"),
         status=case when status in ('Completed','Emp Complete') then status else 'S1 Complete' end,
         "tazworksHost"=$9,
         "tazworksClientGuid"=$10,
         "tazworksOrderGuid"=$11,
         "tazworksOrderSearchGuid"=$12,
         "lastLiveSafetySyncAt"=now(),
         "lastLiveSafetySyncStatus"='updated',
         "lastLiveSafetySyncMessage"=$13,
         "liveSafetyRaw"=$14::jsonb,
         notes=case when position($13 in coalesce(notes,'')) > 0 then notes else trim(both E'\n' from concat(coalesce(notes,''), E'\n', $13::text)) end,
         "updatedAt"=now()
     where id=$15 and "companyId"=$16
     returning *`,
    [
      extracted.applicantName,
      extracted.prevEmployerName,
      extracted.prevEmployerEmail,
      extracted.prevEmployerStreet,
      extracted.prevEmployerPhone,
      extracted.prevEmployerCityStateZip,
      extracted.jobTitle,
      extracted.fromDate,
      host,
      clientGuid,
      orderGuid,
      extracted.orderSearchGuid,
      liveMessage,
      JSON.stringify(safetySearch || {}),
      reportId,
      companyId
    ]
  );
  return update.rows[0];
}

async function safetyCreateOrUpdateReportFromLive(companyId: number, host: string, clientGuid: string, orderGuid: string, order: any, safetySearch: any, extracted: any) {
  const fileNumber = safetyCleanText(order.fileNumber || '');
  if (!fileNumber) throw new Error('Order did not include a file number.');

  const existing = await query(
    `select id from safety_reports where "companyId"=$1 and trim("fileNumber"::text)=trim($2) order by id desc limit 1`,
    [companyId, fileNumber]
  );

  if (existing.rows[0]?.id) {
    const report = await safetyUpdateExistingReportFromLive(existing.rows[0].id, companyId, host, clientGuid, orderGuid, safetySearch, extracted);
    return { action: 'updated', report };
  }

  const defaults = await safetyCompanyDefaults(companyId);
  const base = cleanReport({
    applicantName: extracted.applicantName || order.applicantName || '',
    fileNumber,
    created: dateOnly(order.orderedDate || order.createdDate || new Date()) || new Date().toISOString().slice(0, 10),
    status: 'S1 Complete',
    followUpDate: '',
    notes: safetyBuildLiveMessage(extracted),
    prevEmployerName: extracted.prevEmployerName || '',
    prevEmployerEmail: extracted.prevEmployerEmail || '',
    prevEmployerStreet: extracted.prevEmployerStreet || '',
    prevEmployerPhone: extracted.prevEmployerPhone || '',
    prevEmployerFax: '',
    prevEmployerCityStateZip: extracted.prevEmployerCityStateZip || '',
    employerName: defaults.companyName || 'Driver Pipeline',
    employerAttention: '',
    employerStreet: '1200 N. Union Bower Road',
    employerCityStateZip: 'Irving, TX 75061',
    employerPhone: '972-573-2301',
    employerFax: '',
    employerEmail: 'lmercado@driverpipeline.com',
    confFax: '',
    confEmail: '',
    employedByCompany: '',
    jobTitle: extracted.jobTitle || '',
    fromDate: extracted.fromDate || '',
    toDate: '',
    droveMotorVehicle: '',
    accidentHistory: '',
    otherAccidents: '',
    dotCompany: '',
    dotEmployee: '',
    infoReceivedFrom: '',
    infoReceivedDate: ''
  }, companyId);

  const placeholders = reportCols.map((_, i) => `$${i + 1}`).join(',');
  const inserted = await query(`insert into safety_reports (${reportCols.join(',')}) values (${placeholders}) returning id`, reportValues(base));
  const report = await safetyUpdateExistingReportFromLive(inserted.rows[0].id, companyId, host, clientGuid, orderGuid, safetySearch, extracted);
  return { action: 'created', report };
}

async function safetyCacheTazOrder(companyId: number, order: any) {
  if (!order?.orderGuid) return;
  try {
    await query(
      `insert into tazworks_order_cache (company_id, order_guid, file_number, applicant_name, order_status, order_type, ordered_date, completed_date, client_name, client_code, product_name, requested_by, search_flagged, source_modified_date, raw_order, last_seen_at, last_sync_run_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),null)
       on conflict (order_guid) do update set company_id=excluded.company_id,file_number=excluded.file_number,applicant_name=excluded.applicant_name,order_status=excluded.order_status,order_type=excluded.order_type,ordered_date=excluded.ordered_date,completed_date=excluded.completed_date,client_name=excluded.client_name,client_code=excluded.client_code,product_name=excluded.product_name,requested_by=excluded.requested_by,search_flagged=excluded.search_flagged,source_modified_date=excluded.source_modified_date,raw_order=excluded.raw_order,last_seen_at=now()`,
      [companyId, order.orderGuid, order.fileNumber || null, order.applicantName || null, order.orderStatus || null, order.orderType || null, order.orderedDate, order.completedDate, order.clientName || null, order.clientCode || null, order.productName || null, order.requestedBy || null, Boolean(order.searchFlagged), order.modifiedDate || order.createdDate || null, JSON.stringify(order.raw || {})]
    );
  } catch {
    // Cache failure should not stop Safety Performance discovery.
  }
}

async function safetyReportsLiveDiscover(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;
  if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' });

  const body = await readBody(req);
  const companyId = requestedCompanyId(req, user);
  const host = safetyNormalizeHost(body.host || body.tazworksHost || '');
  const clientGuid = safetyCleanText(body.clientGuid || body.tazworksClientGuid || process.env.TAZWORKS_CLIENT_GUID || '');
  const minFileNumber = Number(body.minFileNumber || 6184);
  const pageSize = Math.max(10, Math.min(50, Number(body.pageSize || 50)));
  const maxPages = Math.max(1, Math.min(200, Number(body.maxPages || 100)));
  const stopAtMinFileNumber = body.stopAtMinFileNumber !== false;

  if (!clientGuid) return json(res, 400, { status: 'error', message: 'Client GUID is required or TAZWORKS_CLIENT_GUID must be set in Vercel.' });

  const summary: any = {
    minFileNumber,
    pageSize,
    maxPages,
    pagesChecked: 0,
    ordersPulled: 0,
    candidatesGreaterThanMin: 0,
    noSafetySearch: 0,
    noRecords: 0,
    created: 0,
    updated: 0,
    skippedLowFileNumber: 0,
    stoppedAtMinFileNumber: false,
    stoppedAtFileNumber: '',
    skippedNoOrderGuid: 0,
    skippedNoFileNumber: 0,
    errorsCount: 0,
    samples: [],
    errors: []
  };

  const seen = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const payload = await proxyGet(safetyQuery('/tazworks/orders', { page, size: pageSize, clientGuid, host }));
    const list = arr(payload);
    summary.pagesChecked++;
    summary.ordersPulled += list.length;

    const pageNumbers = list.map((row: any) => safetyNumericFileNumber(orderFrom(row).fileNumber)).filter((n: number) => n > 0);
    if (stopAtMinFileNumber && pageNumbers.length && Math.max(...pageNumbers) <= minFileNumber) {
      summary.stoppedAtMinFileNumber = true;
      summary.stoppedAtFileNumber = String(Math.max(...pageNumbers));
      break;
    }

    for (const row of list) {
      const order = orderFrom(row);
      const orderGuid = safetyCleanText(order.orderGuid || '');
      const fileNumber = safetyCleanText(order.fileNumber || '');
      const numericFile = safetyNumericFileNumber(fileNumber);
      const key = orderGuid || fileNumber;
      if (!key || seen.has(key)) continue;
      seen.add(key);

      if (!orderGuid) {
        summary.skippedNoOrderGuid++;
        continue;
      }

      if (!numericFile) {
        summary.skippedNoFileNumber++;
        continue;
      }

      if (numericFile <= minFileNumber) {
        summary.skippedLowFileNumber++;
        continue;
      }

      summary.candidatesGreaterThanMin++;
      await safetyCacheTazOrder(companyId, order);

      try {
        const pulled = await safetyAllSearchResults(orderGuid, clientGuid, host);
        const safetySearch = safetyFindPerformanceSearch(pulled.payload);
        if (!safetySearch) {
          summary.noSafetySearch++;
          continue;
        }

        const extracted = safetyExtractLivePayload(safetySearch);
        if (!extracted) {
          summary.noRecords++;
          continue;
        }

        const result = await safetyCreateOrUpdateReportFromLive(companyId, host, clientGuid, orderGuid, order, safetySearch, extracted);
        if (result.action === 'created') summary.created++;
        else summary.updated++;

        if (summary.samples.length < 10) {
          summary.samples.push({
            action: result.action,
            fileNumber,
            applicantName: result.report?.applicantName || extracted.applicantName || order.applicantName || '',
            previousEmployer: result.report?.prevEmployerName || extracted.prevEmployerName || '',
            orderGuid,
            orderSearchGuid: extracted.orderSearchGuid || '',
            sourcePath: pulled.sourcePath || ''
          });
        }
      } catch (error: any) {
        summary.errorsCount++;
        if (summary.errors.length < 10) summary.errors.push(`${fileNumber || orderGuid}: ${errorMessage(error)}`);
      }
    }

    if (list.length < pageSize) break;
  }

  const stopMessage = summary.stoppedAtMinFileNumber ? ` Stopped when the remaining page was at/below file ${summary.stoppedAtFileNumber || minFileNumber}.` : '';
  const errorMessagePart = summary.errors.length ? ` First error: ${summary.errors[0]}` : '';
  const message = `Safety refresh completed. Created ${summary.created} new report(s), updated ${summary.updated}, no Safety Performance search on ${summary.noSafetySearch}.${stopMessage}${errorMessagePart}`;
  return json(res, 200, { status: 'ok', message, summary });
}
// PHASE12A72_AUTO_CREATE_NEW_SAFETY_REPORTS END

// PHASE12A71_LIVE_SAFETY_PERFORMANCE_PULL END

// PHASE12A70_DUAL_APPLICANT_EMPLOYER_RESPONSE_LINKS START
const SAFETY_RESPONSE_BOOL_FIELDS = new Set([
  'vehicleStraightTruck',
  'vehicleTractorSemitrailer',
  'vehicleBus',
  'vehicleCargoTank',
  'vehicleDoublesTriples',
  'vehicleOther',
  'dotAlcoholTestPositive',
  'dotDrugTestPositive',
  'dotRefusedTest',
  'dotOtherViolations',
  'dotPriorEmployerReportedViolation',
  'dotCompletedReturnToDutyProcess'
]);

const SAFETY_RESPONSE_TEXT_FIELDS = [
  'employedByCompany',
  'jobTitle',
  'fromDate',
  'toDate',
  'droveMotorVehicle',
  'accidentHistory',
  'accidentDate1',
  'accidentLocation1',
  'accidentInjuries1',
  'accidentFatalities1',
  'accidentHazmat1',
  'accidentDate2',
  'accidentLocation2',
  'accidentInjuries2',
  'accidentFatalities2',
  'accidentHazmat2',
  'accidentDate3',
  'accidentLocation3',
  'accidentInjuries3',
  'accidentFatalities3',
  'accidentHazmat3',
  'otherAccidents',
  'infoReceivedFrom',
  'infoReceivedDate'
];

const SAFETY_APPLICANT_TEXT_FIELDS = [
  'applicantName',
  'prevEmployerName',
  'prevEmployerEmail',
  'prevEmployerStreet',
  'prevEmployerPhone',
  'prevEmployerFax',
  'prevEmployerCityStateZip',
  'employerName',
  'employerAttention',
  'employerStreet',
  'employerCityStateZip',
  'employerPhone',
  'employerFax',
  'employerEmail',
  'confFax',
  'confEmail'
];

function safetyResponseClean(value: any) {
  return String(value ?? '').trim();
}

function safetyResponseBool(value: any) {
  const raw = String(value || '').toLowerCase();
  return value === true || raw === 'true' || raw === 'on' || raw === 'yes' || raw === '1';
}

function safetyResponseRole(value: any) {
  const role = String(value || '').trim().toLowerCase();
  return role === 'applicant' ? 'applicant' : 'employer';
}

async function verifySafetyResponseToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  if (payload.type !== 'safety_response') throw new Error('Invalid response link');
  const role = safetyResponseRole((payload as any).responseRole || (payload as any).role || 'employer');
  return { ...(payload as any), responseRole: role };
}

function parseApplicantSignature(notes: any) {
  const text = String(notes || '');
  const re = /\[Applicant Electronic Signature\]\s*Name:\s*([^\n|]+?)\s*\|\s*Date:\s*([^\n|]+)(?:\s*\|\s*IP:\s*([^\n]+))?/g;
  let match: RegExpExecArray | null;
  let last: any = null;
  while ((match = re.exec(text)) !== null) {
    last = {
      name: String(match[1] || '').trim(),
      signedAt: String(match[2] || '').trim(),
      ip: String(match[3] || '').trim()
    };
  }
  return last || { name: '', signedAt: '', ip: '' };
}

function publicSafetyResponseReport(row: any) {
  const allowed = [
    'id',
    'fileNumber',
    'applicantName',
    'created',
    'status',
    'followUpDate',
    'notes',
    'prevEmployerName',
    'prevEmployerEmail',
    'prevEmployerStreet',
    'prevEmployerPhone',
    'prevEmployerFax',
    'prevEmployerCityStateZip',
    'employerName',
    'employerAttention',
    'employerStreet',
    'employerCityStateZip',
    'employerPhone',
    'employerFax',
    'employerEmail',
    'confFax',
    'confEmail',
    'employedByCompany',
    'jobTitle',
    'fromDate',
    'toDate',
    'droveMotorVehicle',
    'vehicleStraightTruck',
    'vehicleTractorSemitrailer',
    'vehicleBus',
    'vehicleCargoTank',
    'vehicleDoublesTriples',
    'vehicleOther',
    'accidentHistory',
    'accidentDate1',
    'accidentLocation1',
    'accidentInjuries1',
    'accidentFatalities1',
    'accidentHazmat1',
    'accidentDate2',
    'accidentLocation2',
    'accidentInjuries2',
    'accidentFatalities2',
    'accidentHazmat2',
    'accidentDate3',
    'accidentLocation3',
    'accidentInjuries3',
    'accidentFatalities3',
    'accidentHazmat3',
    'otherAccidents',
    'dotAlcoholTestPositive',
    'dotDrugTestPositive',
    'dotRefusedTest',
    'dotOtherViolations',
    'dotPriorEmployerReportedViolation',
    'dotCompletedReturnToDutyProcess',
    'infoReceivedFrom',
    'infoReceivedDate'
  ];

  const out: any = {};
  allowed.forEach((key) => out[key] = row[key]);
  out.applicantSignature = parseApplicantSignature(row.notes);
  return out;
}

async function safetyResponseLink(req: any, res: any, user: any) {
  if (req.method !== 'POST') {
    return json(res, 405, { status: 'error', message: 'Method not allowed' });
  }

  const body = await readBody(req);
  const companyId = Number(body.companyId || user.companyId || 1);
  const fileNumber = String(body.fileNumber || body.referenceId || body.ReferenceId || '').trim();
  const reportId = Number(body.reportId || body.id || 0);
  const responseRole = safetyResponseRole(body.responseRole || body.role || body.linkType || 'employer');

  let report;
  if (reportId) {
    report = await query(
      `select id, "companyId", "fileNumber", "applicantName", "prevEmployerName", "prevEmployerEmail"
       from safety_reports
       where "companyId"=$1 and id=$2
       limit 1`,
      [companyId, reportId]
    );
  } else if (fileNumber) {
    report = await query(
      `select id, "companyId", "fileNumber", "applicantName", "prevEmployerName", "prevEmployerEmail"
       from safety_reports
       where "companyId"=$1 and trim("fileNumber"::text)=trim($2)
       order by id desc
       limit 1`,
      [companyId, fileNumber]
    );
  } else {
    return json(res, 400, { status: 'error', message: 'File number or report id is required' });
  }

  const row = report.rows[0];

  if (!row) {
    return json(res, 404, {
      status: 'error',
      message: reportId ? `Safety report not found for report id ${reportId}` : `Safety report not found for file ${fileNumber}`
    });
  }

  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const token = await new SignJWT({
    type: 'safety_response',
    responseRole,
    reportId: row.id,
    companyId: row.companyId,
    fileNumber: row.fileNumber
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('14d')
    .sign(secret());

  const origin = req.headers.origin || `https://${req.headers.host}`;
  const formUrl = `${origin}/employer-response.html?token=${encodeURIComponent(token)}`;

  return json(res, 200, {
    status: 'ok',
    formUrl,
    responseRole,
    linkLabel: responseRole === 'applicant' ? 'Applicant verification link' : 'Employer response link',
    expiresAt: expiresAt.toISOString(),
    report: row
  });
}

async function safetyResponsePublic(req: any, res: any) {
  const url = new URL(req.url || '/', 'https://local.test');

  if (req.method === 'GET') {
    const token = String(url.searchParams.get('token') || '');
    if (!token) return json(res, 400, { status: 'error', message: 'Missing response token' });

    const payload = await verifySafetyResponseToken(token);

    const result = await query(
      'select * from safety_reports where id=$1 and "companyId"=$2 limit 1',
      [Number(payload.reportId), Number(payload.companyId)]
    );

    const row = result.rows[0];
    if (!row) return json(res, 404, { status: 'error', message: 'Safety report not found' });

    return json(res, 200, {
      status: 'ok',
      responseRole: payload.responseRole,
      report: publicSafetyResponseReport(row)
    });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const token = String(body.token || '');

    if (!token) return json(res, 400, { status: 'error', message: 'Missing response token' });

    const payload = await verifySafetyResponseToken(token);

    if (payload.responseRole === 'applicant') {
      const signatureName = safetyResponseClean(body.signatureName);
      if (!signatureName) return json(res, 400, { status: 'error', message: 'Electronic signature is required' });

      const values: any[] = [];
      const assignments: string[] = [];

      SAFETY_APPLICANT_TEXT_FIELDS.forEach((field) => {
        values.push(safetyResponseClean(body[field]));
        assignments.push(`"${field}"=$${values.length}`);
      });

      const signedAt = new Date().toISOString();
      const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
      values.push(`[Applicant Electronic Signature] Name: ${signatureName} | Date: ${signedAt}${ip ? ` | IP: ${ip}` : ''}`);
      const noteParam = values.length;

      values.push(Number(payload.reportId));
      const reportParam = values.length;

      values.push(Number(payload.companyId));
      const companyParam = values.length;

      const sql = `
        update safety_reports
        set ${assignments.join(',')},
            status='S1 Complete',
            notes=trim(both E'\n' from concat(coalesce(notes,''), E'\n', $${noteParam}::text)),
            "updatedAt"=now()
        where id=$${reportParam} and "companyId"=$${companyParam}
        returning *
      `;

      const result = await query(sql, values);
      const row = result.rows[0];

      if (!row) return json(res, 404, { status: 'error', message: 'Safety report not found' });

      return json(res, 200, {
        status: 'ok',
        saved: true,
        responseRole: payload.responseRole
      });
    }

    const values: any[] = [];
    const assignments: string[] = [];

    SAFETY_RESPONSE_TEXT_FIELDS.forEach((field) => {
      values.push(safetyResponseClean(body[field]));
      assignments.push(`"${field}"=$${values.length}`);
    });

    SAFETY_RESPONSE_BOOL_FIELDS.forEach((field) => {
      values.push(safetyResponseBool(body[field]));
      assignments.push(`"${field}"=$${values.length}`);
    });

    const extraNotes = safetyResponseClean(body.notes);
    const completedBy = safetyResponseClean(body.infoReceivedFrom);
    const completedDate = safetyResponseClean(body.infoReceivedDate) || new Date().toISOString().slice(0, 10);

    values.push(`Employer response form submitted ${completedDate}${completedBy ? ` by ${completedBy}` : ''}.${extraNotes ? ` Notes: ${extraNotes}` : ''}`);
    const noteParam = values.length;

    values.push(Number(payload.reportId));
    const reportParam = values.length;

    values.push(Number(payload.companyId));
    const companyParam = values.length;

    const sql = `
      update safety_reports
      set ${assignments.join(',')},
          status='Emp Complete',
          "followUpDate"='',
          notes=trim(both E'\n' from concat(coalesce(notes,''), E'\n', $${noteParam}::text)),
          "updatedAt"=now()
      where id=$${reportParam} and "companyId"=$${companyParam}
      returning *
    `;

    const result = await query(sql, values);
    const row = result.rows[0];

    if (!row) return json(res, 404, { status: 'error', message: 'Safety report not found' });

    return json(res, 200, {
      status: 'ok',
      saved: true,
      responseRole: payload.responseRole
    });
  }

  return json(res, 405, { status: 'error', message: 'Method not allowed' });
}

async function safetyResponseDiagnostics(req: any, res: any, user: any) {
  if (!requireAdmin(user, res)) return;

  const companyId = requestedCompanyId(req, user);
  const url = new URL(req.url || '/', 'https://local.test');
  const fileNumber = String(url.searchParams.get('fileNumber') || '').trim();

  const checks: any[] = [];

  async function check(name: string, fn: any) {
    try {
      checks.push({ name, ok: true, value: await fn() });
    } catch (error: any) {
      checks.push({ name, ok: false, error: errorMessage(error) });
    }
  }

  await check('safety_reports table', async () => {
    const r = await query("select exists (select 1 from information_schema.tables where table_name='safety_reports') as exists");
    return r.rows[0]?.exists;
  });

  await check('safety_reports count', async () => {
    const r = await query('select count(*)::int as count from safety_reports where "companyId"=$1', [companyId]);
    return r.rows[0]?.count;
  });

  if (fileNumber) {
    await check('matching file number', async () => {
      const r = await query(
        'select id, "fileNumber", "applicantName", status from safety_reports where "companyId"=$1 and trim("fileNumber"::text)=trim($2) order by id desc limit 3',
        [companyId, fileNumber]
      );
      return r.rows;
    });
  }

  return json(res, 200, { status: 'ok', checks });
}

// PHASE12A70_DUAL_APPLICANT_EMPLOYER_RESPONSE_LINKS END


// PHASE12A65_SUPABASE_KEEPALIVE START
async function keepalive(req: any, res: any) {
  const url = new URL(req.url || '/', 'https://local.test');
  const providedSecret = String(url.searchParams.get('secret') || req.headers['x-cron-secret'] || '').trim();
  const expectedSecret = String(process.env.CRON_SECRET || '').trim();

  if (!expectedSecret) {
    return json(res, 500, {
      status: 'error',
      message: 'CRON_SECRET is missing in Vercel environment variables'
    });
  }

  if (providedSecret !== expectedSecret) {
    return json(res, 401, {
      status: 'error',
      message: 'Unauthorized keepalive request'
    });
  }

  const result = await query('select 1 as ok');
  return json(res, 200, {
    status: 'ok',
    keepalive: true,
    db: result.rows[0]?.ok === 1,
    checkedAt: new Date().toISOString()
  });
}
// PHASE12A65_SUPABASE_KEEPALIVE END

export default async function handler(req: any, res: any) {
  const route = getRoute(req);
  if (route === 'keepalive') return keepalive(req, res);
  if (route === 'safety-response') { try { return await safetyResponsePublic(req, res); } catch (error: any) { return json(res, 500, { status: 'error', message: errorMessage(error) || 'Could not load safety response form' }); } }
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
    if (route === 'safety-reports/live-pull') return safetyReportsLivePull(req, res, user);
    if (route === 'safety-reports/fax-fmcsa') return safetyReportsFaxFmcsa(req, res, user);
    if (route === 'safety-reports/live-discover') return safetyReportsLiveDiscover(req, res, user);
    if (route === 'safety-response-link') return safetyResponseLink(req, res, user);
    if (route === 'safety-response-diagnostics') return safetyResponseDiagnostics(req, res, user);
    if (route === 'import-safety-reports') return importSafetyReports(req, res, user);
    if (route === 'users') return users(req, res, user);
    if (route === 'notification-emails') return notificationEmails(req, res, user);
    if (route === 'email-templates') return emailTemplates(req, res, user);
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
    if (route === 'monitoring-on-off') return monitoringOnOffExports(req, res, user);
    if (route === 'monitoring-on-off/clear') return monitoringOnOffExportsClear(req, res, user);
    if (route === 'monitoring-on-off/repair') return monitoringOnOffExportsRepair(req, res, user);
    if (route === 'monitoring-on-off/update') return monitoringOnOffExportsUpdate(req, res, user);
    if (route === 'invoices/diagnostics') return invoiceDiagnostics(req, res, user);
    if (route === 'system-check') return systemCheck(req, res, user);
    return json(res, 404, { status: 'error', message: `Route not found: ${route}` });
  } catch (error: any) {
    return json(res, 500, { status: 'error', message: `API ${route} failed: ${errorMessage(error)}` });
  }
}