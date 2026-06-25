import { json, query, readBody } from './lib/db.js';
import { requireUser } from './lib/auth.js';

function normalize(row) {
  return {
    id: row.id,
    companyId: row.companyId,
    fileNumber: row.fileNumber,
    name: row.applicantName,
    orderDate: row.orderDate,
    monitorStatus: row.monitorStatus,
    mvrStatus: row.mvrStatus,
    medExpire: row.medExpire || '',
    notes: row.notes || '',
  };
}

export default async function handler(req, res) {
  const user = await requireUser(req, res, json);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      const companyId = Number(req.query.companyId || user.companyId || 1);
      const result = await query(
        `select id, "companyId", "fileNumber", "applicantName", "orderDate", "monitorStatus", "mvrStatus", "medExpire", notes
         from applicants where "companyId" = $1 order by id`,
        [companyId]
      );
      return json(res, 200, { status: 'ok', applicants: result.rows.map(normalize) });
    }

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const id = Number(body.id);
      if (!id) return json(res, 400, { status: 'error', message: 'Applicant id is required' });
      const existing = await query(`select * from applicants where id = $1 limit 1`, [id]);
      if (!existing.rows[0]) return json(res, 404, { status: 'error', message: 'Applicant not found' });
      const before = existing.rows[0];
      const monitorStatus = body.monitorStatus === 'On' ? 'On' : body.monitorStatus === 'Off' ? 'Off' : before.monitorStatus;
      const medExpire = body.medExpire !== undefined ? String(body.medExpire || '') : before.medExpire;
      const notes = body.notes !== undefined ? String(body.notes || '') : before.notes;

      const updated = await query(
        `update applicants set "monitorStatus" = $1, "medExpire" = $2, "medExpireOverridden" = $3, notes = $4, "updatedAt" = now() where id = $5 returning id, "companyId", "fileNumber", "applicantName", "orderDate", "monitorStatus", "mvrStatus", "medExpire", notes`,
        [monitorStatus, medExpire || null, Boolean(medExpire), notes, id]
      );
      const after = updated.rows[0];
      const changes = [
        ['monitorStatus', before.monitorStatus, after.monitorStatus],
        ['medExpire', before.medExpire || '', after.medExpire || ''],
        ['notes', before.notes || '', after.notes || ''],
      ].filter(([, oldValue, newValue]) => oldValue !== newValue);
      for (const [fieldName, oldValue, newValue] of changes) {
        await query(
          `insert into applicant_audit_log ("companyId", "applicantId", "fieldName", "oldValue", "newValue", "changedBy") values ($1, $2, $3, $4, $5, $6)`,
          [before.companyId, id, fieldName, oldValue, newValue, user.id]
        );
      }
      return json(res, 200, { status: 'ok', applicant: normalize(after) });
    }

    return json(res, 405, { status: 'error', message: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { status: 'error', message: error.message || 'Could not load applicants' });
  }
}
