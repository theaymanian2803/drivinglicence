import { Hono } from 'hono';
import { randomUUID, randomBytes } from 'node:crypto';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { requireAdmin } from '../middleware';
import { toStudent, toAttempt } from '../serialize';

export const studentsRoutes = new Hono<AppEnv>();

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomGroup(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

async function generateAccessCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = `${randomGroup(4)}-${randomGroup(4)}`;
    const existing = await db.execute({
      sql: 'SELECT 1 FROM students WHERE access_code = ? LIMIT 1',
      args: [code],
    });
    if (existing.rows.length === 0) return code;
  }
  throw new Error('Could not generate a unique access code');
}

type CreateStudentBody = { name?: string; email?: string };

studentsRoutes.get('/', requireAdmin, async (c) => {
  const result = await db.execute(
    `SELECT s.*, (SELECT COUNT(*) FROM exam_attempts a WHERE a.student_id = s.id) AS attempt_count
     FROM students s
     ORDER BY s.created_at DESC`
  );
  return c.json({ data: result.rows.map((r) => toStudent(r as Record<string, unknown>)) });
});

studentsRoutes.post('/', requireAdmin, async (c) => {
  const body = await c.req.json<CreateStudentBody>().catch(() => ({} as CreateStudentBody));
  const email = body.email?.trim().toLowerCase();
  if (!email) return c.json({ error: 'Email is required' }, 400);

  const name = body.name?.trim() || null;
  const accessCode = await generateAccessCode();
  const id = randomUUID();
  const now = new Date().toISOString();

  try {
    await db.execute({
      sql: 'INSERT INTO students (id, name, email, access_code, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      args: [id, name, email, accessCode, now],
    });
  } catch {
    return c.json({ error: 'A student with this email already exists' }, 409);
  }

  const created = await db.execute({ sql: 'SELECT * FROM students WHERE id = ?', args: [id] });
  return c.json({ data: toStudent(created.rows[0] as Record<string, unknown>) }, 201);
});

studentsRoutes.post('/:id/reset-code', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid student id' }, 400);
  const accessCode = await generateAccessCode();
  const result = await db.execute({
    sql: 'UPDATE students SET access_code = ? WHERE id = ?',
    args: [accessCode, id],
  });
  if (result.rowsAffected === 0) return c.json({ error: 'Student not found' }, 404);
  const updated = await db.execute({ sql: 'SELECT * FROM students WHERE id = ?', args: [id] });
  return c.json({ data: toStudent(updated.rows[0] as Record<string, unknown>) });
});

studentsRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid student id' }, 400);
  const result = await db.execute({ sql: 'DELETE FROM students WHERE id = ?', args: [id] });
  if (result.rowsAffected === 0) return c.json({ error: 'Student not found' }, 404);
  return c.json({ data: { ok: true } });
});

studentsRoutes.get('/:id/attempts', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid student id' }, 400);
  const result = await db.execute({
    sql: `SELECT a.*, s.title AS series_title
     FROM exam_attempts a
     LEFT JOIN series s ON s.id = a.series_id
     WHERE a.student_id = ?
     ORDER BY a.created_at DESC`,
    args: [id],
  });
  return c.json({ data: result.rows.map((r) => toAttempt(r as Record<string, unknown>)) });
});