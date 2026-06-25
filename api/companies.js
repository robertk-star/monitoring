import { json, query, readBody } from './lib/db.js';
import { requireUser } from './lib/auth.js';

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'company';
}

export default async function handler(req, res) {
  const user = await requireUser(req, res, json);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      const result = await query(`select id, name, slug, "isActive" from companies where "isActive" = true order by name`);
      return json(res, 200, { status: 'ok', companies: result.rows });
    }

    if (user.role !== 'admin') return json(res, 403, { status: 'error', message: 'Admin access required' });

    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const slug = slugify(body.slug || name);
      if (!name) return json(res, 400, { status: 'error', message: 'Company name is required' });
      const result = await query(
        `insert into companies (name, slug, "isActive") values ($1, $2, true)
         on conflict (slug) do update set name=excluded.name, "isActive"=true, "updatedAt"=now()
         returning id, name, slug, "isActive"`,
        [name, slug]
      );
      return json(res, 200, { status: 'ok', company: result.rows[0] });
    }

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const id = Number(body.id);
      const name = String(body.name || '').trim();
      const isActive = body.isActive !== false;
      if (!id) return json(res, 400, { status: 'error', message: 'Company id is required' });
      if (!name) return json(res, 400, { status: 'error', message: 'Company name is required' });
      const result = await query(
        `update companies set name=$1, "isActive"=$2, "updatedAt"=now() where id=$3 returning id, name, slug, "isActive"`,
        [name, isActive, id]
      );
      if (!result.rows[0]) return json(res, 404, { status: 'error', message: 'Company not found' });
      return json(res, 200, { status: 'ok', company: result.rows[0] });
    }

    return json(res, 405, { status: 'error', message: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { status: 'error', message: error.message || 'Could not load companies' });
  }
}
