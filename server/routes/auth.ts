import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { db } from '../db';
import { verifyPassword, signToken, getAuthUser, setAuthCookie, type AppEnv } from '../auth';

export const authRoutes = new Hono<AppEnv>();

type LoginBody = { email?: string; password?: string };

authRoutes.post('/login', async (c) => {
  const body = await c.req.json<LoginBody>().catch(() => ({} as LoginBody));
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);

  const result = await db.execute({
    sql: 'SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1',
    args: [email],
  });
  if (result.rows.length === 0) return c.json({ error: 'Invalid email or password' }, 401);

  const row = result.rows[0] as unknown as { id: string; email: string; password_hash: string };
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return c.json({ error: 'Invalid email or password' }, 401);

  const user = { id: row.id, email: row.email, role: 'admin' as const };
  setAuthCookie(c, await signToken(user));
  return c.json({ data: { user } });
});

authRoutes.post('/logout', (c) => {
  deleteCookie(c, 'token', { path: '/' });
  return c.json({ data: { ok: true } });
});

authRoutes.get('/me', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ data: { user } });
});