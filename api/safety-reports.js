import { json, query } from './lib/db.js';
import { requireUser } from './lib/auth.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res, json);
  if (!user) return;
  if (req.method !== 'GET') return json(res, 405, { status: 'error', message: 'Method not allowed' });
  try {
    const companyId = Number(req.query.companyId || user.companyId || 1);
    const result = await query(`select * from safety_reports where "companyId" = $1 order by id desc limit 200`, [companyId]);
    return json(res, 200, { status: 'ok', reports: result.rows });
  } catch (error) {
    return json(res, 500, { status: 'error', message: error.message || 'Could not load safety reports' });
  }
}
