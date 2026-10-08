import { createClient, type Client, type InStatement } from '@libsql/client';
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

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function unquoteIdent(ident: string): string {
  return ident.replace(/^[`"[]/, '').replace(/[`"\]]$/, '');
}

const ADD_COLUMN_RE = /^\s*ALTER\s+TABLE\s+(\S+)\s+ADD\s+COLUMN\s+(\S+)/i;

// `ALTER TABLE ... ADD COLUMN` is not idempotent in SQLite, but the intent of a column
// addition is "ensure this column exists". Skipping it when the column is already present
// lets a migration whose schema landed without its ledger row converge instead of
// bricking startup with "duplicate column name". Checked per statement, so a migration
// that only half-landed still gets its missing columns added.
async function alreadyApplied(stmt: string): Promise<boolean> {
  const m = ADD_COLUMN_RE.exec(stmt);
  if (!m) return false;
  const table = unquoteIdent(m[1]);
  const column = unquoteIdent(m[2]);
  const rows = await db.execute(`PRAGMA table_info("${table.replace(/"/g, '""')}")`);
  return rows.rows.some((r) => String(r.name).toLowerCase() === column.toLowerCase());
}

export async function runMigrations(): Promise<void> {
  const dir = path.resolve(process.cwd(), 'db', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    file TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const appliedRes = await db.execute('SELECT file FROM schema_migrations');
  const applied = new Set(appliedRes.rows.map((r) => String(r.file)));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    const batch: InStatement[] = [];
    for (const stmt of splitStatements(sql)) {
      if (await alreadyApplied(stmt)) continue;
      batch.push({ sql: stmt });
    }
    batch.push({
      sql: 'INSERT INTO schema_migrations (file, applied_at) VALUES (?, ?)',
      args: [file, new Date().toISOString()],
    });
    // The migration and its schema_migrations row land in the SAME transaction. Applied
    // separately, a failure between the two steps leaves the schema ahead of the ledger,
    // so the migration is re-run forever and dies on already-applied DDL.
    await db.batch(batch, 'write');
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