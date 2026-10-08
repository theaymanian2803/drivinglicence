import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { requireStudent } from '../middleware';
import { toQuestion, toAttempt } from '../serialize';

export const examRoutes = new Hono<AppEnv>();

export interface OfficialConfig {
  pass_score: number;
  question_count: number;
  timer_duration: number;
}

async function readSetting(key: string, fallback: string): Promise<string> {
  const res = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] });
  return res.rows[0] ? String((res.rows[0] as Record<string, unknown>).value) : fallback;
}

export async function readOfficialConfig(): Promise<OfficialConfig> {
  return {
    pass_score: Number(await readSetting('official_pass_score', '35')),
    question_count: Number(await readSetting('official_question_count', '40')),
    timer_duration: Number(await readSetting('official_timer_duration', '20')),
  };
}

async function officialSeriesId(): Promise<string | null> {
  const res = await db.execute({ sql: 'SELECT id FROM series WHERE is_official = 1 LIMIT 1' });
  return res.rows[0] ? (res.rows[0] as Record<string, unknown>).id as string : null;
}

examRoutes.get('/official/meta', requireStudent, async (c) => {
  return c.json({ data: await readOfficialConfig() });
});

examRoutes.get('/official', requireStudent, async (c) => {
  const config = await readOfficialConfig();
  const result = await db.execute({
    sql: `SELECT q.* FROM questions q
          JOIN series s ON s.id = q.series_id
          WHERE s.is_active = 1 AND s.is_official = 0
          ORDER BY RANDOM() LIMIT ?`,
    args: [config.question_count],
  });
  const questions = result.rows.map((r) => toQuestion(r as Record<string, unknown>));
  if (questions.length < config.question_count) {
    return c.json(
      {
        error: `Il n'y a pas encore assez de questions actives pour l'examen officiel (${questions.length}/${config.question_count}).`,
      },
      409
    );
  }
  return c.json({ data: { ...config, questions } });
});

type CompleteBody = {
  score?: number;
  total_questions?: number;
  wrong_question_ids?: unknown;
};

examRoutes.post('/official/complete', requireStudent, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<CompleteBody>().catch(() => ({} as CompleteBody));
  const { score, total_questions } = body;
  if (typeof score !== 'number' || typeof total_questions !== 'number') {
    return c.json({ error: 'score and total_questions are required' }, 400);
  }
  const config = await readOfficialConfig();
  if (score < 0 || total_questions !== config.question_count || score > total_questions) {
    return c.json({ error: 'Invalid score values' }, 400);
  }
  const seriesId = await officialSeriesId();
  if (!seriesId) return c.json({ error: 'Official exam is not configured.' }, 500);

  const passed = score >= config.pass_score ? 1 : 0;
  const id = randomUUID();
  const now = new Date().toISOString();

  const requested = Array.isArray(body.wrong_question_ids)
    ? body.wrong_question_ids.filter((q): q is string => typeof q === 'string')
    : [];
  let wrongIds: string[] = [];
  if (requested.length > 0) {
    const placeholders = requested.map(() => '?').join(',');
    const qres = await db.execute({
      sql: `SELECT id FROM questions WHERE id IN (${placeholders})`,
      args: [...requested],
    });
    wrongIds = qres.rows.map((r) => r.id as string);
  }

  const statements: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: 'INSERT INTO exam_attempts (id, student_id, series_id, score, total_questions, passed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, user.id, seriesId, score, total_questions, passed, now],
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
