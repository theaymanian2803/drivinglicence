import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { requireAdmin } from '../middleware';
import { toQuestion } from '../serialize';
import type { QuestionInput } from '../../src/types';

type QuestionBody = Partial<QuestionInput>;

export const questionRoutes = new Hono<AppEnv>();

const INSERT_COLUMNS =
  'id, series_id, image_url, audio_url, question_text, question_text_2, option_1, option_2, option_3, option_4, correct_answers, timer_duration, category, position, created_at, updated_at';

questionRoutes.patch('/reorder', requireAdmin, async (c) => {
  const body = await c.req.json<{ ids?: unknown }>().catch(() => ({} as { ids?: unknown }));
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string')) {
    return c.json({ error: 'Invalid ids payload' }, 400);
  }
  const statements = body.ids.map((id, index) => ({
    sql: 'UPDATE questions SET position = ? WHERE id = ?',
    args: [index, id as string],
  }));
  await db.batch(statements);
  return c.json({ data: { ok: true } });
});

questionRoutes.post('/', requireAdmin, async (c) => {
  const body = await c.req.json<QuestionBody>().catch(() => ({} as QuestionBody));
  if (!body.series_id || !body.question_text?.trim()) {
    return c.json({ error: 'series_id and question_text are required' }, 400);
  }
  const pos = await db.execute({
    sql: 'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM questions WHERE series_id = ?',
    args: [body.series_id],
  });
  const nextPosition = Number((pos.rows[0] as Record<string, unknown>).next_position);
  const now = new Date().toISOString();
  const id = randomUUID();
  const args: (string | number | null)[] = [
    id,
    body.series_id,
    body.image_url || null,
    body.audio_url || null,
    body.question_text.trim(),
    body.question_text_2 || null,
    body.option_1 || '',
    body.option_2 || '',
    body.option_3 || null,
    body.option_4 || null,
    JSON.stringify(body.correct_answers ?? []),
    body.timer_duration ?? 20,
    body.category || 'B',
    nextPosition,
    now,
    now,
  ];
  await db.execute({
    sql: `INSERT INTO questions (${INSERT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args,
  });
  const created = await db.execute({ sql: 'SELECT * FROM questions WHERE id = ?', args: [id] });
  return c.json({ data: toQuestion(created.rows[0] as Record<string, unknown>) }, 201);
});

questionRoutes.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid question id' }, 400);
  const body = await c.req.json<QuestionBody>().catch(() => ({} as QuestionBody));
  if (!body.question_text?.trim() || !body.series_id) {
    return c.json({ error: 'question_text and series_id are required' }, 400);
  }
  const now = new Date().toISOString();
  const args: (string | number | null)[] = [
    body.image_url || null,
    body.audio_url || null,
    body.question_text.trim(),
    body.question_text_2 || null,
    body.option_1 || '',
    body.option_2 || '',
    body.option_3 || null,
    body.option_4 || null,
    JSON.stringify(body.correct_answers ?? []),
    body.timer_duration ?? 20,
    body.category || 'B',
    body.series_id,
    now,
    id,
  ];
  await db.execute({
    sql: `UPDATE questions SET image_url = ?, audio_url = ?, question_text = ?, question_text_2 = ?, option_1 = ?, option_2 = ?, option_3 = ?, option_4 = ?, correct_answers = ?, timer_duration = ?, category = ?, series_id = ?, updated_at = ? WHERE id = ?`,
    args,
  });
  const updated = await db.execute({ sql: 'SELECT * FROM questions WHERE id = ?', args: [id] });
  if (updated.rows.length === 0) return c.json({ error: 'Question not found' }, 404);
  return c.json({ data: toQuestion(updated.rows[0] as Record<string, unknown>) });
});

questionRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid question id' }, 400);
  const result = await db.execute({ sql: 'DELETE FROM questions WHERE id = ?', args: [id] });
  if (result.rowsAffected === 0) return c.json({ error: 'Question not found' }, 404);
  return c.json({ data: { ok: true } });
});