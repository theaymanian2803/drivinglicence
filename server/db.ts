import { createClient, type Client } from '@libsql/client';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth';

const url = process.env.TURSO_DATABASE_URL;

export const db: Client = createClient(
  url
    ? { url, authToken: process.env.TURSO_AUTH_TOKEN ?? undefined }
    : { url: 'file:local.db' }
);

async function runSql(sql: string): Promise<void> {
  const client = db as Client & { executeMultiple?: (sql: string) => Promise<unknown> };
  if (typeof client.executeMultiple === 'function') {
    await client.executeMultiple(sql);
    return;
  }
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db.execute(stmt);
  }
}

export async function runMigrations(): Promise<void> {
  const dir = path.resolve(process.cwd(), 'db', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), 'utf8');
    await runSql(sql);
  }
}

async function bootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = await db.execute({
    sql: 'SELECT 1 FROM users WHERE email = ? LIMIT 1',
    args: [email],
  });
  if (existing.rows.length > 0) return;
  const id = randomUUID();
  const password_hash = await hashPassword(password);
  const now = new Date().toISOString();
  await db.execute({
    sql: 'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
    args: [id, email, password_hash, now],
  });
  console.log(`[init] created admin user ${email}`);
}

export async function init(): Promise<void> {
  await db.execute('PRAGMA foreign_keys = ON');
  await runMigrations();
  await bootstrapAdmin();
}