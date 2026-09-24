import { createClient, type Client } from '@libsql/client';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

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

export async function init(): Promise<void> {
  await db.execute('PRAGMA foreign_keys = ON');
  await runMigrations();
}