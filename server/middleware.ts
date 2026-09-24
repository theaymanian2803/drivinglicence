import type { Context, Next } from 'hono';
import { getAuthUser } from './auth';

export async function requireAdmin(c: Context, next: Next) {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('user', user);
  await next();
}