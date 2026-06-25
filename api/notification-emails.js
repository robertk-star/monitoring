import { json, query, readBody } from './lib/db.js';
import { requireUser } from './lib/auth.js';

function requireAdmin(user, res) {
  if (user.role !== 'admin') {
    json(res, 403, { status: 'error', message: 'Admin access required' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  const user = await requireUser(req, res, json);
  if (!user) return;
  if (!requireAdmin(user, res)) return;

  try {
    if (req.method === 'GET') {
      const result = await query('select id, label, email, "isActive" from notification_emails order by id asc');
      return json(res, 200, { status: 'ok', emails: result.rows });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const label = String(body.label || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      if (!email.includes('@')) return json(res, 400, { status: 'error', message: 'Valid email is required' });
      const result = await query(
        'insert into notification_emails (label, email, "isActive") values ($1, $2, true) returning id, label, email, "isActive"',
        [label, email]
      );
      return json(res, 200, { status: 'ok', email: result.rows[0] });
    }

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const id = Number(body.id);
      const label = String(body.label || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const isActive = body.isActive !== false;
      if (!id) return json(res, 400, { status: 'error', message: 'Email id is required' });
      if (!email.includes('@')) return json(res, 400, { status: 'error', message: 'Valid email is required' });
      const result = await query(
        'update notification_emails set label=$1, email=$2, "isActive"=$3, "updatedAt"=now() where id=$4 returning id, label, email, "isActive"',
        [label, email, isActive, id]
      );
      if (!result.rows[0]) return json(res, 404, { status: 'error', message: 'Email not found' });
      return json(res, 200, { status: 'ok', email: result.rows[0] });
    }

    if (req.method === 'DELETE') {
      const id = Number(req.query.id);
      if (!id) return json(res, 400, { status: 'error', message: 'Email id is required' });
      await query('delete from notification_emails where id=$1', [id]);
      return json(res, 200, { status: 'ok', success: true });
    }

    return json(res, 405, { status: 'error', message: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { status: 'error', message: error.message || 'Could not save notification email' });
  }
}
