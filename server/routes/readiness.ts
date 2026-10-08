import { Hono } from 'hono';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { requireStudent } from '../middleware';

export const readinessRoutes = new Hono<AppEnv>();

readinessRoutes.get('/', requireStudent, async (c) => {
  const user = c.get('user');

  const attemptsRes = await db.execute({
    sql: `SELECT passed, created_at FROM exam_attempts
          WHERE student_id = ? ORDER BY created_at DESC LIMIT 10`,
    args: [user.id],
  });
  const attempts = attemptsRes.rows as unknown as { passed: unknown; created_at: unknown }[];
  const passedFlags = attempts.map((r) => (Number(r.passed) === 1 ? 1 : 0));

  let attempts_pass_rate = 0;
  if (passedFlags.length > 0) {
    const n = passedFlags.length;
    const totalWeight = (n * (n + 1)) / 2;
    let weighted = 0;
    passedFlags.forEach((p, i) => {
      weighted += p * (n - i);
    });
    attempts_pass_rate = weighted / totalWeight;
  }

  const revisionRes = await db.execute({
    sql: `SELECT status, COUNT(*) AS c FROM student_revision
          WHERE student_id = ? GROUP BY status`,
    args: [user.id],
  });
  const statusCounts = new Map<string, number>();
  for (const r of revisionRes.rows as unknown as { status: unknown; c: unknown }[]) {
    statusCounts.set(String(r.status), Number(r.c));
  }
  const toReview = statusCounts.get('to_review') ?? 0;
  const corrected = statusCounts.get('corrected') ?? 0;

  let revision_clearance = 0;
  const revTotal = toReview + corrected;
  if (revTotal > 0) {
    revision_clearance = corrected / revTotal;
  }

  const raw = 0.7 * attempts_pass_rate + 0.3 * revision_clearance;
  const readiness_pct = Math.max(0, Math.min(100, Math.round(raw * 100)));

  let trend: 'up' | 'down' | 'flat' = 'flat';
  if (passedFlags.length >= 4) {
    const recent = passedFlags.slice(0, 3);
    const older = passedFlags.slice(3, 6);
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const d = avg(recent) - avg(older);
    trend = d > 0.001 ? 'up' : d < -0.001 ? 'down' : 'flat';
  }

  return c.json({
    data: {
      readiness_pct,
      attempts_pass_rate,
      revision_clearance,
      trend,
      attempts_count: passedFlags.length,
      to_review: toReview,
      corrected,
    },
  });
});
