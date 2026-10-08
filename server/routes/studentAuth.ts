import { Hono } from 'hono';
import { db } from '../db';
import { signToken, getAuthUser, setAuthCookie, type AppEnv } from '../auth';

export const studentAuthRoutes = new Hono<AppEnv>();

type LoginBody = { email?: string; accessCode?: string };

studentAuthRoutes.post('/login', async (c) => {
  const body = await c.req.json<LoginBody>().catch(() => ({} as LoginBody));
  const email = body.email?.trim().toLowerCase();
  const code = body.accessCode?.trim().toUpperCase();
  if (!email || !code) return c.json({ error: 'Email and access code are required' }, 400);

  const result = await db.execute({
    sql: 'SELECT id, name, email, access_code, is_active FROM students WHERE email = ? LIMIT 1',
    args: [email],
  });
  if (result.rows.length === 0) return c.json({ error: 'Invalid email or access code' }, 401);

  const row = result.rows[0] as unknown as {
    id: string;
    name: string | null;
    email: string;
    access_code: string;
    is_active: number;
  };
  if (!row.is_active) return c.json({ error: 'Invalid email or access code' }, 401);
  if (row.access_code.toUpperCase() !== code) {
    return c.json({ error: 'Invalid email or access code' }, 401);
  }

  const user = { id: row.id, email: row.email, role: 'student' as const };
  setAuthCookie(c, await signToken(user));
  return c.json({ data: { user, name: row.name } });
});

studentAuthRoutes.get('/me', async (c) => {
  const user = await getAuthUser(c);
  if (!user || user.role !== 'student') return c.json({ error: 'Unauthorized' }, 401);
  const result = await db.execute({
    sql: 'SELECT id, name, email, is_active FROM students WHERE id = ? LIMIT 1',
    args: [user.id],
  });
  if (result.rows.length === 0) return c.json({ error: 'Unauthorized' }, 401);
  const row = result.rows[0] as unknown as {
    id: string;
    name: string | null;
    email: string;
    is_active: number;
  };
  return c.json({ data: { user, name: row.name } });
});