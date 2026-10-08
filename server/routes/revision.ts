import { Hono } from 'hono';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { requireStudent } from '../middleware';
import { toQuestion } from '../serialize';

export const revisionRoutes = new Hono<AppEnv>();

const SUMMARY_SELECT = `
  SELECT q.*, r.wrong_count, r.corrected_at AS revision_corrected_at, s.title AS series_title
  FROM student_revision r
  JOIN questions q ON q.id = r.question_id
  LEFT JOIN series s ON s.id = q.series_id
  WHERE r.student_id = ?
`;

const WEAK_AREAS_SQL = `
  SELECT q.category AS category,
         COUNT(*) AS question_count,
         SUM(r.wrong_count) AS wrong_total
  FROM student_revision r
  JOIN questions q ON q.id = r.question_id
  WHERE r.student_id = ?
  GROUP BY q.category
  ORDER BY wrong_total DESC, question_count DESC
`;

async function weakAreas(studentId: string) {
  const res = await db.execute({ sql: WEAK_AREAS_SQL, args: [studentId] });
  return res.rows.map((row: unknown) => {
    const r = row as Record<string, unknown>;
    return {
      category: r.category as string,
      question_count: Number(r.question_count),
      wrong_total: Number(r.wrong_total),
    };
  });
}

async function revisionSummary(studentId: string) {
  const toReview = await db.execute({
    sql: `${SUMMARY_SELECT} AND r.status = 'to_review' ORDER BY r.created_at ASC`,
    args: [studentId],
  });
  const corrected = await db.execute({
    sql: `${SUMMARY_SELECT} AND r.status = 'corrected' ORDER BY r.corrected_at DESC`,
    args: [studentId],
  });
  const mapRow = (row: unknown) => {
    const r = row as Record<string, unknown>;
    return {
      ...toQuestion(r),
      wrong_count: Number(r.wrong_count),
      series_title: (r.series_title as string | null) ?? null,
      corrected_at: (r.revision_corrected_at as string | null) ?? null,
    };
  };
  return {
    to_review: toReview.rows.map(mapRow),
    corrected: corrected.rows.map(mapRow),
    weak_areas: await weakAreas(studentId),
  };
}

revisionRoutes.get('/', requireStudent, async (c) => {
  const user = c.get('user');
  return c.json({ data: await revisionSummary(user.id) });
});

type RevisionResult = { question_id: string; correct: boolean };

revisionRoutes.post('/complete', requireStudent, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ results?: unknown }>().catch(() => ({} as { results?: unknown }));
  if (!Array.isArray(body.results)) {
    return c.json({ error: 'results is required' }, 400);
  }
  const results = body.results.filter(
    (r): r is RevisionResult =>
      !!r && typeof r === 'object' && typeof (r as RevisionResult).question_id === 'string' &&
      typeof (r as RevisionResult).correct === 'boolean'
  );
  const now = new Date().toISOString();

  const statements = results.map((r) => {
    if (r.correct) {
      return {
        sql: `INSERT INTO student_revision (student_id, question_id, wrong_count, status, created_at, corrected_at)
         VALUES (?, ?, 1, 'corrected', ?, ?)
         ON CONFLICT (student_id, question_id) DO UPDATE SET
           status = 'corrected',
           corrected_at = excluded.corrected_at`,
        args: [user.id, r.question_id, now, now],
      };
    }
    return {
      sql: `INSERT INTO student_revision (student_id, question_id, wrong_count, status, created_at, corrected_at)
       VALUES (?, ?, 1, 'to_review', ?, NULL)
       ON CONFLICT (student_id, question_id) DO UPDATE SET
         wrong_count = student_revision.wrong_count + 1,
         status = 'to_review',
         corrected_at = NULL`,
      args: [user.id, r.question_id, now],
    };
  });
  if (statements.length > 0) {
    await db.batch(statements);
  }

  return c.json({ data: { ok: true, summary: await revisionSummary(user.id) } });
});