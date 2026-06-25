import { json, query } from './lib/db.js';
import { requireUser } from './lib/auth.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res, json);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      const result = await query(`select id, name, slug, "isActive" from companies where "isActive" = true order by name`);
      return json(res, 200, { status: 'ok', companies: result.rows });
    }
    return json(res, 405, { status: 'error', message: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { status: 'error', message: error.message || 'Could not load companies' });
  }
}
