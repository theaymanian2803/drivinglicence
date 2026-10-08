import type { Context, Next } from 'hono';
import { getAuthUser } from './auth';
import { db } from './db';

export async function requireUser(c: Context, next: Next) {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('user', user);
  await next();
}

export async function requireAdmin(c: Context, next: Next) {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  c.set('user', user);
  await next();
}

export async function requireStudent(c: Context, next: Next) {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (user.role !== 'student') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const row = await db.execute({
    sql: 'SELECT id FROM students WHERE id = ? AND is_active = 1 LIMIT 1',
    args: [user.id],
  });
  if (row.rows.length === 0) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('user', user);
  await next();
}