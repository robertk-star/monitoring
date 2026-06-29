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
}

function normalizeFileNumber(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function numericFileNumber(value: string) {
  return String(value || '').replace(/[^0-9]/g, '');
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

function dateScore(iso: string) {
  if (!iso) return -999;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return -999;
  const now = new Date();
  const days = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (days < -365) return -20;
  if (days < 0) return 1;
  if (days <= 365 * 3) return 5;
  if (days <= 365 * 5) return 3;
  return -1;
}

function findDateNear(text: string, keywords: RegExp, negative?: RegExp) {
  const clean = String(text || '').replace(/\s+/g, ' ');
  const dateRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+\d{1,2},?\s+\d{4})/gi;
  const candidates: any[] = [];
  let match: RegExpExecArray | null;

  while ((match = dateRegex.exec(clean))) {
    const rawDate = match[1];
    const iso = parseDateCandidate(rawDate);
    if (!iso) continue;

    const start = Math.max(0, match.index - 180);
    const end = Math.min(clean.length, match.index + rawDate.length + 180);
    const context = clean.slice(start, end).toLowerCase();

    let score = dateScore(iso);
    if (keywords.test(context)) score += 8;
    if (/medical/.test(context)) score += 5;
    if (/certificate|certification|examiner|dot|card|physical|mec|med cert/.test(context)) score += 4;
    if (/expir|expires|expiration|valid through|valid until|qualified until|certificate expiration|card expiration/.test(context)) score += 8;
    if (negative && negative.test(context)) score -= 6;
    if (/date of birth|birth|dob|ssn|social|issued|order date|report date|request date|signature|certified by|completed/.test(context)) score -= 5;

    candidates.push({ iso, rawDate, score, context: clean.slice(start, end) });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.score >= 8 ? candidates[0] : null;
}


function findTazWorksMedicalCertificateExpiration(text: string) {
  const raw = String(text || '');
  const normalized = raw.replace(/\r/g, '\n');

  // TazWorks section example:
  // Medical Certificate
  // Description: ...
  // Status: CERTIFIED
  // Issue Date: 2026/03/26
  // Expiration Date: 2028/03/26
  const sectionMatch =
    normalized.match(/medical\s+certificate[\s\S]{0,1800}?(?:self\s+certification|restrictions|examiner|$)/i) ||
    normalized.match(/medical\s+certificate[\s\S]{0,1800}/i);

  const section = sectionMatch ? sectionMatch[0] : normalized;

  const exact =
    section.match(/expiration\s+date\s*[:\-]?\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i) ||
    section.match(/expires?\s*[:\-]?\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);

  if (exact) {
    const iso = parseDateCandidate(exact[1]);
    if (iso) {
      return {
        date: iso,
        rawMatch: exact[1],
        reason: `TazWorks Medical Certificate Expiration Date matched ${exact[1]}`
      };
    }
  }

  return null;
}


function findMedicalExpiration(text: string) {
  const tazWorksExact = findTazWorksMedicalCertificateExpiration(text);
  if (tazWorksExact?.date) return tazWorksExact;

  const best = findDateNear(
    text,
    /medical|med\s*expire|med\s*expiration|medical\s*expiration|medical\s*expires|medical\s*cert|medical\s*card|dot\s*physical|physical\s*expiration|mec|examiner|certificate|certification|expiration|expires|valid through|valid until|qualified until/i,
    /birth|dob|date of birth|ssn|social|issued|order date|report date|request date|signature|certified by/i
  );

  if (!best) return { date: '', rawMatch: '', reason: 'No high-confidence medical expiration date found. Looked for Medical Certificate > Expiration Date. If the PDF is image-only, OCR will be needed.' };
  return { date: best.iso, rawMatch: best.rawDate, reason: `Matched ${best.rawDate}` };
}

function findOrderDate(text: string, fallbackIso: string) {
  const best = findDateNear(
    text,
    /order date|ordered|request date|created|application date|date ordered|report date/i,
    /expiration|expires|valid until|valid through|medical|date of birth|dob/i
  );
  return best?.iso || fallbackIso || new Date().toISOString().slice(0, 10);
}

function findFileNumber(text: string, fileName: string) {
  const name = String(fileName || '');

  // TazWorks example: report_6340.pdf
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
    .replace(/\b(DOB|Date|SSN|Social|Phone|File|Order|Report)\b.*$/i, '')
    .trim()
    .toUpperCase();
}

function findApplicantName(text: string, fileName?: string) {
  const clean = String(text || '').replace(/\s+/g, ' ');
  const patterns = [
    /applicant\s+name\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i,
    /candidate\s+name\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i,
    /driver\s+name\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i,
    /name\s+of\s+driver\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i,
    /employee\s+name\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})/i,
    /name\s*[:\-]?\s*([A-Z][A-Za-z' .,\-]{3,80})\s+(?:DOB|Date of Birth|SSN|Social)/i
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
  const digits = numericFileNumber(fileNumber);

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

async function createApplicant(companyId: number, data: any) {
  const fileNumber = String(data.fileNumber || '').trim();
  const applicantName = String(data.applicantName || '').trim();
  if (!fileNumber) throw new Error('Cannot create Monitoring record without a file number');
  if (!applicantName) throw new Error('Cannot create Monitoring record without an applicant name');

  const r = await query(
    `insert into applicants ("companyId","fileNumber","applicantName","orderDate","monitorStatus","mvrStatus","medExpire","medExpireOverridden",notes)
     values ($1,$2,$3,$4,'On','',$5,true,$6)
     on conflict ("fileNumber","companyId") do update set
       "applicantName"=excluded."applicantName",
       "orderDate"=coalesce(nullif(applicants."orderDate",''), excluded."orderDate"),
       "medExpire"=excluded."medExpire",
       "medExpireOverridden"=true,
       notes=trim(both E'\n' from concat(coalesce(applicants.notes,''), E'\n', excluded.notes)),
       "updatedAt"=now()
     returning id, "fileNumber", "applicantName"`,
    [
      companyId,
      fileNumber,
      applicantName,
      data.orderDate || new Date().toISOString().slice(0, 10),
      data.medExpire || null,
      `Monitoring record created/updated from uploaded PDF ${data.fileName} on ${new Date().toISOString().slice(0, 10)}.`
    ]
  );
  return r.rows[0];
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

    const initialFileNumber = findFileNumber('', fileName);

    const r = await query(
      `insert into medical_pdf_uploads ("companyId","fileName","mimeType","fileSize","pdfData","uploadedBy","scanStatus","extractedFileNumber")
       values ($1,$2,$3,$4,$5,$6,'uploaded',$7)
       returning id, "fileName", "fileSize", "scanStatus", "extractedFileNumber"`,
      [companyId, fileName, mimeType, buffer.length, buffer, user.id, initialFileNumber || null]
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
  const createMissing = Boolean(body.createMissing);
  const filter = scanAll ? '' : `and "scanStatus" in ('uploaded','no_match','no_date','error')`;

  const uploads = await query(
    `select id, "fileName", "pdfData", "uploadedAt" from medical_pdf_uploads where "companyId"=$1 ${filter} order by id asc limit 100`,
    [companyId]
  );

  const summary = { scanned: uploads.rows.length, updated: 0, created: 0, noMatch: 0, noDate: 0, errors: 0 };
  const results: any[] = [];

  for (const upload of uploads.rows) {
    try {
      const buffer = Buffer.from(upload.pdfData);
      const pdfText = await extractPdfText(buffer);
      const extractedFileNumber = findFileNumber(pdfText, upload.fileName);
      const extractedApplicantName = findApplicantName(pdfText, upload.fileName);
      const orderDate = findOrderDate(pdfText, new Date(upload.uploadedAt || Date.now()).toISOString().slice(0, 10));
      const exp = findMedicalExpiration(pdfText);

      if (!pdfText || pdfText.trim().length < 20) {
        summary.noDate++;
        await query(
          `update medical_pdf_uploads
           set "extractedFileNumber"=$1, "extractedApplicantName"=$2, "scanStatus"='no_text',
               "scanMessage"=$3, "scannedAt"=now()
           where id=$4`,
          [extractedFileNumber || null, extractedApplicantName || null, 'No readable PDF text found. This may be scanned/image-only and need OCR.', upload.id]
        );
        results.push({ id: upload.id, fileName: upload.fileName, status: 'no_text', fileNumber: extractedFileNumber, message: 'No readable PDF text' });
        continue;
      }

      if (!exp.date) {
        summary.noDate++;
        await query(
          `update medical_pdf_uploads
           set "extractedFileNumber"=$1, "extractedApplicantName"=$2, "scanStatus"='no_date',
               "scanMessage"=$3, "scannedAt"=now()
           where id=$4`,
          [extractedFileNumber || null, extractedApplicantName || null, exp.reason, upload.id]
        );
        results.push({ id: upload.id, fileName: upload.fileName, status: 'no_date', message: exp.reason, fileNumber: extractedFileNumber, applicantName: extractedApplicantName, orderDate });
        continue;
      }

      let applicant = await findApplicant(companyId, extractedFileNumber, extractedApplicantName);
      let wasCreated = false;

      if (!applicant && createMissing && extractedFileNumber && extractedApplicantName) {
        applicant = await createApplicant(companyId, {
          fileNumber: extractedFileNumber,
          applicantName: extractedApplicantName,
          orderDate,
          medExpire: exp.date,
          fileName: upload.fileName
        });
        wasCreated = true;
      }

      if (!applicant) {
        summary.noMatch++;
        const reason = createMissing
          ? 'Expiration found but no Monitoring match and could not create because applicant name was not found in PDF text'
          : `Expiration found for file #${extractedFileNumber || 'unknown'} but no matching Monitoring record was found`;
        await query(
          `update medical_pdf_uploads
           set "extractedExpirationDate"=$1, "extractedFileNumber"=$2, "extractedApplicantName"=$3,
               "scanStatus"='no_match', "scanMessage"=$4, "scannedAt"=now()
           where id=$5`,
          [exp.date, extractedFileNumber || null, extractedApplicantName || null, reason, upload.id]
        );
        results.push({ id: upload.id, fileName: upload.fileName, status: 'no_match', expirationDate: exp.date, fileNumber: extractedFileNumber, applicantName: extractedApplicantName, orderDate, message: reason });
        continue;
      }

      if (!wasCreated) {
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
        summary.updated++;
      } else {
        summary.created++;
      }

      const scanStatus = wasCreated ? 'created' : 'updated';
      await query(
        `update medical_pdf_uploads
         set "extractedExpirationDate"=$1, "extractedFileNumber"=$2, "extractedApplicantName"=$3,
             "matchedApplicantId"=$4, "scanStatus"=$5, "scanMessage"=$6, "scannedAt"=now()
         where id=$7`,
        [
          exp.date,
          extractedFileNumber || applicant.fileNumber,
          extractedApplicantName || applicant.applicantName,
          applicant.id,
          scanStatus,
          `${wasCreated ? 'Created' : 'Updated'} ${applicant.applicantName} (${applicant.fileNumber}) to ${exp.date}`,
          upload.id
        ]
      );

      results.push({ id: upload.id, fileName: upload.fileName, status: scanStatus, expirationDate: exp.date, fileNumber: applicant.fileNumber, applicantName: applicant.applicantName, orderDate });
    } catch (error: any) {
      summary.errors++;
      await query(
        `update medical_pdf_uploads set "scanStatus"='error', "scanMessage"=$1, "scannedAt"=now() where id=$2`,
        [error?.message || 'PDF scan failed', upload.id]
      );
      results.push({ id: upload.id, fileName: upload.fileName, status: 'error', message: error?.message || 'PDF scan failed' });
    }
  }

  return json(res, 200, { status: 'ok', summary, results, uploads: await listUploads(companyId) });
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
