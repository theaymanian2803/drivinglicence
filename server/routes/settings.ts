import { Hono } from 'hono';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { requireAdmin } from '../middleware';

export const settingsRoutes = new Hono<AppEnv>();

async function readSitePublic(): Promise<boolean> {
  const res = await db.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: ['site_public'],
  });
  const value = res.rows[0] ? String((res.rows[0] as Record<string, unknown>).value) : '0';
  return value === '1';
}

settingsRoutes.get('/public', async (c) => {
  return c.json({ data: { site_public: await readSitePublic() } });
});

settingsRoutes.put('/', requireAdmin, async (c) => {
  const body = await c.req
    .json<{ site_public?: unknown }>()
    .catch(() => ({} as { site_public?: unknown }));
  const site_public = body.site_public ? '1' : '0';
  await db.execute({
    sql: `INSERT INTO settings (key, value) VALUES ('site_public', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [site_public],
  });
  return c.json({ data: { site_public: site_public === '1' } });
});
