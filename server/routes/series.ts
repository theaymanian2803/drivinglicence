import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { getAuthUser, type AppEnv } from '../auth';
import { requireAdmin } from '../middleware';
import { toSeries, toQuestion } from '../serialize';
import type { SeriesInput } from '../../src/types';

export const seriesRoutes = new Hono<AppEnv>();

seriesRoutes.get('/', async (c) => {
  const isAdmin = !!(await getAuthUser(c));
  const includeAll = c.req.query('all') === 'true' && isAdmin;
  const result = await db.execute(
    `SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.series_id = s.id) AS question_count
     FROM series s
     ${includeAll ? '' : 'WHERE s.is_active = 1'}
     ORDER BY s.created_at ASC`
  );
  return c.json({ data: result.rows.map((r) => toSeries(r as Record<string, unknown>)) });
});

seriesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid series id' }, 400);
  const result = await db.execute({ sql: 'SELECT * FROM series WHERE id = ?', args: [id] });
  if (result.rows.length === 0) return c.json({ error: 'Series not found' }, 404);
  return c.json({ data: toSeries(result.rows[0] as Record<string, unknown>) });
});

seriesRoutes.get('/:id/questions', async (c) => {
  const seriesId = c.req.param('id');
  if (!seriesId) return c.json({ error: 'Invalid series id' }, 400);
  const result = await db.execute({
    sql: 'SELECT * FROM questions WHERE series_id = ? ORDER BY position ASC, created_at ASC',
    args: [seriesId],
  });
  return c.json({ data: result.rows.map((r) => toQuestion(r as Record<string, unknown>)) });
});

seriesRoutes.post('/', requireAdmin, async (c) => {
  const body = await c.req.json<SeriesInput>().catch(() => ({} as SeriesInput));
  if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400);
  const now = new Date().toISOString();
  const id = randomUUID();
  await db.execute({
    sql: 'INSERT INTO series (id, title, description, is_active, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [
      id,
      body.title.trim(),
      body.description || null,
      body.is_active ? 1 : 0,
      body.category || 'B',
      now,
      now,
    ],
  });
  const created = await db.execute({ sql: 'SELECT * FROM series WHERE id = ?', args: [id] });
  return c.json({ data: toSeries(created.rows[0] as Record<string, unknown>) }, 201);
});

seriesRoutes.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid series id' }, 400);
  const body = await c.req.json<SeriesInput>().catch(() => ({} as SeriesInput));
  if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400);
  const now = new Date().toISOString();
  await db.execute({
    sql: 'UPDATE series SET title = ?, description = ?, is_active = ?, category = ?, updated_at = ? WHERE id = ?',
    args: [
      body.title.trim(),
      body.description || null,
      body.is_active ? 1 : 0,
      body.category || 'B',
      now,
      id,
    ],
  });
  const updated = await db.execute({ sql: 'SELECT * FROM series WHERE id = ?', args: [id] });
  if (updated.rows.length === 0) return c.json({ error: 'Series not found' }, 404);
  return c.json({ data: toSeries(updated.rows[0] as Record<string, unknown>) });
});

seriesRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid series id' }, 400);
  const result = await db.execute({ sql: 'DELETE FROM series WHERE id = ?', args: [id] });
  if (result.rowsAffected === 0) return c.json({ error: 'Series not found' }, 404);
  return c.json({ data: { ok: true } });
});