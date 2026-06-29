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

function normalizeFileNumber(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeName(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function parseDateCandidate(raw: string) {
  const value = String(raw || '').trim().replace(',', '');
  let m = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? Number(`20${m[3]}`) : Number(m[3]);
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  m = value.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;

  const d = new Date(value);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  return '';
}

function findTazWorksMedicalCertificateExpiration(text: string) {
  const raw = String(text || '');
  const normalized = raw.replace(/\r/g, '\n');

  const sectionMatch =
    normalized.match(/medical\s+certificate[\s\S]{0,1800}?(?:self\s+certification|restrictions|examiner|$)/i) ||
    normalized.match(/medical\s+certificate[\s\S]{0,1800}/i);

  const section = sectionMatch ? sectionMatch[0] : normalized;

  const exact =
    section.match(/expiration\s+date\s*[:\-]?\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i) ||
    section.match(/expires?\s*[:\-]?\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);

  if (exact) {
    const iso = parseDateCandidate(exact[1]);
    if (iso) return iso;
  }

  return '';
}

function findDateNear(text: string, keywords: RegExp, negative?: RegExp) {
  const clean = String(text || '').replace(/\s+/g, ' ');
  const dateRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/gi;
  const candidates: any[] = [];
  let match: RegExpExecArray | null;

  while ((match = dateRegex.exec(clean))) {
    const rawDate = match[1];
    const iso = parseDateCandidate(rawDate);
    if (!iso) continue;
    const start = Math.max(0, match.index - 180);
    const end = Math.min(clean.length, match.index + rawDate.length + 180);
    const context = clean.slice(start, end).toLowerCase();

    let score = 0;
    if (keywords.test(context)) score += 10;
    if (/medical/.test(context)) score += 5;
    if (/certificate|certification|examiner|dot|card|physical|mec|med cert/.test(context)) score += 4;
    if (/expir|expires|expiration|valid through|valid until|qualified until|certificate expiration|card expiration/.test(context)) score += 8;
    if (negative && negative.test(context)) score -= 8;
    if (/date of birth|birth|dob|ssn|social|issued|order date|report date|request date|signature|certified by|completed/.test(context)) score -= 5;

    candidates.push({ iso, rawDate, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.score >= 8 ? candidates[0].iso : '';
}

function findMedicalExpiration(text: string) {
  return findTazWorksMedicalCertificateExpiration(text) ||
    findDateNear(
      text,
      /medical|med\s*expire|med\s*expiration|medical\s*expiration|medical\s*expires|medical\s*cert|medical\s*card|dot\s*physical|physical\s*expiration|mec|examiner|certificate|certification|expiration|expires|valid through|valid until|qualified until/i,
      /birth|dob|date of birth|ssn|social|issued|order date|report date|request date|signature|certified by/i
    ) ||
    '';
}

function findOrderDate(text: string, fallbackIso: string) {
  return findDateNear(
    text,
    /order date|ordered|request date|created|application date|date ordered|report date/i,
    /expiration|expires|valid until|valid through|medical|date of birth|dob/i
  ) || fallbackIso || new Date().toISOString().slice(0, 10);
}

function findFileNumber(text: string, fileName: string) {
  const name = String(fileName || '');
  const taz = name.match(/report[_\-\s]*(\d{3,10})\.pdf$/i);
  if (taz) return taz[1];

  const nameNum = name.match(/(?:^|[^0-9])(\d{3,10})(?:[^0-9]|$)/);
  if (nameNum) return nameNum[1];

  const combined = `${name} ${text || ''}`;
  const patterns = [
    /file\s*(?:number|#|no\.?)\s*[:#]?\s*([A-Z0-9\-_.]{3,20})/i,
    /order\s*(?:number|#|no\.?)\s*[:#]?\s*([A-Z0-9\-_.]{3,20})/i,
    /candidate\s*(?:id|#)\s*[:#]?\s*([A-Z0-9\-_.]{3,20})/i,
    /report\s*(?:id|#|number)?\s*[:#]?\s*([0-9]{3,10})/i
  ];

  for (const p of patterns) {
    const m = combined.match(p);
    if (m) return m[1];
  }

  return '';
}

function cleanupName(name: string) {
  return String(name || '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\b(SSN|DOB|Date|DRIVERS LICENSE|DRIVER LICENSE|PHONE NUMBER|E-MAIL|EMAIL|ADDRESS|CITY|STATE|ZIP|File|Order|Report)\b.*$/i, '')
    .trim()
    .toUpperCase();
}

function findApplicantName(text: string) {
  const raw = String(text || '').replace(/\r/g, '\n');
  const clean = raw.replace(/\s+/g, ' ');

  const applicantLine = clean.match(/\bAPPLICANT\s+(.+?)(?:\s+SSN\b|\s+DOB\b|\s+DRIVERS?\s+LICENSE\b|\s+PHONE\s+NUMBER\b|\s+E-?MAIL\b|\s+ADDRESS\b|$)/i);
  if (applicantLine && applicantLine[1]) {
    const name = cleanupName(applicantLine[1]);
    if (name && name.length >= 3) return name;
  }

  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (/^APPLICANT$/i.test(lines[i]) && lines[i + 1]) {
      const name = cleanupName(lines[i + 1]);
      if (name && name.length >= 3) return name;
    }
    const sameLine = lines[i].match(/^APPLICANT\s+(.+)$/i);
    if (sameLine) {
      const name = cleanupName(sameLine[1]);
      if (name && name.length >= 3) return name;
    }
  }

  const patterns = [
    /applicant\s+name\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i,
    /candidate\s+name\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i,
    /driver\s+name\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i,
    /name\s+of\s+driver\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i,
    /employee\s+name\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i
  ];

  for (const p of patterns) {
    const m = clean.match(p);
    if (m) return cleanupName(m[1]);
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
  const norm = normalizeFileNumber(fileNumber);
  const digits = String(fileNumber || '').replace(/[^0-9]/g, '');

  if (norm) {
    const byNorm = await query(
      `select id, "fileNumber", "applicantName"
       from applicants
       where "companyId"=$1
         and lower(regexp_replace("fileNumber", '[^a-zA-Z0-9]', '', 'g'))=$2
       limit 1`,
      [companyId, norm]
    );
    if (byNorm.rows[0]) return byNorm.rows[0];
  }

  if (digits) {
    const byDigits = await query(
      `select id, "fileNumber", "applicantName"
       from applicants
       where "companyId"=$1
         and regexp_replace("fileNumber", '[^0-9]', '', 'g')=$2
       limit 1`,
      [companyId, digits]
    );
    if (byDigits.rows[0]) return byDigits.rows[0];
  }

  if (applicantName) {
    const rows = await query('select id, "fileNumber", "applicantName" from applicants where "companyId"=$1 limit 3000', [companyId]);
    const target = normalizeName(applicantName);
    const match = rows.rows.find((row: any) => {
      const existing = normalizeName(row.applicantName || '');
      return existing && (existing === target || existing.includes(target) || target.includes(existing));
    });
    if (match) return match;
  }

  return null;
}

async function upsertApplicant(companyId: number, data: any) {
  const fileNumber = String(data.fileNumber || '').trim();
  let applicantName = String(data.applicantName || '').trim();

  if (!fileNumber) throw new Error('Cannot create Monitoring record without a file number');
  if (!applicantName) applicantName = 'REVIEW NAME NEEDED';

  const r = await query(
    `insert into applicants ("companyId","fileNumber","applicantName","orderDate","monitorStatus","mvrStatus","medExpire","medExpireOverridden",notes)
     values ($1,$2,$3,$4,'On','',$5,$6,'')
     on conflict ("fileNumber","companyId") do update set
       "applicantName"=case
          when applicants."applicantName" is null or applicants."applicantName"='' or applicants."applicantName"='REVIEW NAME NEEDED'
          then excluded."applicantName"
          else applicants."applicantName"
        end,
       "orderDate"=coalesce(nullif(applicants."orderDate",''), excluded."orderDate"),
       "medExpire"=coalesce(excluded."medExpire", applicants."medExpire"),
       "medExpireOverridden"=case when excluded."medExpire" is not null then true else applicants."medExpireOverridden" end,
       "updatedAt"=now()
     returning id, "fileNumber", "applicantName"`,
    [
      companyId,
      fileNumber,
      applicantName,
      data.orderDate || new Date().toISOString().slice(0, 10),
      data.medExpire || null,
      Boolean(data.medExpire)
    ]
  );
  return r.rows[0];
}

async function handleImport(req: any, res: any, user: any) {
  const body = await readBody(req);
  const companyId = Number(body.companyId || user.companyId || 1);
  const files = Array.isArray(body.files) ? body.files : [];

  if (!files.length) return json(res, 400, { status: 'error', message: 'No PDF files were received' });

  const results: any[] = [];
  const summary = { scanned: 0, created: 0, updated: 0, skipped: 0, errors: 0 };

  for (const file of files) {
    const fileName = String(file.fileName || 'uploaded.pdf').trim();
    const base64 = String(file.base64 || '').split(',').pop() || '';
    const buffer = Buffer.from(base64, 'base64');

    summary.scanned++;

    try {
      if (!buffer.length) {
        summary.skipped++;
        results.push({ fileName, status: 'skipped', message: 'Empty PDF file' });
        continue;
      }

      if (buffer.length > 6 * 1024 * 1024) {
        summary.skipped++;
        results.push({ fileName, status: 'skipped', message: 'File is larger than 6MB' });
        continue;
      }

      const pdfText = await extractPdfText(buffer);
      if (!pdfText || pdfText.trim().length < 20) {
        const fallbackFileNumber = findFileNumber('', fileName);
        if (!fallbackFileNumber) {
          summary.skipped++;
          results.push({ fileName, status: 'no_text', message: 'No readable PDF text and no file number in filename' });
          continue;
        }

        const existing = await findApplicant(companyId, fallbackFileNumber, '');
        const row = await upsertApplicant(companyId, {
          fileNumber: fallbackFileNumber,
          applicantName: existing?.applicantName || 'REVIEW NAME NEEDED',
          orderDate: new Date().toISOString().slice(0, 10),
          medExpire: ''
        });
        summary[existing ? 'updated' : 'created']++;
        results.push({ fileName, status: existing ? 'updated' : 'created', fileNumber: row.fileNumber, applicantName: row.applicantName, medExpire: '', message: 'No readable PDF text; created/updated by filename only' });
        continue;
      }

      const fileNumber = findFileNumber(pdfText, fileName);
      if (!fileNumber) {
        summary.skipped++;
        results.push({ fileName, status: 'skipped', message: 'No file number found in filename or PDF text' });
        continue;
      }

      const applicantName = findApplicantName(pdfText);
      const medExpire = findMedicalExpiration(pdfText);
      const orderDate = findOrderDate(pdfText, new Date().toISOString().slice(0, 10));
      const existing = await findApplicant(companyId, fileNumber, applicantName);

      const row = await upsertApplicant(companyId, {
        fileNumber,
        applicantName,
        orderDate,
        medExpire
      });

      summary[existing ? 'updated' : 'created']++;
      results.push({
        fileName,
        status: existing ? 'updated' : 'created',
        fileNumber: row.fileNumber,
        applicantName: row.applicantName,
        orderDate,
        medExpire,
        message: medExpire ? 'Applicant record saved with medical expiration date' : 'Applicant record saved; Med Expire left blank'
      });
    } catch (error: any) {
      summary.errors++;
      results.push({ fileName, status: 'error', message: error?.message || 'PDF import failed' });
    }
  }

  return json(res, 200, { status: 'ok', summary, results });
}

export default async function handler(req: any, res: any) {
  try {
    const user = await getUser(req);
    if (!requireAdmin(user, res)) return;

    if (req.method !== 'POST') {
      return json(res, 405, { status: 'error', message: 'Method not allowed. Upload PDFs from the Settings panel.' });
    }

    return handleImport(req, res, user);
  } catch (error: any) {
    return json(res, 500, { status: 'error', message: error?.message || 'Medical PDF import failed' });
  }
}
