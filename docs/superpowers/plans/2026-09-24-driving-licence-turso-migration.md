# Driving Licence → Turso Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Bolt-generated React driver's licence exam app from Supabase to a Turso-backed Hono API with JWT admin auth, fixing the question-reorder defect and N+1 count queries along the way.

**Architecture:** A Vite + React SPA (unchanged) talks to a new Hono Node API (`server/`) via `fetch` under `/api` (Vite dev proxy). The server is the only process that touches the database — Turso when `TURSO_DATABASE_URL` is set, otherwise a local SQLite `file:local.db`. Admin access is email+password with bcrypt hashes in a `users` table and a JWT in an httpOnly cookie; student reads are public.

**Tech Stack:** React 18, Vite 5, Tailwind 3, react-router 7 (frontend). Hono + @hono/node-server, @libsql/client, bcryptjs, jose (backend). tsx + concurrently for dev.

**Spec:** `docs/superpowers/specs/2026-09-24-driving-licence-turso-migration-design.md`

## Global Constraints

- Project root is `C:\Users\PC\Desktop\drivinglicence` (already flattened; git initialized; spec committed).
- TypeScript strict mode throughout; no `any` without a cast comment. `correct_answers` on the wire is `number[]`; in SQLite it is a JSON string parsed at the API boundary.
- API response envelope: success is `{ data: <payload> }`, error is `{ error: "<message>" }` with appropriate 4xx/5xx status.
- Auth cookie name is `token`; httpOnly, sameSite Lax, secure only in production, 7-day maxAge, path `/`.
- Env vars: `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` (optional in dev), `JWT_SECRET` (dev default `driving-licence-dev-secret`), `ADMIN_EMAIL`/`ADMIN_PASSWORD` (first-run admin bootstrap), `PORT` (default `3001`).
- No test framework — task verification is `npm run typecheck`, `npm run lint`, `npm run build`, plus the PowerShell curl-style checks written in each task.
- Do NOT touch UI copy/layout; only data-access lines change in the frontend.
- Every task ends with a `git commit`. No emojis in commit messages.

---

## Repository layout (target)

```
drivinglicence/
  src/
    types/index.ts          # + User, SeriesWithCount
    lib/db.ts               # typed fetch client (replaces lib/supabase.ts)
    context/AuthContext.tsx # rewired to /api/auth/*
    pages/...               # data-access swaps only
    components/admin/...    # data-access swaps only
  server/
    index.ts                # Hono app, route mounts, listen
    db.ts                   # libSQL client, migrations runner, admin bootstrap
    auth.ts                 # bcrypt + JWT + AppEnv type
    middleware.ts           # requireAdmin
    serialize.ts            # SQLite row → wire types
    routes/auth.ts
    routes/series.ts
    routes/questions.ts
  db/migrations/001_init.sql
  vite.config.ts            # /api proxy
  package.json              # renamed, new scripts
  .env.example
```

Deleted during migration: `.bolt/`, `supabase/`, `src/lib/supabase.ts`.

---

### Task 1: Bolt cleanup + project scaffolding

**Files:**
- Modify: `package.json` (name + scripts — deps change via npm commands)
- Modify: `tsconfig.node.json` (include server, node types)
- Modify: `eslint.config.js` (node globals for `server/**`)
- Create: `.env.example`
- Delete: `.bolt/`, `supabase/` (whole folders)
- Modify: `.gitignore` (add `local.db`, `*.db`)

**Interfaces:**
- Produces: runnable `npm install`; `npm run dev:web` still serves the unchanged app; server files typecheck once written.

- [ ] **Step 1: Delete Bolt artifacts and superseded migrations**

```bash
Remove-Item -Recurse -Force .bolt
Remove-Item -Recurse -Force supabase
```

Expected: both folders gone. `git status` shows deletions.

- [ ] **Step 2: Rename package and add scripts**

Edit `package.json`: `name` → `"driving-licence"`, `version` → `"0.1.0"`, and replace the `scripts` block with:

```json
"scripts": {
  "dev": "concurrently -k \"npm:dev:server\" \"npm:dev:web\"",
  "dev:web": "vite",
  "dev:server": "tsx watch server/index.ts",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json"
}
```

- [ ] **Step 3: Install the new backend dependencies**

`@supabase/supabase-js` is intentionally KEPT until Task 6 (frontend still imports it) — leave it in place for now.

```bash
npm install @hono/node-server @libsql/client bcryptjs hono jose
npm install -D @types/bcryptjs @types/node concurrently tsx
```

Expected: install completes. `npm run typecheck` and `npm run lint` still pass at the end of this task (supabase imports are untouched).

- [ ] **Step 4: Prepare the Node tsconfig**

Edit `tsconfig.node.json` — add `"types": ["node"]` to compilerOptions and change `include` to:

```json
"include": ["vite.config.ts", "server"]
```

- [ ] **Step 5: Node globals for eslint**

Append this config block to the `eslint.config.js` array (after the existing block, before the closing `);`):

```js
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
```

- [ ] **Step 6: Environment template**

Create `.env.example`:

```env
# Turso (optional in dev — falls back to a local file:local.db)
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# JWT signing secret (dev default exists; set a strong value for production)
JWT_SECRET=

# First admin user, created on server start when the users table is empty
ADMIN_EMAIL=
ADMIN_PASSWORD=

# API port
PORT=3001
```

Delete the old `.env` (contains the retired Supabase keys).

- [ ] **Step 7: Extend .gitignore**

Append to `.gitignore`:

```
local.db
*.db
```

- [ ] **Step 8: Verify + commit**

Run: `npm run typecheck` and `npm run lint`
Expected: both PASS (frontend still uses supabase.ts for now — it has not been deleted yet).

```bash
git add -A
git commit -m "chore: scaffold driving-licence project (deps, scripts, tsconfigs, env template)"
```

---

### Task 2: SQLite schema + DB module

**Files:**
- Create: `db/migrations/001_init.sql`
- Create: `server/db.ts`

**Interfaces:**
- Produces: `db` (libSQL `Client`), `init(): Promise<void>` (PRAGMA foreign_keys, migrations, admin bootstrap), `runMigrations(): Promise<void>`.
- Consumes: `hashPassword` from `server/auth.ts` (Task 3) — `db.ts` imports it. To keep this task independently verifiable, create a minimal throwaway `server/auth.ts` stub here is NOT needed: instead this task only writes `db.ts` WITHOUT admin bootstrap, and Task 3 adds the bootstrap. **Decision:** keep admin bootstrap in Task 3; this task's `init()` runs PRAGMA + migrations only.

- [ ] **Step 1: Write the schema**

Create `db/migrations/001_init.sql`:

```sql
CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT 'B',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  image_url TEXT,
  audio_url TEXT,
  question_text TEXT NOT NULL,
  question_text_2 TEXT,
  option_1 TEXT NOT NULL,
  option_2 TEXT NOT NULL,
  option_3 TEXT,
  option_4 TEXT,
  correct_answers TEXT NOT NULL DEFAULT '[]',
  timer_duration INTEGER NOT NULL DEFAULT 20 CHECK (timer_duration IN (10, 20, 30)),
  category TEXT NOT NULL DEFAULT 'B',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_series_id ON questions(series_id);
CREATE INDEX IF NOT EXISTS idx_series_is_active ON series(is_active);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO series (id, title, description, is_active, category, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'Series 1', 'Première série de questions du code de la route - Catégorie B', 1, 'B', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM series WHERE title = 'Series 1');
```

- [ ] **Step 2: Write the DB module**

Create `server/db.ts`:

```ts
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
```

- [ ] **Step 3: Verify migrations run**

```powershell
npx tsx -e 'import("./server/db.ts").then(async m => { await m.init(); const r = await m.db.execute("SELECT name FROM sqlite_master WHERE type=\"table\" ORDER BY name"); console.log(JSON.stringify(r.rows)); const s = await m.db.execute("SELECT title, is_active FROM series"); console.log(JSON.stringify(s.rows)); })'
```

Expected: prints the `series`, `questions`, `users` tables and the seeded `Series 1` row. A `local.db` file appears at the repo root.

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck`
Expected: PASS (server/db.ts is included via tsconfig.node.json).

```bash
git add -A
git commit -m "feat: add SQLite schema and libSQL db module"
```

---

### Task 3: Auth module + auth routes

**Files:**
- Create: `server/auth.ts`
- Create: `server/middleware.ts`
- Create: `server/routes/auth.ts`
- Create: `server/index.ts`
- Modify: `server/db.ts` (add `bootstrapAdmin`)

**Interfaces:**
- Produces: `AuthUser { id, email }`, `AppEnv`, `hashPassword`, `verifyPassword`, `signToken(user): Promise<string>`, `verifyToken(token): Promise<AuthUser|null>`, `getAuthUser(c): Promise<AuthUser|null>`, `requireAdmin` middleware, `authRoutes` (Hono), `init()` that also bootstraps the first admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- Consumes: `db` and `init` from Task 2.

- [ ] **Step 1: Auth primitives**

Create `server/auth.ts`:

```ts
import { SignJWT, jwtVerify } from 'jose';
import { hash, compare } from 'bcryptjs';
import { getCookie } from 'hono/cookie';
import type { Context } from 'hono';

export interface AuthUser {
  id: string;
  email: string;
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
  return new SignJWT({ email: user.email })
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
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export async function getAuthUser(c: Context): Promise<AuthUser | null> {
  const token = getCookie(c, 'token');
  if (!token) return null;
  return verifyToken(token);
}
```

- [ ] **Step 2: Admin middleware**

Create `server/middleware.ts`:

```ts
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
```

- [ ] **Step 3: Admin bootstrap in db.ts**

In `server/db.ts`, add `bootstrapAdmin` and call it from `init()`:

```ts
import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth';

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
```

- [ ] **Step 4: Auth routes**

Create `server/routes/auth.ts`:

```ts
import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { db } from '../db';
import { verifyPassword, signToken, getAuthUser, type AppEnv } from '../auth';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}));
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

  const user = { id: row.id, email: row.email };
  setCookie(c, 'token', await signToken(user), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
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
```

- [ ] **Step 5: Entry point**

Create `server/index.ts`:

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { authRoutes } from './routes/auth';
import { init } from './db';
import type { AppEnv } from './auth';

const app = new Hono<AppEnv>();

app.get('/api/health', (c) => c.json({ data: { ok: true } }));
app.route('/api/auth', authRoutes);

const port = Number(process.env.PORT ?? 3001);

init()
  .then(() => {
    serve({ fetch: app.fetch, port });
    console.log(`[server] listening on http://localhost:${port}`);
  })
  .catch((err) => {
    console.error('[server] failed to init', err);
    process.exit(1);
  });
```

- [ ] **Step 6: Verify auth flow over HTTP**

```powershell
$env:ADMIN_EMAIL = 'admin@example.com'
$env:ADMIN_PASSWORD = 'testpass123'
$env:JWT_SECRET = 'test-secret'
$p = Start-Process -FilePath "npx" -ArgumentList "tsx","server/index.ts" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 4
$r = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -Method Get
$r.data.ok                                        # True
$login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"admin@example.com","password":"testpass123"}' -SessionVariable s
$login.data.user.email                            # admin@example.com
(Invoke-RestMethod -Uri "http://localhost:3001/api/auth/me" -Method Get -WebSession $s).data.user.email   # admin@example.com
try { Invoke-WebRequest -Uri "http://localhost:3001/api/auth/me" -Method Get } catch { $_.Exception.Response.StatusCode.value__ }  # 401
Stop-Process -Id $p.Id -Force
```

Expected: `True`, both emails print, then `401`. Server logs `[init] created admin user admin@example.com`.

- [ ] **Step 7: Verify + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add JWT auth endpoints and server entry point"
```

---

### Task 4: Series + questions endpoints

**Files:**
- Create: `server/serialize.ts`
- Create: `server/routes/series.ts`
- Create: `server/routes/questions.ts`
- Modify: `src/types/index.ts` (add `SeriesWithCount`)
- Modify: `server/index.ts` (mount series + questions routes)

**Interfaces:**
- Produces: `toSeries`, `toQuestion` mappers; `seriesRoutes`, `questionRoutes`; wire types `SeriesRow`/`QuestionRow` (used by the frontend as `Series`, `Question`).
- Wire shape of `Series`: `{ id, title, description, is_active (0|1→bool→number), category, created_at, updated_at, question_count? }` — server sends `is_active` as number; the **frontend** treats it as boolean via `!!`. `Question.correct_answers` is `number[]` on the wire.

- [ ] **Step 1: Wire types shared with the frontend**

In `src/types/index.ts`, add:

```ts
export interface SeriesWithCount extends Series {
  question_count: number;
}
```

(Note: server `Series` rows carry `is_active: number`; the existing `Series` interface declares `is_active: boolean`. The API layer sends numbers, so pages must convert with `!!s.is_active` where it matters — see Task 6.)

- [ ] **Step 2: Row serializers**

Create `server/serialize.ts`:

```ts
export interface SerializedSeries {
  id: string;
  title: string;
  description: string | null;
  is_active: number;
  category: string;
  created_at: string;
  updated_at: string;
  question_count?: number;
}

export interface SerializedQuestion {
  id: string;
  series_id: string;
  image_url: string | null;
  audio_url: string | null;
  question_text: string;
  question_text_2: string | null;
  option_1: string;
  option_2: string;
  option_3: string | null;
  option_4: string | null;
  correct_answers: number[];
  timer_duration: number;
  category: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SerializedUser {
  id: string;
  email: string;
  created_at: string;
}

export function toSeries(row: Record<string, unknown>): SerializedSeries {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    is_active: Number(row.is_active),
    category: row.category as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    ...(row.question_count !== undefined
      ? { question_count: Number(row.question_count) }
      : {}),
  };
}

export function toQuestion(row: Record<string, unknown>): SerializedQuestion {
  let correctAnswers: number[] = [];
  try {
    const parsed = JSON.parse(row.correct_answers as string);
    if (Array.isArray(parsed)) correctAnswers = parsed as number[];
  } catch {
    correctAnswers = [];
  }
  return {
    id: row.id as string,
    series_id: row.series_id as string,
    image_url: (row.image_url as string | null) ?? null,
    audio_url: (row.audio_url as string | null) ?? null,
    question_text: row.question_text as string,
    question_text_2: (row.question_text_2 as string | null) ?? null,
    option_1: row.option_1 as string,
    option_2: row.option_2 as string,
    option_3: (row.option_3 as string | null) ?? null,
    option_4: (row.option_4 as string | null) ?? null,
    correct_answers: correctAnswers,
    timer_duration: Number(row.timer_duration),
    category: row.category as string,
    position: Number(row.position),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function toUser(row: Record<string, unknown>): SerializedUser {
  return {
    id: row.id as string,
    email: row.email as string,
    created_at: row.created_at as string,
  };
}
```

- [ ] **Step 3: Series routes**

Create `server/routes/series.ts`:

```ts
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { getAuthUser, type AppEnv } from '../auth';
import { requireAdmin } from '../middleware';
import { toSeries } from '../serialize';
import type { SeriesInput } from '../../src/types';

export const seriesRoutes = new Hono<AppEnv>();

seriesRoutes.get('/', async (c) => {
  const isAdmin = !!(await getAuthUser(c));
  const includeAll = c.req.query('all') === 'true' && isAdmin;
  const result = await db.execute(
    `SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.series_id = s.id) AS question_count
     FROM series s
     ${includeAll ? '' : 'WHERE s.is_active = 1'}
     ORDER BY s.created_at ASC`
  );
  return c.json({ data: result.rows.map((r) => toSeries(r as Record<string, unknown>)) });
});

seriesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.execute({ sql: 'SELECT * FROM series WHERE id = ?', args: [id] });
  if (result.rows.length === 0) return c.json({ error: 'Series not found' }, 404);
  return c.json({ data: toSeries(result.rows[0] as Record<string, unknown>) });
});

seriesRoutes.get('/:id/questions', async (c) => {
  const seriesId = c.req.param('id');
  const result = await db.execute({
    sql: 'SELECT * FROM questions WHERE series_id = ? ORDER BY position ASC, created_at ASC',
    args: [seriesId],
  });
  return c.json({ data: result.rows.map((r) => toQuestion(r as Record<string, unknown>)) });
});

seriesRoutes.post('/', requireAdmin, async (c) => {
  const body = await c.req.json<SeriesInput>().catch(() => ({}));
  if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400);
  const now = new Date().toISOString();
  const id = randomUUID();
  await db.execute({
    sql: 'INSERT INTO series (id, title, description, is_active, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [
      id,
      body.title.trim(),
      body.description || null,
      body.is_active ? 1 : 0,
      body.category || 'B',
      now,
      now,
    ],
  });
  const created = await db.execute({ sql: 'SELECT * FROM series WHERE id = ?', args: [id] });
  return c.json({ data: toSeries(created.rows[0] as Record<string, unknown>) }, 201);
});

seriesRoutes.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<SeriesInput>().catch(() => ({}));
  if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400);
  const now = new Date().toISOString();
  await db.execute({
    sql: 'UPDATE series SET title = ?, description = ?, is_active = ?, category = ?, updated_at = ? WHERE id = ?',
    args: [
      body.title.trim(),
      body.description || null,
      body.is_active ? 1 : 0,
      body.category || 'B',
      now,
      id,
    ],
  });
  const updated = await db.execute({ sql: 'SELECT * FROM series WHERE id = ?', args: [id] });
  if (updated.rows.length === 0) return c.json({ error: 'Series not found' }, 404);
  return c.json({ data: toSeries(updated.rows[0] as Record<string, unknown>) });
});

seriesRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const result = await db.execute({ sql: 'DELETE FROM series WHERE id = ?', args: [id] });
  if (result.rowsAffected === 0) return c.json({ error: 'Series not found' }, 404);
  return c.json({ data: { ok: true } });
});
```

Note the import `{ toQuestion }` must be added from `'../serialize'` in the series routes file — it is used by `GET /:id/questions`.

- [ ] **Step 4: Questions routes**

Create `server/routes/questions.ts`:

```ts
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { requireAdmin } from '../middleware';
import { toQuestion } from '../serialize';
import type { QuestionInput } from '../../src/types';

export const questionRoutes = new Hono<AppEnv>();

const INSERT_COLUMNS =
  'id, series_id, image_url, audio_url, question_text, question_text_2, option_1, option_2, option_3, option_4, correct_answers, timer_duration, category, position, created_at, updated_at';

questionRoutes.patch('/reorder', requireAdmin, async (c) => {
  const body = await c.req.json<{ ids?: unknown }>().catch(() => ({}));
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string')) {
    return c.json({ error: 'Invalid ids payload' }, 400);
  }
  const statements = body.ids.map((id, index) => ({
    sql: 'UPDATE questions SET position = ? WHERE id = ?',
    args: [index, id as string],
  }));
  await db.batch(statements);
  return c.json({ data: { ok: true } });
});

questionRoutes.post('/', requireAdmin, async (c) => {
  const body = await c.req.json<Partial<QuestionInput>>().catch(() => ({}));
  if (!body.series_id || !body.question_text?.trim()) {
    return c.json({ error: 'series_id and question_text are required' }, 400);
  }
  const pos = await db.execute({
    sql: 'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM questions WHERE series_id = ?',
    args: [body.series_id],
  });
  const nextPosition = Number((pos.rows[0] as Record<string, unknown>).next_position);
  const now = new Date().toISOString();
  const id = randomUUID();
  const args: (string | number | null)[] = [
    id,
    body.series_id,
    body.image_url || null,
    body.audio_url || null,
    body.question_text.trim(),
    body.question_text_2 || null,
    body.option_1,
    body.option_2,
    body.option_3 || null,
    body.option_4 || null,
    JSON.stringify(body.correct_answers ?? []),
    body.timer_duration ?? 20,
    body.category || 'B',
    nextPosition,
    now,
    now,
  ];
  await db.execute({
    sql: `INSERT INTO questions (${INSERT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args,
  });
  const created = await db.execute({ sql: 'SELECT * FROM questions WHERE id = ?', args: [id] });
  return c.json({ data: toQuestion(created.rows[0] as Record<string, unknown>) }, 201);
});

questionRoutes.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<QuestionInput>>().catch(() => ({}));
  if (!body.question_text?.trim()) return c.json({ error: 'question_text is required' }, 400);
  const now = new Date().toISOString();
  const args: (string | number | null)[] = [
    body.image_url || null,
    body.audio_url || null,
    body.question_text.trim(),
    body.question_text_2 || null,
    body.option_1,
    body.option_2,
    body.option_3 || null,
    body.option_4 || null,
    JSON.stringify(body.correct_answers ?? []),
    body.timer_duration ?? 20,
    body.category || 'B',
    body.series_id,
    now,
    id,
  ];
  await db.execute({
    sql: `UPDATE questions SET image_url = ?, audio_url = ?, question_text = ?, question_text_2 = ?, option_1 = ?, option_2 = ?, option_3 = ?, option_4 = ?, correct_answers = ?, timer_duration = ?, category = ?, series_id = ?, updated_at = ? WHERE id = ?`,
    args,
  });
  const updated = await db.execute({ sql: 'SELECT * FROM questions WHERE id = ?', args: [id] });
  if (updated.rows.length === 0) return c.json({ error: 'Question not found' }, 404);
  return c.json({ data: toQuestion(updated.rows[0] as Record<string, unknown>) });
});

questionRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const result = await db.execute({ sql: 'DELETE FROM questions WHERE id = ?', args: [id] });
  if (result.rowsAffected === 0) return c.json({ error: 'Question not found' }, 404);
  return c.json({ data: { ok: true } });
});
```

- [ ] **Step 5: Mount routes in index.ts**

In `server/index.ts`, import both route modules and mount:

```ts
import { seriesRoutes } from './routes/series';
import { questionRoutes } from './routes/questions';
...
app.route('/api/series', seriesRoutes);
app.route('/api/questions', questionRoutes);
```

- [ ] **Step 6: Verify CRUD + auth guard over HTTP**

```powershell
$env:ADMIN_EMAIL = 'admin@example.com'
$env:ADMIN_PASSWORD = 'testpass123'
$env:JWT_SECRET = 'test-secret'
$p = Start-Process -FilePath "npx" -ArgumentList "tsx","server/index.ts" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 4

$login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"admin@example.com","password":"testpass123"}' -SessionVariable s
$h = @{ }

# unauth write should 401
try { Invoke-WebRequest -Uri "http://localhost:3001/api/series" -Method Post -ContentType "application/json" -Body '{"title":"x"}' } catch { $_.Exception.Response.StatusCode.value__ }  # 401

$new = Invoke-RestMethod -Uri "http://localhost:3001/api/series" -Method Post -ContentType "application/json" -WebSession $s -Body '{"title":"Series Smoke","description":"test","is_active":true,"category":"B"}'
$new.data.title                                                        # Series Smoke
$new.data.is_active                                                    # 1

$q1 = Invoke-RestMethod -Uri "http://localhost:3001/api/questions" -Method Post -ContentType "application/json" -WebSession $s -Body ('{"series_id":"' + $new.data.id + '","question_text":"Q1","option_1":"A","option_2":"B","correct_answers":[1],"timer_duration":20,"category":"B"}')
$q1.data.correct_answers -join ','                                     # 1

$list = Invoke-RestMethod -Uri ("http://localhost:3001/api/series/" + $new.data.id + "/questions") -Method Get
$list.data.Count                                                       # 1

$upd = Invoke-RestMethod -Uri ("http://localhost:3001/api/series/" + $new.data.id) -Method Put -ContentType "application/json" -WebSession $s -Body '{"title":"Series Smoke 2","description":null,"is_active":false,"category":"B"}'
$upd.data.title                                                        # Series Smoke 2

$reorder = Invoke-RestMethod -Uri "http://localhost:3001/api/questions/reorder" -Method Patch -ContentType "application/json" -WebSession $s -Body ('{"ids":["' + $q1.data.id + '"]}')
$reorder.data.ok                                                       # True

Invoke-RestMethod -Uri ("http://localhost:3001/api/series/" + $new.data.id) -Method Delete -ContentType "application/json" -WebSession $s | Out-Null
Stop-Process -Id $p.Id -Force
```

Expected: `401`, `Series Smoke`, `1`, `1`, `1` (count), `Series Smoke 2`, `1`, `True`, then delete returns ok. Cleanup: remove `local.db` to reset state before the frontend work:

```powershell
Remove-Item -Force local.db -ErrorAction SilentlyContinue
```

- [ ] **Step 7: Verify + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add series and questions API endpoints with reorder"
```

---

### Task 5: Frontend data layer + auth context

**Files:**
- Create: `src/lib/db.ts`
- Modify: `src/types/index.ts` (add `User`)
- Modify: `src/context/AuthContext.tsx` (rewire)
- Modify: `src/pages/admin/AdminLogin.tsx` (login-only)

**Interfaces:**
- Produces: `api` client with `get<T>`, `post<T>`, `put<T>`, `patch<T>`, `del<T>` — each returns `{ data: T }` or `{ error: { message: string } }`. `AuthContext` exports `useAuth()` with `{ user: User|null, loading, signIn, signOut }`.
- Consumes: `User` type.

- [ ] **Step 1: Add User type**

In `src/types/index.ts`, add:

```ts
export interface User {
  id: string;
  email: string;
  created_at: string;
}
```

- [ ] **Step 2: Typed fetch client**

Create `src/lib/db.ts`:

```ts
import type { Series } from '@/types';

export interface ApiError {
  message: string;
}

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError };

type RequestInitShape = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
};

async function request<T>(path: string, init?: RequestInitShape): Promise<ApiResult<T>> {
  try {
    const hasBody = init?.body !== undefined;
    const res = await fetch(`/api${path}`, {
      method: init?.method ?? 'GET',
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });

    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      const raw = parsed as { error?: unknown } | null;
      const message =
        raw && typeof raw.error === 'string'
          ? raw.error
          : `Request failed (${res.status})`;
      return { data: null, error: { message } };
    }

    const unwrapped = (parsed as { data?: T } | null)?.data;
    return { data: (unwrapped === undefined ? (parsed as T) : unwrapped) as T, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Network error' },
    };
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export type { Series };
```

- [ ] **Step 3: Rewire AuthContext**

Replace the entire body of `src/context/AuthContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/db';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ user: User }>('/auth/me')
      .then((res) => {
        setUser(res.data?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await api.post<{ user: User }>('/auth/login', { email, password });
    if (res.error) return { error: res.error.message };
    setUser(res.data.user);
    return { error: null };
  };

  const signOut = async () => {
    await api.post('/auth/logout', {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Login-only AdminLogin**

Edit `src/pages/admin/AdminLogin.tsx`:
- `const { signIn } = useAuth();` (remove `signUp`)
- Remove the `mode` state and the two-tab toggle at the top of the card.
- `handleSubmit` calls only `signIn`; on error set `error`, on success `navigate('/admin/dashboard')`.
- Remove the "Inscription" buttons block. Keep the French copy identical otherwise.

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck`, `npm run lint`, `npm run build`
Expected: all PASS (pages still import `@/lib/supabase` — it still exists until Task 6).

```bash
git add -A
git commit -m "feat: rewire frontend data layer and auth to backend API"
```

---

### Task 6: Rewire pages/modals + Vite proxy

**Files:**
- Modify: `src/pages/student/SeriesSelection.tsx`
- Modify: `src/pages/student/ExamScreen.tsx`
- Modify: `src/pages/admin/AdminDashboard.tsx`
- Modify: `src/pages/admin/SeriesDetail.tsx`
- Modify: `src/components/admin/SeriesFormModal.tsx`
- Modify: `src/components/admin/QuestionFormModal.tsx`
- Modify: `vite.config.ts`
- Delete: `src/lib/supabase.ts`

**Interfaces:**
- Consumes: `api`, `Series`, `Question`, `SeriesWithCount`, `User` from Tasks 1–5.
- Produces: a fully rewired frontend; the exam/admin flows hit `/api` only.

- [ ] **Step 1: Vite proxy**

In `vite.config.ts`, add to `defineConfig`:

```ts
server: {
  proxy: {
    '/api': 'http://localhost:3001',
  },
},
```

- [ ] **Step 2: SeriesSelection**

Replace the `supabase` import with `import { api } from '@/lib/db';` and `SeriesWithCount`:
`import type { SeriesWithCount } from '@/types';`
Replace the `loadSeries` effect body:

```ts
async function loadSeries() {
  const res = await api.get<SeriesWithCount[]>('/series');
  if (res.error) {
    setError('Unable to load exam series. Please try again later.');
    setLoading(false);
    return;
  }
  setSeries(res.data);
  setLoading(false);
}
```

Use `SeriesWithCount[]` for state, drop the `Promise.all` count loop, and replace every `questionCount` reference in the JSX with `question_count`.

- [ ] **Step 3: ExamScreen**

Replace the supabase import with the `api` client. Replace the `loadData` effect:

```ts
async function loadData() {
  const [seriesRes, questionsRes] = await Promise.all([
    api.get<Series>(`/series/${seriesId}`),
    api.get<Question[]>(`/series/${seriesId}/questions`),
  ]);
  if (seriesRes.error || questionsRes.error) {
    setError('Unable to load exam data.');
    setPhase('exam');
    return;
  }
  if (!seriesRes.data) {
    setError('Series not found.');
    setPhase('exam');
    return;
  }
  const qData = questionsRes.data;
  if (!qData || qData.length === 0) {
    setError('This series has no questions yet.');
    setPhase('exam');
    return;
  }
  setSeries(seriesRes.data);
  setQuestions(qData);
  setTimeLeft(qData[0].timer_duration);
  setPhase('exam');
}
```

Note: `setSeries(seriesRes.data)` — the `Series` type declares `is_active: boolean` but the API sends `is_active: number`; add `is_active: !!seriesRes.data.is_active` and cast: `setSeries({ ...seriesRes.data, is_active: !!seriesRes.data.is_active })`. No other changes to the file.

- [ ] **Step 4: AdminDashboard**

Swap supabase calls:

```ts
async function loadSeries() {
  setLoading(true);
  const res = await api.get<SeriesWithCount[]>('/series?all=true');
  if (res.error) {
    setError('Unable to load series.');
    setLoading(false);
    return;
  }
  const withCounts = res.data.map((s) => ({ ...s, questionCount: s.question_count }));
  setSeries(withCounts);
  setLoading(false);
}

async function handleDelete() {
  if (!deleteConfirm) return;
  const res = await api.del(`/series/${deleteConfirm.id}`);
  if (res.error) {
    setError('Failed to delete series.');
  } else {
    setDeleteConfirm(null);
    loadSeries();
  }
}

async function toggleActive(s: Series) {
  await api.put(`/series/${s.id}`, {
    title: s.title,
    description: s.description,
    is_active: !s.is_active,
    category: s.category,
  });
  loadSeries();
}
```

Import `SeriesWithCount` from `@/types` and `api` from `@/lib/db`; remove the `supabase` import. Update the local `SeriesWithCount` interface — replace it with the shared type and keep a local alias:

```ts
type SeriesWithCount = import('@/types').SeriesWithCount & { questionCount: number };
```

- [ ] **Step 5: SeriesDetail**

Replace the supabase import. Replace `loadData`:

```ts
async function loadData() {
  if (!seriesId) return;
  setLoading(true);
  const [seriesRes, questionsRes] = await Promise.all([
    api.get<Series>(`/series/${seriesId}`),
    api.get<Question[]>(`/series/${seriesId}/questions`),
  ]);
  if (seriesRes.error || questionsRes.error || !seriesRes.data) {
    setError('Unable to load series details.');
    setLoading(false);
    return;
  }
  setSeries({ ...seriesRes.data, is_active: !!seriesRes.data.is_active });
  setQuestions(questionsRes.data ?? []);
  setLoading(false);
}
```

Replace `handleDelete`:

```ts
async function handleDelete() {
  if (!deleteConfirm) return;
  const res = await api.del(`/questions/${deleteConfirm.id}`);
  if (res.error) {
    setError('Failed to delete question.');
  } else {
    setDeleteConfirm(null);
    loadData();
  }
}
```

Replace `moveQuestion` (use the reorder endpoint — this FIXES the Bolt ordering bug):

```ts
async function moveQuestion(q: Question, direction: 'up' | 'down') {
  const idx = questions.findIndex((item) => item.id === q.id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= questions.length) return;
  const reordered = [...questions];
  [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
  const res = await api.patch('/questions/reorder', { ids: reordered.map((item) => item.id) });
  if (res.error) {
    setError('Failed to reorder questions.');
    return;
  }
  loadData();
}
```

- [ ] **Step 6: QuestionFormModal**

Replace the supabase import. Swap the save block (`handleSubmit`):

```ts
let res;
if (question) {
  res = await api.put<Question>(`/questions/${question.id}`, payload);
} else {
  res = await api.post<Question>('/questions', payload);
}
if (res.error) {
  setError(res.error.message);
  setSaving(false);
  return;
}
onSaved();
```

- [ ] **Step 7: SeriesFormModal**

Replace the supabase import. Swap `handleSubmit`:

```ts
let res;
if (series) {
  res = await api.put<Series>(`/series/${series.id}`, payload);
} else {
  res = await api.post<Series>('/series', payload);
}
if (res.error) {
  setError(res.error.message);
  setSaving(false);
  return;
}
onSaved();
```

- [ ] **Step 8: Remove supabase.ts**

```bash
Remove-Item src/lib/supabase.ts
npm uninstall @supabase/supabase-js
```

Grep the repo for `@/lib/supabase` and `from 'supabase'` — should be zero hits.

- [ ] **Step 9: Verify + commit**

Run: `npm run typecheck`, `npm run lint`, `npm run build`
Expected: all PASS.

```bash
git add -A
git commit -m "feat: rewire pages and admin to backend API, remove supabase client"
```

---

### Task 7: Full-stack smoke test + handoff

**Files:** none (verification only).

- [ ] **Step 1: Reset dev state**

```powershell
Remove-Item -Force local.db -ErrorAction SilentlyContinue
```

- [ ] **Step 2: Boot full stack**

```powershell
$env:ADMIN_EMAIL = 'admin@example.com'
$env:ADMIN_PASSWORD = 'testpass123'
$env:JWT_SECRET = 'test-secret'
$server = Start-Process -FilePath "npx" -ArgumentList "tsx","server/index.ts" -PassThru -WindowStyle Hidden
$vite = Start-Process -FilePath "npx" -ArgumentList "vite" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 8
```

- [ ] **Step 3: Exercise the whole API surface**

```powershell
$login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"admin@example.com","password":"testpass123"}' -SessionVariable s
# 1. series list is public + seeded
$list = Invoke-RestMethod -Uri "http://localhost:3001/api/series" -Method Get
$list.data[0].title                                  # Series 1
# 2. create admin series
$ser = Invoke-RestMethod -Uri "http://localhost:3001/api/series" -Method Post -ContentType "application/json" -WebSession $s -Body '{"title":"Smoke","description":null,"is_active":true,"category":"B"}'
# 3. add 3 questions
1..3 | ForEach-Object {
  Invoke-RestMethod -Uri "http://localhost:3001/api/questions" -Method Post -ContentType "application/json" -WebSession $s -Body ('{"series_id":"' + $ser.data.id + '","question_text":"Q' + $_ + '","option_1":"A","option_2":"B","option_3":"C","option_4":"D","correct_answers":[1],"timer_duration":20,"category":"B"}')
}
$qs = (Invoke-RestMethod -Uri ("http://localhost:3001/api/series/" + $ser.data.id + "/questions") -Method Get).data
$qs.Count                                              # 3
$order = $qs | ForEach-Object { $_.position }
$order -join ','                                       # 0,1,2
# 4. reverse via reorder
Invoke-RestMethod -Uri "http://localhost:3001/api/questions/reorder" -Method Patch -ContentType "application/json" -WebSession $s -Body ('{"ids":["' + $qs[2].id + '","' + $qs[1].id + '","' + $qs[0].id + '"]}')
$order2 = (Invoke-RestMethod -Uri ("http://localhost:3001/api/series/" + $ser.data.id + "/questions") -Method Get).data | ForEach-Object { $_.position }
$order2 -join ','                                      # 0,1,2 (reversed order now, positions still sequential)
# 5. frontend serves
$page = Invoke-WebRequest -Uri "http://localhost:5173/" -Method Get
$page.StatusCode                                       # 200
Stop-Process -Id $vite.Id -Force
Stop-Process -Id $server.Id -Force
```

Expected: outputs as annotated. (`position` after reorder is 0,1,2 — sequence is sequential even though row order reversed.)

- [ ] **Step 4: Final verification**

Run: `npm run typecheck`, `npm run lint`, `npm run build`
Expected: all PASS.

- [ ] **Step 5: Commit + handoff notes**

```bash
git add -A
git commit -m "docs: verification notes for turso migration"
```

Then leave a short commit/status summary + tell the user to run:

```bash
$env:ADMIN_EMAIL = "their@email.com"
$env:ADMIN_PASSWORD = "their-pass"
npm run dev
```

and visit http://localhost:5173 (student) and http://localhost:5173/admin.

To actually use Turso instead of the local file later:

1. `npm install -g turso` → `turso db create driving-licence` → `turso db tokens create driving-licence`
2. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in `.env`.