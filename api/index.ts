import pg from 'pg';
import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';

const { Pool } = pg;
let pool: any;
const SESSION_COOKIE = 'saffhire_session';
const SAFETY_STATUSES = new Set(['S1 Complete', 'Emp Sent', 'Emp Complete', 'Completed']);
const USER_ROLES = new Set(['admin', 'user', 'viewer']);
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
function getRoute(req: any) { const url = new URL(req.url || '/', 'https://local.test'); return url.searchParams.get('path') || url.pathname.replace(/^\/api\/?/, '').replace(/^\//, ''); }
function slugify(value: string) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company'; }
function normalizeMonitorStatus(value: any) { return String(value || '').trim().toLowerCase() === 'on' ? 'On' : 'Off'; }
function asBool(value: any) { const raw = String(value ?? '').trim().toLowerCase(); return value === true || raw === 'true' || raw === 'yes' || raw === 'y' || raw === '1' || raw === 'on' || raw === 'x'; }
function pick(row: any, keys: string[]) { for (const key of keys) if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key]; return ''; }

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
  const url = new URL(req.url || '/', 'https://local.test'); const companyId = Number(url.searchParams.get('companyId') || user.companyId || 1);
  if (req.method === 'GET') { const result = await query('select id, "fileNumber", "applicantName" as name, "orderDate", "monitorStatus", "mvrStatus", "medExpire", notes from applicants where "companyId"=$1 order by id desc limit 1000', [companyId]); return json(res, 200, { status: 'ok', applicants: result.rows }); }
  if (req.method === 'PATCH') { const body = await readBody(req); const id = Number(body.id); if (!id) return json(res, 400, { status: 'error', message: 'Applicant id is required' }); const current = await query('select * from applicants where id=$1 and "companyId"=$2 limit 1', [id, companyId]); if (!current.rows[0]) return json(res, 404, { status: 'error', message: 'Applicant not found' }); const monitorStatus = normalizeMonitorStatus(body.monitorStatus ?? current.rows[0].monitorStatus); const medExpire = body.medExpire ?? current.rows[0].medExpire; const notes = body.notes ?? current.rows[0].notes; const result = await query('update applicants set "monitorStatus"=$1, "medExpire"=$2, "medExpireOverridden"=$3, notes=$4, "updatedAt"=now() where id=$5 and "companyId"=$6 returning id, "fileNumber", "applicantName" as name, "orderDate", "monitorStatus", "mvrStatus", "medExpire", notes', [monitorStatus, medExpire || null, Boolean(medExpire), String(notes || ''), id, companyId]); return json(res, 200, { status: 'ok', applicant: result.rows[0] }); }
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
  const url = new URL(req.url || '/', 'https://local.test'); const companyId = Number(url.searchParams.get('companyId') || user.companyId || 1);
  if (req.method === 'GET') {
    let r = await query('select * from safety_reports where "companyId"=$1 order by id desc limit 500', [companyId]);
    let source = 'selected_company';
    if (r.rows.length === 0 && user.role === 'admin') {
      const fallback = await query('select * from safety_reports order by id desc limit 500');
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

// PHASE12A5_TAZWORKS_SYNC START
function tazworksSyncEnv() {
  const baseUrl = String(process.env.TAZWORKS_PROXY_BASE_URL || '').replace(/\/+$/, '');
  const proxySecret = String(process.env.TAZWORKS_PROXY_SECRET || '');
  const clientGuid = String(process.env.TAZWORKS_CLIENT_GUID || '');

  if (!baseUrl) throw new Error('TAZWORKS_PROXY_BASE_URL is missing');
  if (!proxySecret) throw new Error('TAZWORKS_PROXY_SECRET is missing');
  if (!clientGuid) throw new Error('TAZWORKS_CLIENT_GUID is missing');

  return { baseUrl, proxySecret, clientGuid };
}

function tazworksSafeMessage(errorText: string, statusCode?: number) {
  const value = String(errorText || '');
  if (statusCode === 401 || statusCode === 403 || /NOT_AUTHORIZED|NOT_AUTHENTICATED|not authorized|unauthorized/i.test(value)) {
    return 'Order access could not be verified.';
  }
  return 'The order connection is currently unavailable.';
}

function tazworksPayloadKeys(payload: any) {
  if (!payload || typeof payload !== 'object') return [];
  return Object.keys(payload).slice(0, 30);
}

function tazworksFindArrays(payload: any, path = '', depth = 0): any[] {
  if (!payload || depth > 3) return [];
  if (Array.isArray(payload)) return [{ path: path || 'root', value: payload }];
  if (typeof payload !== 'object') return [];

  const found: any[] = [];
  for (const [key, value] of Object.entries(payload)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (Array.isArray(value)) found.push({ path: nextPath, value });
    else if (value && typeof value === 'object') found.push(...tazworksFindArrays(value, nextPath, depth + 1));
  }
  return found;
}

function tazworksLooksLikeOrder(row: any) {
  if (!row || typeof row !== 'object') return false;
  return Boolean(
    row.orderGuid ||
    row.guid ||
    row.id ||
    row.fileNumber ||
    row.fileNo ||
    row.orderNumber ||
    row.applicantName ||
    row.subjectName ||
    row.orderStatus ||
    row.status
  );
}

function tazworksArray(payload: any) {
  const preferred = [
    payload,
    payload?.content,
    payload?.orders,
    payload?.items,
    payload?.data,
    payload?.results,
    payload?.response,
    payload?.response?.content,
    payload?.response?.orders,
    payload?._embedded?.orders,
    payload?._embedded?.content,
  ];

  for (const candidate of preferred) {
    if (Array.isArray(candidate) && candidate.some(tazworksLooksLikeOrder)) return candidate;
  }

  const arrays = tazworksFindArrays(payload);
  const best = arrays.find((item) => item.value.some(tazworksLooksLikeOrder));
  return best ? best.value : [];
}

function tazworksArrayPath(payload: any) {
  const preferred: Array<[string, any]> = [
    ['root', payload],
    ['content', payload?.content],
    ['orders', payload?.orders],
    ['items', payload?.items],
    ['data', payload?.data],
    ['results', payload?.results],
    ['response', payload?.response],
    ['response.content', payload?.response?.content],
    ['response.orders', payload?.response?.orders],
    ['_embedded.orders', payload?._embedded?.orders],
    ['_embedded.content', payload?._embedded?.content],
  ];

  for (const [path, candidate] of preferred) {
    if (Array.isArray(candidate) && candidate.some(tazworksLooksLikeOrder)) return path;
  }

  const arrays = tazworksFindArrays(payload);
  const best = arrays.find((item) => item.value.some(tazworksLooksLikeOrder));
  return best ? best.path : 'not_found';
}

function tazworksIso(value: any) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function tazworksDateOnly(value: any) {
  const iso = tazworksIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function tazworksOrder(row: any) {
  return {
    orderGuid: row.orderGuid || row.guid || row.id || '',
    fileNumber: row.fileNumber || row.fileNo || row.orderNumber || '',
    orderStatus: row.orderStatus || row.status || '',
    orderType: row.orderType || row.type || '',
    orderedDate: tazworksIso(row.orderedDate || row.orderDate),
    completedDate: tazworksIso(row.completedDate),
    applicantName: row.applicantName || row.subjectName || row.name || '',
    clientName: row.clientName || '',
    clientCode: row.clientCode || '',
    productName: row.productName || row.packageName || '',
    requestedBy: row.requestedBy || row.requestor || '',
    searchFlagged: Boolean(row.searchFlagged || row.flagged),
    createdDate: tazworksIso(row.createdDate || row.createdAt),
    modifiedDate: tazworksIso(row.modifiedDate || row.updatedAt),
    raw: row,
  };
}

async function tazworksProxyGet(proxyPath: string) {
  const env = tazworksSyncEnv();
  const response = await fetch(`${env.baseUrl}${proxyPath}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.proxySecret}`,
      Accept: 'application/json',
    },
  });

  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }

  if (!response.ok) {
    const msg = payload?.message || payload?.error || raw || `Proxy returned ${response.status}`;
    const err: any = new Error(tazworksSafeMessage(msg, response.status));
    err.statusCode = err.message === 'Order access could not be verified.' ? 403 : 503;
    throw err;
  }

  return payload;
}

async function tazworksSyncRuns(req: any, res: any, user: any) {
  if (req.method !== 'GET') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  if (!requireAdmin(user, res)) return;

  const result = await query('select * from tazworks_sync_runs order by started_at desc limit 25');
  return json(res, 200, { status: 'ok', runs: result.rows });
}

async function tazworksSyncRun(req: any, res: any, user: any) {
  if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  if (!requireAdmin(user, res)) return;

  const companyId = Number(user.companyId || 1);
  const startedBy = user.username || user.displayName || 'admin';

  const runInsert = await query(
    'insert into tazworks_sync_runs (status, triggered_by, message) values ($1,$2,$3) returning id',
    ['running', startedBy, 'Manual sync started']
  );

  const runId = runInsert.rows[0].id;

  let ordersPulled = 0;
  let applicantsUpserted = 0;
  let safetyReportsUpdated = 0;
  let errorsCount = 0;
  const errors: string[] = [];
  const pageSummaries: any[] = [];
  const dedupe = new Map<string, any>();

  try {
    const env = tazworksSyncEnv();
    const maxPages = 5;
    const size = 10;

    for (let page = 0; page < maxPages; page++) {
      const payload = await tazworksProxyGet(`/tazworks/orders?page=${page}&size=${size}&clientGuid=${encodeURIComponent(env.clientGuid)}`);
      const list = tazworksArray(payload);
      const path = tazworksArrayPath(payload);
      const keys = tazworksPayloadKeys(payload);

      pageSummaries.push({
        page,
        size,
        arrayPath: path,
        arrayCount: list.length,
        topLevelKeys: keys,
      });

      for (const row of list) {
        const order = tazworksOrder(row);
        const key = String(order.orderGuid || order.fileNumber || JSON.stringify(row).slice(0, 100));
        if (!dedupe.has(key)) dedupe.set(key, order);
      }

      if (list.length < size) break;
    }

    const orders = Array.from(dedupe.values()).filter((order: any) => order.orderGuid || order.fileNumber);
    ordersPulled = orders.length;

    for (const order of orders) {
      try {
        await query(
          `insert into tazworks_order_cache
            (company_id, order_guid, file_number, applicant_name, order_status, order_type, ordered_date, completed_date, client_name, client_code, product_name, requested_by, search_flagged, source_modified_date, raw_order, last_seen_at, last_sync_run_id)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),$16)
            on conflict (order_guid) do update set
              company_id=excluded.company_id,
              file_number=excluded.file_number,
              applicant_name=excluded.applicant_name,
              order_status=excluded.order_status,
              order_type=excluded.order_type,
              ordered_date=excluded.ordered_date,
              completed_date=excluded.completed_date,
              client_name=excluded.client_name,
              client_code=excluded.client_code,
              product_name=excluded.product_name,
              requested_by=excluded.requested_by,
              search_flagged=excluded.search_flagged,
              source_modified_date=excluded.source_modified_date,
              raw_order=excluded.raw_order,
              last_seen_at=now(),
              last_sync_run_id=excluded.last_sync_run_id`,
          [
            companyId,
            order.orderGuid || `file-${order.fileNumber}`,
            order.fileNumber || null,
            order.applicantName || null,
            order.orderStatus || null,
            order.orderType || null,
            order.orderedDate,
            order.completedDate,
            order.clientName || null,
            order.clientCode || null,
            order.productName || null,
            order.requestedBy || null,
            Boolean(order.searchFlagged),
            order.modifiedDate || order.createdDate || null,
            JSON.stringify(order.raw || {}),
            runId,
          ]
        );

        if (order.fileNumber) {
          await query(
            `insert into applicants ("companyId","fileNumber","applicantName","orderDate","monitorStatus","mvrStatus",notes)
              values ($1,$2,$3,$4,$5,$6,$7)
              on conflict ("fileNumber","companyId") do update set
                "applicantName" = case when excluded."applicantName" <> '' then excluded."applicantName" else applicants."applicantName" end,
                "orderDate" = coalesce(excluded."orderDate", applicants."orderDate"),
                "mvrStatus" = coalesce(excluded."mvrStatus", applicants."mvrStatus"),
                "updatedAt" = now()`,
            [
              companyId,
              String(order.fileNumber),
              String(order.applicantName || 'REVIEW NAME NEEDED'),
              tazworksDateOnly(order.orderedDate || order.createdDate),
              'On',
              String(order.orderStatus || ''),
              '',
            ]
          );

          applicantsUpserted++;

          const safetyUpdate = await query(
            `update safety_reports
              set "applicantName" = case when $1 <> '' then $1 else "applicantName" end,
                  "updatedAt" = now()
              where "companyId"=$2 and "fileNumber"=$3
              returning id`,
            [String(order.applicantName || ''), companyId, String(order.fileNumber)]
          );

          safetyReportsUpdated += safetyUpdate.rowCount || 0;
        }
      } catch (orderError: any) {
        errorsCount++;
        errors.push(String(orderError?.message || orderError));
      }
    }

    const status = errorsCount ? 'completed_with_errors' : 'completed';
    const message = ordersPulled === 0
      ? 'Sync completed but no orders were found. Check raw_summary for payload keys and array path.'
      : errorsCount
        ? `Sync completed with ${errorsCount} record error(s). Pulled ${ordersPulled} orders.`
        : `Sync completed. Pulled ${ordersPulled} orders.`;

    await query(
      'update tazworks_sync_runs set status=$1, completed_at=now(), orders_pulled=$2, applicants_upserted=$3, safety_reports_updated=$4, errors_count=$5, message=$6, raw_summary=$7 where id=$8',
      [
        status,
        ordersPulled,
        applicantsUpserted,
        safetyReportsUpdated,
        errorsCount,
        message,
        JSON.stringify({
          pages: pageSummaries,
          uniqueOrderCount: ordersPulled,
          errors: errors.slice(0, 10),
        }),
        runId,
      ]
    );

    return json(res, 200, {
      status: 'ok',
      runId,
      ordersPulled,
      applicantsUpserted,
      safetyReportsUpdated,
      errorsCount,
      message,
      pages: pageSummaries,
    });
  } catch (error: any) {
    const safe = error?.message || 'The order connection is currently unavailable.';

    await query(
      'update tazworks_sync_runs set status=$1, completed_at=now(), errors_count=$2, message=$3, raw_summary=$4 where id=$5',
      [
        'failed',
        errorsCount + 1,
        safe,
        JSON.stringify({
          pages: pageSummaries,
          errors: [safe, ...errors].slice(0, 10),
        }),
        runId,
      ]
    );

    return json(res, error?.statusCode || 503, {
      status: 'error',
      message: safe,
      runId,
    });
  }
}

async function tazworksSyncDebug(req: any, res: any, user: any) {
  if (req.method !== 'GET') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  if (!requireAdmin(user, res)) return;

  const result = await query('select id, status, message, raw_summary from tazworks_sync_runs order by started_at desc limit 1');
  return json(res, 200, { status: 'ok', latest: result.rows[0] || null });
}
// PHASE12A5_TAZWORKS_SYNC END


export default async function handler(req: any, res: any) {
  const route = getRoute(req);
  try {
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
    if (route === 'tazworks-sync/debug') return tazworksSyncDebug(req, res, user);
    if (route === 'system-check') return systemCheck(req, res, user);
    return json(res, 404, { status: 'error', message: `Route not found: ${route}` });
  } catch (error: any) {
    return json(res, 500, { status: 'error', message: `API ${route} failed: ${errorMessage(error)}` });
  }
}