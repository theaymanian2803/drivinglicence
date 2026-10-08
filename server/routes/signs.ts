import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { optionalUser, requireAdmin } from '../middleware';
import { toSign } from '../serialize';
import { SIGN_CATEGORIES } from '../../src/types';
import type { SignInput, SignCategory } from '../../src/types';

type SignBody = Partial<SignInput>;

export const signRoutes = new Hono<AppEnv>();

const INSERT_COLUMNS =
  'id, title, category, image_url, description, scenario_image_url, is_active, position, created_at, updated_at';

signRoutes.get('/', optionalUser, async (c) => {
  const user = c.get('user') as { role?: string } | undefined;
  const includeAll = c.req.query('all') === 'true' && user?.role === 'admin';
  const result = await db.execute(
    `SELECT * FROM signs ${includeAll ? '' : 'WHERE is_active = 1'}
     ORDER BY category ASC, position ASC, created_at ASC`
  );
  return c.json({ data: result.rows.map((r) => toSign(r as Record<string, unknown>)) });
});

signRoutes.get('/:id', optionalUser, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid sign id' }, 400);
  const result = await db.execute({ sql: 'SELECT * FROM signs WHERE id = ?', args: [id] });
  if (result.rows.length === 0) return c.json({ error: 'Sign not found' }, 404);
  return c.json({ data: toSign(result.rows[0] as Record<string, unknown>) });
});

signRoutes.patch('/reorder', requireAdmin, async (c) => {
  const body = await c.req.json<{ ids?: unknown }>().catch(() => ({} as { ids?: unknown }));
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string')) {
    return c.json({ error: 'Invalid ids payload' }, 400);
  }
  const statements = body.ids.map((id, index) => ({
    sql: 'UPDATE signs SET position = ? WHERE id = ?',
    args: [index, id as string],
  }));
  await db.batch(statements);
  return c.json({ data: { ok: true } });
});

signRoutes.post('/', requireAdmin, async (c) => {
  const body = await c.req.json<SignBody>().catch(() => ({} as SignBody));
  if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400);
  if (!body.image_url?.trim()) return c.json({ error: 'Sign image is required' }, 400);
  if (!body.description?.trim()) return c.json({ error: 'Description is required' }, 400);

  const pos = await db.execute({
    sql: 'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM signs',
  });
  const nextPosition = Number((pos.rows[0] as Record<string, unknown>).next_position);
  const category = SIGN_CATEGORIES.includes(body.category as SignCategory)
    ? (body.category as string)
    : SIGN_CATEGORIES[0];
  const now = new Date().toISOString();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO signs (${INSERT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      body.title.trim(),
      category,
      body.image_url.trim(),
      body.description.trim(),
      body.scenario_image_url || null,
      body.is_active ? 1 : 0,
      nextPosition,
      now,
      now,
    ],
  });
  const created = await db.execute({ sql: 'SELECT * FROM signs WHERE id = ?', args: [id] });
  return c.json({ data: toSign(created.rows[0] as Record<string, unknown>) }, 201);
});

signRoutes.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid sign id' }, 400);
  const body = await c.req.json<SignBody>().catch(() => ({} as SignBody));
  if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400);
  if (!body.image_url?.trim()) return c.json({ error: 'Sign image is required' }, 400);
  if (!body.description?.trim()) return c.json({ error: 'Description is required' }, 400);

  const category = SIGN_CATEGORIES.includes(body.category as SignCategory)
    ? (body.category as string)
    : SIGN_CATEGORIES[0];
  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE signs SET title = ?, category = ?, image_url = ?, description = ?, scenario_image_url = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    args: [
      body.title.trim(),
      category,
      body.image_url.trim(),
      body.description.trim(),
      body.scenario_image_url || null,
      body.is_active ? 1 : 0,
      now,
      id,
    ],
  });
  const updated = await db.execute({ sql: 'SELECT * FROM signs WHERE id = ?', args: [id] });
  if (updated.rows.length === 0) return c.json({ error: 'Sign not found' }, 404);
  return c.json({ data: toSign(updated.rows[0] as Record<string, unknown>) });
});

signRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid sign id' }, 400);
  const result = await db.execute({ sql: 'DELETE FROM signs WHERE id = ?', args: [id] });
  if (result.rowsAffected === 0) return c.json({ error: 'Sign not found' }, 404);
  return c.json({ data: { ok: true } });
});
