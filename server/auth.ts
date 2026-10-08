import { SignJWT, jwtVerify } from 'jose';
import { hash, compare } from 'bcryptjs';
import { getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';

export type UserRole = 'admin' | 'student';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export type AppEnv = {
  Variables: { user: AuthUser };
};

const jwtSecret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'driving-licence-dev-secret'
);

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(jwtSecret);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret);
    if (!payload.sub || typeof payload.email !== 'string') return null;
    const role =
      payload.role === 'admin' ? 'admin' : payload.role === 'student' ? 'student' : null;
    if (!role) return null;
    return { id: payload.sub, email: payload.email, role };
  } catch {
    return null;
  }
}

export async function getAuthUser(c: Context): Promise<AuthUser | null> {
  const token = getCookie(c, 'token');
  if (!token) return null;
  return verifyToken(token);
}

export function setAuthCookie(c: Context, token: string): void {
  setCookie(c, 'token', token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}