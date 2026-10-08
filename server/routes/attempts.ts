import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { requireStudent } from '../middleware';
import { toAttempt } from '../serialize';

export const attemptsRoutes = new Hono<AppEnv>();

type SubmitBody = {
  series_id?: string;
  score?: number;
  total_questions?: number;
  wrong_question_ids?: unknown;
};

attemptsRoutes.get('/', requireStudent, async (c) => {
  const user = c.get('user');
  const result = await db.execute({
    sql: `SELECT a.*, s.title AS series_title
     FROM exam_attempts a
     LEFT JOIN series s ON s.id = a.series_id
     WHERE a.student_id = ?
     ORDER BY a.created_at DESC`,
    args: [user.id],
  });
  return c.json({ data: result.rows.map((r) => toAttempt(r as Record<string, unknown>)) });
});

attemptsRoutes.post('/', requireStudent, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<SubmitBody>().catch(() => ({} as SubmitBody));
  const { series_id, score, total_questions } = body;
  if (!series_id || typeof score !== 'number' || typeof total_questions !== 'number') {
    return c.json({ error: 'series_id, score and total_questions are required' }, 400);
  }
  if (score < 0 || total_questions <= 0 || score > total_questions) {
    return c.json({ error: 'Invalid score values' }, 400);
  }
  const seriesRes = await db.execute({
    sql: `SELECT s.pass_score, s.required_questions,
      (SELECT COUNT(*) FROM questions q WHERE q.series_id = s.id) AS question_count
     FROM series s WHERE s.id = ? LIMIT 1`,
    args: [series_id],
  });
  if (seriesRes.rows.length === 0) return c.json({ error: 'Series not found' }, 404);
  const srow = seriesRes.rows[0] as unknown as {
    pass_score: number;
    required_questions: number;
    question_count: number;
  };
  const passScore = Number(srow.pass_score);
  const requiredQuestions = Number(srow.required_questions);
  const questionCount = Number(srow.question_count);
  if (requiredQuestions > 0 && questionCount !== requiredQuestions) {
    return c.json(
      { error: `Series is incomplete (${questionCount}/${requiredQuestions} questions)` },
      400
    );
  }

  const passed = score >= passScore ? 1 : 0;
  const id = randomUUID();
  const now = new Date().toISOString();

  const requested = Array.isArray(body.wrong_question_ids)
    ? body.wrong_question_ids.filter((q): q is string => typeof q === 'string')
    : [];
  let wrongIds: string[] = [];
  if (requested.length > 0) {
    const placeholders = requested.map(() => '?').join(',');
    const qres = await db.execute({
      sql: `SELECT id FROM questions WHERE series_id = ? AND id IN (${placeholders})`,
      args: [series_id, ...requested],
    });
    wrongIds = qres.rows.map((r) => r.id as string);
  }

  const statements: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: 'INSERT INTO exam_attempts (id, student_id, series_id, score, total_questions, passed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, user.id, series_id, score, total_questions, passed, now],
    },
  ];
  wrongIds.forEach((questionId) => {
    statements.push({
      sql: `INSERT INTO student_revision (student_id, question_id, wrong_count, status, created_at, corrected_at)
       VALUES (?, ?, 1, 'to_review', ?, NULL)
       ON CONFLICT (student_id, question_id) DO UPDATE SET
         wrong_count = student_revision.wrong_count + 1,
         status = 'to_review',
         corrected_at = NULL`,
      args: [user.id, questionId, now],
    });
  });
  await db.batch(statements);

  const created = await db.execute({
    sql: `SELECT a.*, s.title AS series_title
     FROM exam_attempts a
     LEFT JOIN series s ON s.id = a.series_id
     WHERE a.id = ?`,
    args: [id],
  });
  return c.json({ data: toAttempt(created.rows[0] as Record<string, unknown>) }, 201);
});