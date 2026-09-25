import { getUserFromRequest } from './lib/auth.js';
import { json, query } from './lib/db.js';

function requestHost(req: any) {
  const headers = req?.headers || {};
  return String(headers['x-forwarded-host'] || headers.host || headers.Host || '').toLowerCase();
}

function isDriverPipelineHost(host: string) {
  const hostname = String(host || '').split(',')[0].trim().split(':')[0];
  return hostname === 'driverpipeline.com' || hostname.endsWith('.driverpipeline.com');
}

async function isDriverPipelineLogin(req: any, user: any) {
  if (isDriverPipelineHost(requestHost(req))) return true;
  const username = String(user?.username || '').toLowerCase();
  if (username.endsWith('@driverpipeline.com') || username.includes('driverpipeline')) return true;
  const companyId = Number(user?.companyId || 0);
  if (!companyId) return false;
  try {
    const result = await query('select name from companies where id=$1 limit 1', [companyId]);
    const name = String(result.rows?.[0]?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    return name.includes('driverpipeline');
  } catch {
    return false;
  }
}

function syncBaseUrl() {
  const explicit = String(process.env.AUTO_SYNC_URL || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const vercel = String(process.env.VERCEL_URL || '').trim().replace(/\/+$/, '');
  if (vercel) return vercel.startsWith('http') ? vercel : `https://${vercel}`;
  return '';
}

export default async function handler(req: any, res: any) {
  if (!['GET', 'POST'].includes(String(req.method || 'GET').toUpperCase())) {
    return json(res, 405, { status: 'error', message: 'Method not allowed' });
  }

  const user = await getUserFromRequest(req);
  if (!user) return json(res, 401, { status: 'error', message: 'Login required' });

  if (!(await isDriverPipelineLogin(req, user))) {
    return json(res, 200, { status: 'skipped', message: 'Login sync only runs for Driver Pipeline users.' });
  }

  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const baseUrl = syncBaseUrl();
  if (!cronSecret || !baseUrl) {
    return json(res, 500, { status: 'error', message: 'AUTO_SYNC_URL or CRON_SECRET is missing.' });
  }

  try {
    const response = await fetch(`${baseUrl}/api/index?path=auto-sync&force=1`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const raw = await response.text();
    let payload: any = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
    return json(res, response.ok ? 200 : response.status, {
      status: response.ok ? 'ok' : 'error',
      source: 'driverpipeline-login-sync',
      sync: payload,
    });
  } catch (error: any) {
    return json(res, 500, {
      status: 'error',
      source: 'driverpipeline-login-sync',
      message: error?.message || 'Login sync failed',
    });
  }
}
