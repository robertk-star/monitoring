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
  if (typeof req.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
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

async function query(text: string, params: any[] = []) {
  return getPool().query(text, params);
}

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
    const r = await query('select id, username, "displayName", role, "isActive", "companyId" from local_users where id=$1 limit 1', [id]);
    const user = r.rows[0] || null;
    if (!user || !user.isActive) return null;
    return user;
  } catch {
    return null;
  }
}

function requireAdmin(user: any, res: any) {
  if (!user) {
    json(res, 401, { status: 'error', message: 'Login required' });
    return false;
  }
  if (user.role !== 'admin') {
    json(res, 403, { status: 'error', message: 'Admin access required' });
    return false;
  }
  return true;
}

async function ensureTable() {
  await query(`
    create table if not exists medical_pdf_uploads (
      id bigserial primary key,
      "companyId" integer not null references companies(id) on delete cascade,
      "fileName" text not null,
      "mimeType" text not null default 'application/pdf',
      "fileSize" integer not null default 0,
      "pdfData" bytea not null,
      "uploadedBy" integer references local_users(id) on delete set null,
      "uploadedAt" timestamptz not null default now(),
      "extractedExpirationDate" text,
      "extractedFileNumber" text,
      "extractedApplicantName" text,
      "matchedApplicantId" bigint references applicants(id) on delete set null,
      "scanStatus" text not null default 'uploaded',
      "scanMessage" text,
      "scannedAt" timestamptz
    )
  `);
  await query('create index if not exists medical_pdf_uploads_company_idx on medical_pdf_uploads ("companyId")');
  await query('create index if not exists medical_pdf_uploads_status_idx on medical_pdf_uploads ("scanStatus")');
}

function normalizeName(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function parseDateCandidate(raw: string) {
  const value = String(raw || '').trim();
  let m = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? Number(`20${m[3]}`) : Number(m[3]);
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;

  const d = new Date(value);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  return '';
}

function dateScore(iso: string) {
  if (!iso) return -999;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return -999;
  const now = new Date();
  const days = Math.round((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (days < -365) return -20;
  if (days < 0) return 1;
  if (days <= 365 * 3) return 4;
  if (days <= 365 * 5) return 2;
  return -2;
}

function findMedicalExpiration(text: string) {
  const clean = String(text || '').replace(/\s+/g, ' ');
  const dateRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+\d{1,2},?\s+\d{4})/gi;
  const candidates: any[] = [];
  let match: RegExpExecArray | null;

  while ((match = dateRegex.exec(clean))) {
    const rawDate = match[1];
    const iso = parseDateCandidate(rawDate.replace(',', ''));
    if (!iso) continue;

    const start = Math.max(0, match.index - 140);
    const end = Math.min(clean.length, match.index + rawDate.length + 140);
    const context = clean.slice(start, end).toLowerCase();

    let score = dateScore(iso);
    if (/medical/.test(context)) score += 3;
    if (/certificate|certification|examiner|dot|card/.test(context)) score += 2;
    if (/expir|expires|valid through|valid until|qualified until/.test(context)) score += 5;
    if (/birth|dob|date of birth|issued|exam date|examination date|signature|certified by/.test(context)) score -= 4;

    candidates.push({ iso, rawDate, score, context: clean.slice(start, end) });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 5) return { date: '', rawMatch: '', reason: 'No high-confidence medical expiration date found' };
  return { date: best.iso, rawMatch: best.rawDate, reason: `Matched ${best.rawDate}` };
}

function findFileNumber(text: string, fileName: string) {
  const combined = `${fileName || ''} ${text || ''}`;
  const patterns = [
    /file\s*(?:number|#|no\.?)\s*[:#]?\s*([A-Z0-9\-_.]{3,20})/i,
    /order\s*(?:number|#|no\.?)\s*[:#]?\s*([A-Z0-9\-_.]{3,20})/i,
  ];
  for (const p of patterns) {
    const m = combined.match(p);
    if (m) return m[1];
  }

  const filenameMatch = String(fileName || '').match(/(?:^|[^0-9])(\d{4,8})(?:[^0-9]|$)/);
  if (filenameMatch) return filenameMatch[1];

  return '';
}

function findApplicantName(text: string) {
  const clean = String(text || '').replace(/\s+/g, ' ');
  const patterns = [
    /driver\s+name\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i,
    /applicant\s+name\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i,
    /name\s+of\s+driver\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i,
  ];
  for (const p of patterns) {
    const m = clean.match(p);
    if (m) return m[1].trim().replace(/\s{2,}/g, ' ');
  }
  return '';
}

async function extractPdfText(buffer: Buffer) {
  const imported: any = await import('pdf-parse');
  const pdfParse = imported.default || imported;
  const result = await pdfParse(buffer);
  return result.text || '';
}

async function findApplicant(companyId: number, fileNumber: string, applicantName: string) {
  if (fileNumber) {
    const byFile = await query('select id, "fileNumber", "applicantName" from applicants where "companyId"=$1 and "fileNumber"=$2 limit 1', [companyId, fileNumber]);
    if (byFile.rows[0]) return byFile.rows[0];
  }

  if (applicantName) {
    const rows = await query('select id, "fileNumber", "applicantName" from applicants where "companyId"=$1 limit 2000', [companyId]);
    const target = normalizeName(applicantName);
    const match = rows.rows.find((row: any) => {
      const existing = normalizeName(row.applicantName || '');
      return existing && (existing === target || existing.includes(target) || target.includes(existing));
    });
    if (match) return match;
  }

  return null;
}

async function listUploads(companyId: number) {
  const r = await query(
    `select id, "fileName", "fileSize", "uploadedAt", "extractedExpirationDate", "extractedFileNumber", "extractedApplicantName",
            "matchedApplicantId", "scanStatus", "scanMessage", "scannedAt"
     from medical_pdf_uploads
     where "companyId"=$1
     order by id desc
     limit 100`,
    [companyId]
  );
  return r.rows;
}

async function handleUpload(req: any, res: any, user: any) {
  const body = await readBody(req);
  const companyId = Number(body.companyId || user.companyId || 1);
  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) return json(res, 400, { status: 'error', message: 'No PDF files were received' });

  let uploaded = 0;
  const rows: any[] = [];
  for (const file of files) {
    const fileName = String(file.fileName || 'uploaded.pdf').trim();
    const mimeType = String(file.mimeType || 'application/pdf').trim();
    const base64 = String(file.base64 || '').split(',').pop() || '';
    const buffer = Buffer.from(base64, 'base64');

    if (!buffer.length) continue;
    if (buffer.length > 6 * 1024 * 1024) {
      rows.push({ fileName, status: 'skipped', message: 'File is larger than 6MB' });
      continue;
    }

    const r = await query(
      `insert into medical_pdf_uploads ("companyId","fileName","mimeType","fileSize","pdfData","uploadedBy","scanStatus")
       values ($1,$2,$3,$4,$5,$6,'uploaded')
       returning id, "fileName", "fileSize", "scanStatus"`,
      [companyId, fileName, mimeType, buffer.length, buffer, user.id]
    );
    uploaded += 1;
    rows.push(r.rows[0]);
  }

  return json(res, 200, { status: 'ok', uploaded, rows, uploads: await listUploads(companyId) });
}

async function handleScan(req: any, res: any, user: any) {
  const body = await readBody(req);
  const companyId = Number(body.companyId || user.companyId || 1);
  const scanAll = Boolean(body.scanAll);
  const filter = scanAll ? '' : `and "scanStatus" in ('uploaded','no_match','no_date','error')`;

  const uploads = await query(
    `select id, "fileName", "pdfData" from medical_pdf_uploads where "companyId"=$1 ${filter} order by id asc limit 100`,
    [companyId]
  );

  const results: any[] = [];
  let updated = 0;
  let noMatch = 0;
  let noDate = 0;
  let errors = 0;

  for (const upload of uploads.rows) {
    try {
      const buffer = Buffer.from(upload.pdfData);
      const text = await extractPdfText(buffer);
      const exp = findMedicalExpiration(text);
      const extractedFileNumber = findFileNumber(text, upload.fileName);
      const extractedApplicantName = findApplicantName(text);

      if (!exp.date) {
        noDate += 1;
        await query(
          `update medical_pdf_uploads
           set "extractedFileNumber"=$1, "extractedApplicantName"=$2, "scanStatus"='no_date',
               "scanMessage"=$3, "scannedAt"=now()
           where id=$4`,
          [extractedFileNumber || null, extractedApplicantName || null, exp.reason, upload.id]
        );
        results.push({ id: upload.id, fileName: upload.fileName, status: 'no_date', message: exp.reason });
        continue;
      }

      const applicant = await findApplicant(companyId, extractedFileNumber, extractedApplicantName);
      if (!applicant) {
        noMatch += 1;
        await query(
          `update medical_pdf_uploads
           set "extractedExpirationDate"=$1, "extractedFileNumber"=$2, "extractedApplicantName"=$3, "scanStatus"='no_match',
               "scanMessage"=$4, "scannedAt"=now()
           where id=$5`,
          [exp.date, extractedFileNumber || null, extractedApplicantName || null, 'Expiration found but no matching applicant/file number was found', upload.id]
        );
        results.push({ id: upload.id, fileName: upload.fileName, status: 'no_match', expirationDate: exp.date, fileNumber: extractedFileNumber, applicantName: extractedApplicantName, message: 'No matching applicant' });
        continue;
      }

      const noteLine = `Medical expiration updated from uploaded PDF ${upload.fileName} on ${new Date().toISOString().slice(0, 10)}.`;
      await query(
        `update applicants
         set "medExpire"=$1,
             "medExpireOverridden"=true,
             notes=trim(both E'\n' from concat(coalesce(notes,''), E'\n', $2)),
             "updatedAt"=now()
         where id=$3 and "companyId"=$4`,
        [exp.date, noteLine, applicant.id, companyId]
      );

      await query(
        `update medical_pdf_uploads
         set "extractedExpirationDate"=$1, "extractedFileNumber"=$2, "extractedApplicantName"=$3,
             "matchedApplicantId"=$4, "scanStatus"='updated',
             "scanMessage"=$5, "scannedAt"=now()
         where id=$6`,
        [exp.date, extractedFileNumber || applicant.fileNumber, extractedApplicantName || applicant.applicantName, applicant.id, `Updated ${applicant.applicantName} (${applicant.fileNumber}) to ${exp.date}`, upload.id]
      );

      updated += 1;
      results.push({ id: upload.id, fileName: upload.fileName, status: 'updated', expirationDate: exp.date, fileNumber: applicant.fileNumber, applicantName: applicant.applicantName });
    } catch (error: any) {
      errors += 1;
      await query(
        `update medical_pdf_uploads set "scanStatus"='error', "scanMessage"=$1, "scannedAt"=now() where id=$2`,
        [error?.message || 'PDF scan failed', upload.id]
      );
      results.push({ id: upload.id, fileName: upload.fileName, status: 'error', message: error?.message || 'PDF scan failed' });
    }
  }

  return json(res, 200, {
    status: 'ok',
    summary: { scanned: uploads.rows.length, updated, noMatch, noDate, errors },
    results,
    uploads: await listUploads(companyId)
  });
}

export default async function handler(req: any, res: any) {
  try {
    const user = await getUser(req);
    if (!requireAdmin(user, res)) return;
    await ensureTable();

    const url = new URL(req.url || '/', 'https://local.test');
    const action = url.searchParams.get('action') || '';

    if (req.method === 'GET') {
      const companyId = Number(url.searchParams.get('companyId') || user.companyId || 1);
      return json(res, 200, { status: 'ok', uploads: await listUploads(companyId) });
    }

    if (req.method === 'POST' && action === 'upload') return handleUpload(req, res, user);
    if (req.method === 'POST' && action === 'scan') return handleScan(req, res, user);

    return json(res, 405, { status: 'error', message: 'Method/action not allowed' });
  } catch (error: any) {
    return json(res, 500, { status: 'error', message: error?.message || 'Medical PDF API failed' });
  }
}
