import pg from 'pg';
import { jwtVerify } from 'jose';

const { Pool } = pg;
let pool: any;
const SESSION_COOKIE = 'saffhire_session';

function json(res: any, statusCode: number, payload: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
async function readBody(req: any) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks: any[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}
function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  return pool;
}
async function query(text: string, params: any[] = []) { return getPool().query(text, params); }
function secret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing');
  return new TextEncoder().encode(process.env.JWT_SECRET);
}
function parseCookies(req: any) {
  const header = req.headers?.cookie || '';
  const out: any = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try { out[key] = decodeURIComponent(val); } catch { out[key] = val; }
  }
  return out;
}
async function getUser(req: any) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = Number(payload.sub);
    const result = await query('select id, username, "displayName", role, "isActive" from local_users where id=$1 limit 1', [id]);
    const user = result.rows[0] || null;
    if (!user || !user.isActive) return null;
    return user;
  } catch { return null; }
}
function validEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }
async function sendWithResend(to: string, subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SAFETY_FROM_EMAIL || process.env.EMAIL_FROM;
  const replyTo = process.env.SAFETY_REPLY_TO_EMAIL || process.env.EMAIL_REPLY_TO || from;
  if (!apiKey) throw new Error('RESEND_API_KEY is missing in Vercel Environment Variables');
  if (!from) throw new Error('SAFETY_FROM_EMAIL is missing in Vercel Environment Variables');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, html: text.replace(/\n/g, '<br />'), reply_to: replyTo }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Resend failed with status ${response.status}`);
  return payload;
}
export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return json(res, 405, { status: 'error', message: 'Method not allowed' });
    const user = await getUser(req);
    if (!user) return json(res, 401, { status: 'error', message: 'Login required' });
    const body = await readBody(req);
    const to = String(body.to || '').trim();
    const subject = String(body.subject || '').trim();
    const message = String(body.message || body.body || '').trim();
    const reportId = body.reportId ? Number(body.reportId) : null;
    const fileNumber = String(body.fileNumber || '').trim();
    if (!validEmail(to)) return json(res, 400, { status: 'error', message: 'Valid recipient email is required' });
    if (!subject) return json(res, 400, { status: 'error', message: 'Subject is required' });
    if (!message) return json(res, 400, { status: 'error', message: 'Email message is required' });
    const sent = await sendWithResend(to, subject, message);
    if (reportId) {
      const noteLine = `Direct email sent to ${to} on ${new Date().toISOString().slice(0, 10)} by ${user.displayName || user.username}.`;
      await query(`update safety_reports set status='Emp Sent', "followUpDate"=case when coalesce("followUpDate",'')='' then (current_date + interval '5 days')::date::text else "followUpDate" end, notes=trim(both E'\n' from concat(coalesce(notes,''), E'\n', $1)), "updatedAt"=now() where id=$2`, [noteLine, reportId]);
    }
    return json(res, 200, { status: 'ok', sent: true, provider: 'resend', id: sent?.id || null, to, fileNumber, reportId });
  } catch (error: any) {
    return json(res, 500, { status: 'error', message: error?.message || 'Could not send email' });
  }
}
