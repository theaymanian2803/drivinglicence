import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { requireAdmin, requireUser, optionalUser } from '../middleware';
import { toSeries, toQuestion } from '../serialize';
import type { SeriesInput } from '../../src/types';

export const seriesRoutes = new Hono<AppEnv>();

seriesRoutes.get('/', optionalUser, async (c) => {
  const user = c.get('user') as import('../auth').AuthUser | undefined;
  const includeAll = c.req.query('all') === 'true' && user?.role === 'admin';
  if (!user) {
    const settings = await db.execute({
      sql: 'SELECT value FROM settings WHERE key = ?',
      args: ['site_public'],
    });
    const isPublic = settings.rows[0]
      ? String((settings.rows[0] as Record<string, unknown>).value) === '1'
      : false;
    if (!isPublic) return c.json({ error: 'Unauthorized' }, 401);
    const active = await db.execute(
      `SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.series_id = s.id) AS question_count
       FROM series s
       WHERE s.is_active = 1 AND s.is_official = 0
       ORDER BY s.created_at ASC`
    );
    return c.json({ data: active.rows.map((r) => toSeries(r as Record<string, unknown>)) });
  }
  const where = includeAll ? 'WHERE s.is_official = 0' : 'WHERE s.is_active = 1 AND s.is_official = 0';
  const result = await db.execute(
    `SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.series_id = s.id) AS question_count
     FROM series s
     ${where}
     ORDER BY s.created_at ASC`
  );
  return c.json({ data: result.rows.map((r) => toSeries(r as Record<string, unknown>)) });
});

seriesRoutes.get('/:id', requireUser, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid series id' }, 400);
  const result = await db.execute({ sql: 'SELECT * FROM series WHERE id = ?', args: [id] });
  if (result.rows.length === 0) return c.json({ error: 'Series not found' }, 404);
  return c.json({ data: toSeries(result.rows[0] as Record<string, unknown>) });
});

seriesRoutes.get('/:id/questions', requireUser, async (c) => {
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
    sql: 'INSERT INTO series (id, title, description, is_active, category, pass_score, required_questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    args: [
      id,
      body.title.trim(),
      body.description || null,
      body.is_active ? 1 : 0,
      body.category || 'B',
      body.pass_score ?? 35,
      body.required_questions ?? 40,
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
    sql: 'UPDATE series SET title = ?, description = ?, is_active = ?, category = ?, pass_score = ?, required_questions = ?, updated_at = ? WHERE id = ?',
    args: [
      body.title.trim(),
      body.description || null,
      body.is_active ? 1 : 0,
      body.category || 'B',
      body.pass_score ?? 35,
      body.required_questions ?? 40,
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