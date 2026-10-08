# Road Signs Library + Public Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Signs reference library (name + category + sign image + explanation + optional scenario image) with admin CRUD, a student/public browsing page, and a global admin toggle that makes the landing page and signs public without login.

**Architecture:** New `signs` and `settings` tables (SQLite/Turso). New Hono routers `signs` and `settings`; reads on `GET /signs` are public-capable via a new `optionalUser` middleware, writes require admin. Frontend adds a `/signs` page, a public-aware `/` landing, an admin Signs manager, and a public-mode toggle in the admin header.

**Tech Stack:** Hono + @libsql/client, React 18 + react-router-dom v7, Vite, Tailwind CSS, lucide-react. No test framework exists in this repo — verification is `npm run typecheck` + `npm run build` + manual API checks.

**Spec:** `docs/superpowers/specs/2026-10-08-signs-and-public-mode-design.md`

## Global Constraints

- French UI copy (existing pages are French; admin headings may stay English like the existing admin).
- Sign categories are exactly: `Danger`, `Interdiction`, `Obligation`, `Indication`, `Précédence`, `Signalisation temporaire`.
- Follow existing patterns: routers mirror `server/routes/series.ts` / `questions.ts`; form modals mirror `SeriesFormModal` / `QuestionFormModal`; pages use `api` from `@/lib/db`.
- Image upload reuses `src/components/admin/ImageUpload.tsx` (R2 presigned flow, 5 MB max, PNG/JPG/WebP/GIF).
- Reads that must work for anonymous visitors must NOT use `requireUser`; writes always use `requireAdmin`.
- `site_public` default is `'0'` (current behavior preserved: login required for `/` and `/signs`).
- Typecheck runs BOTH tsconfigs: `tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json`.

---

### Task 1: Migration — `signs` and `settings` tables

**Files:**
- Create: `db/migrations/005_signs.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `signs` (columns `id, title, category, image_url, description, scenario_image_url, is_active, position, created_at, updated_at`), table `settings` (`key` PK, `value`), seeded row `site_public='0'`. Migration ledger stays consistent via existing `runMigrations` in `server/db.ts`.

- [ ] **Step 1: Create the migration file**

Create `db/migrations/005_signs.sql`:

```sql
CREATE TABLE IF NOT EXISTS signs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  image_url TEXT NOT NULL,
  description TEXT NOT NULL,
  scenario_image_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signs_active_category ON signs(is_active, category);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES ('site_public', '0')
ON CONFLICT(key) DO NOTHING;
```

- [ ] **Step 2: Verify the migration applies cleanly**

Run: `npm run dev:server` in a terminal and confirm the server starts without migration errors and logs `[server] listening on http://localhost:3001`. Stop it with Ctrl+C.

- [ ] **Step 3: Manual schema check (optional but recommended)**

Run a one-off check against the local DB by invoking the existing migration runner:

```bash
npx tsx -e "import { init } from './server/db'; import { db } from './server/db'; init().then(async () => { const r = await db.execute(`PRAGMA table_info('signs')`); console.log(r.rows); const s = await db.execute(`SELECT * FROM settings`); console.log(s.rows); process.exit(0); });"
```

Expected: `signs` columns listed and a `settings` row with `site_public = '0'`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/005_signs.sql
git commit -m "chore: add signs and settings schema"
```

---

### Task 2: Shared types and serializer

**Files:**
- Modify: `src/types/index.ts` (append)
- Modify: `server/serialize.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SIGN_CATEGORIES` constant (string array) — used by admin form and server default.
  - `type TrafficSign = { id: string; title: string; category: string; image_url: string; description: string; scenario_image_url: string | null; is_active: boolean; position: number; created_at: string; updated_at: string }`
  - `type SignInput = { title: string; category: string; image_url: string; description: string; scenario_image_url: string | null; is_active: boolean }`
  - `toSign(row: Record<string, unknown>): SerializedSign` in `server/serialize.ts`.

- [ ] **Step 1: Append types to `src/types/index.ts`**

```ts
export const SIGN_CATEGORIES = [
  'Danger',
  'Interdiction',
  'Obligation',
  'Indication',
  'Précédence',
  'Signalisation temporaire',
] as const;

export type SignCategory = (typeof SIGN_CATEGORIES)[number];

export interface TrafficSign {
  id: string;
  title: string;
  category: string;
  image_url: string;
  description: string;
  scenario_image_url: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SignInput {
  title: string;
  category: string;
  image_url: string;
  description: string;
  scenario_image_url: string | null;
  is_active: boolean;
}
```

- [ ] **Step 2: Append serializer to `server/serialize.ts`**

```ts
export interface SerializedSign {
  id: string;
  title: string;
  category: string;
  image_url: string;
  description: string;
  scenario_image_url: string | null;
  is_active: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export function toSign(row: Record<string, unknown>): SerializedSign {
  return {
    id: row.id as string,
    title: row.title as string,
    category: row.category as string,
    image_url: row.image_url as string,
    description: row.description as string,
    scenario_image_url: (row.scenario_image_url as string | null) ?? null,
    is_active: Number(row.is_active),
    position: Number(row.position),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts server/serialize.ts
git commit -m "feat: add TrafficSign types and serializer"
```

---

### Task 3: `optionalUser` middleware

**Files:**
- Modify: `server/middleware.ts`

**Interfaces:**
- Consumes: `getAuthUser` from `server/auth.ts`; `AppEnv` type (already imported/used).
- Produces: `optionalUser(c: Context, next: Next)` — sets `c.set('user', user)` when a valid token is present, otherwise calls `next()` without setting user. Used by `GET /api/signs` so anonymous (public-mode) visitors can read active signs while admins can pass `?all=true`.

- [ ] **Step 1: Add the middleware**

In `server/middleware.ts`, append after `requireUser`:

```ts
export async function optionalUser(c: Context, next: Next) {
  const user = await getAuthUser(c);
  if (user) {
    c.set('user', user);
  }
  await next();
}
```

Note: `AppEnv.Variables.user` is typed as required `AuthUser`, so in route handlers that accept an optional user you must read it defensively: `const user = c.get('user') as import('../auth').AuthUser | undefined;`

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/middleware.ts
git commit -m "feat: add optionalUser middleware"
```

---

### Task 4: Signs API routes

**Files:**
- Create: `server/routes/signs.ts`

**Interfaces:**
- Consumes: `db` from `../db`; `optionalUser`, `requireAdmin` from `../middleware`; `toSign` from `../serialize`; `SignInput` from `../../src/types`.
- Produces router `signRoutes` mounted at `/api/signs` with:
  - `GET /` (optionalUser) — all active signs ordered by `category ASC, position ASC, created_at ASC`; if `?all=true` and an admin is present, includes inactive.
  - `GET /:id` (optionalUser)
  - `POST /` (requireAdmin) — requires `title`, `image_url`, `description`; category defaults to `SIGN_CATEGORIES[0]` ('Danger'); position = max+1.
  - `PUT /:id` (requireAdmin)
  - `DELETE /:id` (requireAdmin)
  - `PATCH /reorder` (requireAdmin) — body `{ ids: string[] }`, sets `position = index`.

- [ ] **Step 1: Create `server/routes/signs.ts`**

```ts
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { optionalUser, requireAdmin } from '../middleware';
import { toSign } from '../serialize';
import { SIGN_CATEGORIES } from '../../src/types';
import type { SignInput } from '../../src/types';

type SignBody = Partial<SignInput>;

export const signRoutes = new Hono<AppEnv>();

const INSERT_COLUMNS =
  'id, title, category, image_url, description, scenario_image_url, is_active, position, created_at, updated_at';

signRoutes.get('/', optionalUser, async (c) => {
  const user = c.get('user') as { role?: string } | undefined;
  const includeAll = c.req.query('all') === 'true' && user?.role === 'admin';
  const result = await db.execute(
    `SELECT * FROM signs ${includeAll ? '' : 'WHERE is_active = 1'}
     ORDER BY category ASC, position ASC, created_at ASC`
  );
  return c.json({ data: result.rows.map((r) => toSign(r as Record<string, unknown>)) });
});

signRoutes.get('/:id', optionalUser, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid sign id' }, 400);
  const result = await db.execute({ sql: 'SELECT * FROM signs WHERE id = ?', args: [id] });
  if (result.rows.length === 0) return c.json({ error: 'Sign not found' }, 404);
  return c.json({ data: toSign(result.rows[0] as Record<string, unknown>) });
});

signRoutes.patch('/reorder', requireAdmin, async (c) => {
  const body = await c.req.json<{ ids?: unknown }>().catch(() => ({} as { ids?: unknown }));
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string')) {
    return c.json({ error: 'Invalid ids payload' }, 400);
  }
  const statements = body.ids.map((id, index) => ({
    sql: 'UPDATE signs SET position = ? WHERE id = ?',
    args: [index, id as string],
  }));
  await db.batch(statements);
  return c.json({ data: { ok: true } });
});

signRoutes.post('/', requireAdmin, async (c) => {
  const body = await c.req.json<SignBody>().catch(() => ({} as SignBody));
  if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400);
  if (!body.image_url?.trim()) return c.json({ error: 'Sign image is required' }, 400);
  if (!body.description?.trim()) return c.json({ error: 'Description is required' }, 400);

  const pos = await db.execute({
    sql: 'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM signs',
  });
  const nextPosition = Number((pos.rows[0] as Record<string, unknown>).next_position);
  const category = SIGN_CATEGORIES.includes(body.category as SignCategory)
    ? (body.category as string)
    : SIGN_CATEGORIES[0];
  const now = new Date().toISOString();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO signs (${INSERT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      body.title.trim(),
      category,
      body.image_url.trim(),
      body.description.trim(),
      body.scenario_image_url || null,
      body.is_active ? 1 : 0,
      nextPosition,
      now,
      now,
    ],
  });
  const created = await db.execute({ sql: 'SELECT * FROM signs WHERE id = ?', args: [id] });
  return c.json({ data: toSign(created.rows[0] as Record<string, unknown>) }, 201);
});

signRoutes.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid sign id' }, 400);
  const body = await c.req.json<SignBody>().catch(() => ({} as SignBody));
  if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400);
  if (!body.image_url?.trim()) return c.json({ error: 'Sign image is required' }, 400);
  if (!body.description?.trim()) return c.json({ error: 'Description is required' }, 400);

  const category = SIGN_CATEGORIES.includes(body.category as SignCategory)
    ? (body.category as string)
    : SIGN_CATEGORIES[0];
  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE signs SET title = ?, category = ?, image_url = ?, description = ?, scenario_image_url = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    args: [
      body.title.trim(),
      category,
      body.image_url.trim(),
      body.description.trim(),
      body.scenario_image_url || null,
      body.is_active ? 1 : 0,
      now,
      id,
    ],
  });
  const updated = await db.execute({ sql: 'SELECT * FROM signs WHERE id = ?', args: [id] });
  if (updated.rows.length === 0) return c.json({ error: 'Sign not found' }, 404);
  return c.json({ data: toSign(updated.rows[0] as Record<string, unknown>) });
});

signRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid sign id' }, 400);
  const result = await db.execute({ sql: 'DELETE FROM signs WHERE id = ?', args: [id] });
  if (result.rowsAffected === 0) return c.json({ error: 'Sign not found' }, 404);
  return c.json({ data: { ok: true } });
});
```

- [ ] **Step 2: Register the router in `server/index.ts`**

Add import after the `uploadRoutes` import:

```ts
import { signRoutes } from './routes/signs';
```

Add mount after `app.route('/api/upload', uploadRoutes);`:

```ts
app.route('/api/signs', signRoutes);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors (verify the `SIGN_CATEGORIES.includes(body.category as SignCategory)` guard compiles; `as SignCategory` coercion is intentional).

- [ ] **Step 4: Manual API check (require server running)**

Start `npm run dev:server`, then (admin session required for write tests — use the app's admin login to obtain a cookie; the read endpoint works anonymously):

```bash
curl.exe -s http://localhost:3001/api/signs
```

Expected: `{"data":[]}` — 200 and empty array (no auth needed).

- [ ] **Step 5: Commit**

```bash
git add server/routes/signs.ts server/index.ts
git commit -m "feat: add signs CRUD API"
```

---

### Task 5: Settings API routes

**Files:**
- Create: `server/routes/settings.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `db` from `../db`; `requireAdmin` from `../middleware`.
- Produces router `settingsRoutes` mounted at `/api/settings`:
  - `GET /public` (no auth) → `{ data: { site_public: boolean } }`
  - `PUT /` (admin) → body `{ site_public: boolean }`, upserts row, returns `{ data: { site_public: boolean } }`

- [ ] **Step 1: Create `server/routes/settings.ts`**

```ts
import { Hono } from 'hono';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { requireAdmin } from '../middleware';

export const settingsRoutes = new Hono<AppEnv>();

async function readSitePublic(): Promise<boolean> {
  const res = await db.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: ['site_public'],
  });
  const value = res.rows[0] ? String((res.rows[0] as Record<string, unknown>).value) : '0';
  return value === '1';
}

settingsRoutes.get('/public', async (c) => {
  return c.json({ data: { site_public: await readSitePublic() } });
});

settingsRoutes.put('/', requireAdmin, async (c) => {
  const body = await c.req
    .json<{ site_public?: unknown }>()
    .catch(() => ({} as { site_public?: unknown }));
  const site_public = body.site_public ? '1' : '0';
  await db.execute({
    sql: `INSERT INTO settings (key, value) VALUES ('site_public', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [site_public],
  });
  return c.json({ data: { site_public: site_public === '1' } });
});
```

- [ ] **Step 2: Register the router in `server/index.ts`**

Add import after the `signRoutes` import:

```ts
import { settingsRoutes } from './routes/settings';
```

Add mount after `app.route('/api/signs', signRoutes);`:

```ts
app.route('/api/settings', settingsRoutes);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual check**

With server running: `curl.exe -s http://localhost:3001/api/settings/public`
Expected: `{"data":{"site_public":false}}`

- [ ] **Step 5: Commit**

```bash
git add server/routes/settings.ts server/index.ts
git commit -m "feat: add site settings API"
```

---

### Task 6: `useSitePublic` hook + public routing + SiteHeader nav

**Files:**
- Create: `src/lib/settings.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/SiteHeader.tsx`

**Interfaces:**
- Consumes: `api` from `@/lib/db`; `useAuth` from `@/context/AuthContext`.
- Produces:
  - `useSitePublic(): boolean | null` — fetches `/settings/public` once; `null` while loading, else boolean.
  - `LandingOrSeries` component (in App.tsx) — user → `<SeriesSelection />`; no user + public → `<Landing />`; no user + private → redirect `/login`.
  - `SignsGate` component (in App.tsx) — user OR public → children; else redirect `/login`.
  - New routes: `/` → `LandingOrSeries`, `/signs` → `SignsGate` + `<Signs />`.
  - `SiteHeader` shows a "Panneaux" nav link and a "Connexion" link when anonymous.

Note: `<Landing />` and `<Signs />` components don't exist yet — Tasks 7 and 8 create them. To keep each task self-contained, Task 6 wires the route structure importing those two modules; the files must exist for typecheck to pass, so create minimal placeholder-stub components in Tasks 6 (imports) then flesh them out in Tasks 7/8. Recommended: create both files in this task with their full implementation from Tasks 7/8, then Tasks 7/8 become "verify/polish". Simpler alternative that keeps tasks independent: do Task 6, then 7 (Landing), then 8 (Signs), then 9 (admin), and run typecheck only after 8. Plan executes tasks sequentially, so ordering below is: SiteHeader + hook (6), Landing (7), Signs page (8), App wiring (9). Commit 6 only if it typechecks; otherwise merge its commit into 7.

- [ ] **Step 1: Create `src/lib/settings.ts`**

```ts
import { useEffect, useState } from 'react';
import { api } from './db';

export function useSitePublic(): boolean | null {
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  useEffect(() => {
    api.get<{ site_public: boolean }>('/settings/public').then((res) => {
      setIsPublic(res.data?.site_public ?? false);
    });
  }, []);
  return isPublic;
}
```

- [ ] **Step 2: Update `src/components/SiteHeader.tsx`**

Add a "Panneaux" nav link in BOTH the desktop nav (`hidden md:flex`) and mobile nav. Place it after the "Révision" link. Use `Signpost` icon from lucide-react.

Update imports:

```ts
import { BookOpen, Car, History, LogOut, Shield, Signpost, User } from 'lucide-react';
```

Add to desktop nav (after the Révision `NavLink`):

```tsx
<NavLink to="/signs" className={navClass} relative="path">
  <Signpost className="w-4 h-4" />
  <span>Panneaux</span>
</NavLink>
```

Add the same block to the mobile nav (after the Révision link there too).

Add a "Connexion" link for anonymous users in the right-side group (before the admin link block), so public-mode visitors can log in:

```tsx
{!user && (
  <Link
    to="/login"
    className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary-600 transition-colors px-3 py-2 rounded-lg hover:bg-primary-50"
  >
    <User className="w-4 h-4" />
    <span>Connexion</span>
  </Link>
)}
```

- [ ] **Step 3: Commit (provisional — if typecheck below fails because Landing/Signs imports aren't added yet, skip this commit and fold it into Task 8)**

```bash
git add src/lib/settings.ts src/components/SiteHeader.tsx
git commit -m "feat: add useSitePublic hook and signs nav"
```

---

### Task 7: Public landing page

**Files:**
- Create: `src/pages/Landing.tsx`

**Interfaces:**
- Consumes: `api` from `@/lib/db`; `SiteHeader` from `@/components/SiteHeader`; `SeriesWithCount` from `@/types`.
- Produces `Landing()` component: hero + active series grid (cards locked with "Se connecter pour passer l'examen") + a Signs call-to-action card linking to `/signs` + a login CTA. Rendered at `/` only for anonymous visitors when `site_public` is on.

- [ ] **Step 1: Create `src/pages/Landing.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Car,
  ChevronRight,
  Clock,
  FileQuestion,
  Loader2,
  Lock,
  Signpost,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/db';
import SiteHeader from '@/components/SiteHeader';
import type { SeriesWithCount } from '@/types';

export default function Landing() {
  const [series, setSeries] = useState<SeriesWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<SeriesWithCount[]>('/series').then((res) => {
      if (!res.error) setSeries(res.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <SiteHeader title="Code de la Route" subtitle="Catégorie B — Maroc" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Hero */}
        <section className="text-center mb-12 animate-fade-in">
          <div className="inline-flex w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl items-center justify-center shadow-xl mb-5">
            <Car className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 mb-4">
            Prépare le Code de la Route
          </h1>
          <p className="text-slate-500 max-w-2xl mx-auto text-lg">
            Entraîne-toi avec des séries d'examens chronométrées et apprends la
            signification de chaque panneau de signalisation.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/signs"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold shadow-md transition-colors"
            >
              <Signpost className="w-5 h-5" />
              Explorer les panneaux
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 hover:border-primary-300 text-slate-700 rounded-xl font-semibold shadow-sm transition-colors"
            >
              <Sparkles className="w-5 h-5 text-primary-600" />
              Espace élève
            </Link>
          </div>
        </section>

        {/* Series */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-slate-900">Séries d'examen</h2>
            <Link
              to="/login"
              className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
            >
              Se connecter <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
          )}

          {!loading && series.length === 0 && (
            <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-10 text-center">
              <p className="text-slate-500 font-medium">Aucune série disponible pour le moment.</p>
            </div>
          )}

          {!loading && series.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {series.map((s) => (
                <div
                  key={s.id}
                  className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-primary-300 hover:shadow-xl transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                      <FileQuestion className="w-7 h-7 text-white" />
                    </div>
                    <span className="px-3 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full">
                      {s.category}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{s.title}</h3>
                  {s.description && (
                    <p className="text-sm text-slate-500 mb-4 line-clamp-2">{s.description}</p>
                  )}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <FileQuestion className="w-4 h-4" />
                        {s.question_count} questions
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        ~{Math.ceil((s.question_count * 20) / 60)} min
                      </span>
                    </div>
                    <Lock className="w-5 h-5 text-slate-300" />
                  </div>
                  <Link
                    to="/login"
                    className="mt-4 block text-center px-4 py-2.5 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-xl text-sm font-semibold transition-colors"
                  >
                    Se connecter pour passer l'examen
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (App.tsx does not import Landing yet, which is fine — this file only imports existing modules).

- [ ] **Step 3: Commit**

```bash
git add src/pages/Landing.tsx
git commit -m "feat: add public landing page"
```

---

### Task 8: Student/public Signs page

**Files:**
- Create: `src/pages/student/Signs.tsx`

**Interfaces:**
- Consumes: `api` from `@/lib/db`; `SiteHeader` from `@/components/SiteHeader`; `TrafficSign`, `SIGN_CATEGORIES` from `@/types`.
- Produces `Signs()` component: fetches `/signs`, groups by category (category order = `SIGN_CATEGORIES` order, then insertion order), renders each category as a section with expandable cards (sign image + title; expanded shows description + optional scenario image).

- [ ] **Step 1: Create `src/pages/student/Signs.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, CreditCard, Image as ImageIcon, Loader2, Signpost } from 'lucide-react';
import { api } from '@/lib/db';
import SiteHeader from '@/components/SiteHeader';
import { SIGN_CATEGORIES } from '@/types';
import type { TrafficSign } from '@/types';

export default function Signs() {
  const [signs, setSigns] = useState<TrafficSign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get<TrafficSign[]>('/signs').then((res) => {
      if (res.error) {
        setError('Impossible de charger les panneaux. Réessaie plus tard.');
      } else {
        setSigns(res.data);
      }
      setLoading(false);
    });
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, TrafficSign[]>();
    for (const c of SIGN_CATEGORIES) map.set(c, []);
    for (const s of signs) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return [...map.entries()].filter(([, list]) => list.length > 0);
  }, [signs]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <SiteHeader title="Les panneaux" subtitle="Signification des panneaux de signalisation" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-md">
            <Signpost className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Panneaux de signalisation</h1>
            <p className="text-sm text-slate-500">
              Clique sur un panneau pour voir sa signification
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            <p className="text-slate-400 mt-3">Chargement...</p>
          </div>
        )}

        {error && (
          <div className="max-w-md mx-auto bg-error-50 border border-error-200 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-error-500 mx-auto mb-2" />
            <p className="text-error-700 font-medium">{error}</p>
          </div>
        )}

        {!loading && !error && signs.length === 0 && (
          <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-10 text-center">
            <Signpost className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Aucun panneau disponible pour le moment.</p>
          </div>
        )}

        {!loading && !error && groups.length > 0 && (
          <div className="space-y-8">
            {groups.map(([category, list]) => (
              <section key={category} className="animate-fade-in">
                <h2 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-200 pb-2">
                  {category}
                  <span className="ml-2 text-sm font-medium text-slate-400">
                    {list.length} panneau{list.length > 1 ? 'x' : ''}
                  </span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {list.map((s) => {
                    const isOpen = expanded.has(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggle(s.id)}
                        className={`text-left bg-white rounded-2xl border p-4 transition-all duration-200 ${
                          isOpen
                            ? 'border-primary-300 shadow-lg col-span-2 sm:col-span-3 lg:col-span-4'
                            : 'border-slate-200 hover:border-primary-300 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {s.image_url ? (
                            <img
                              src={s.image_url}
                              alt={s.title}
                              className="w-14 h-14 rounded-xl object-contain bg-slate-50 border border-slate-100"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center">
                              <ImageIcon className="w-6 h-6 text-slate-300" />
                            </div>
                          )}
                          <span className="flex-1 font-semibold text-slate-800 text-sm leading-snug">
                            {s.title}
                          </span>
                          <ChevronDown
                            className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </div>

                        {isOpen && (
                          <div className="mt-4 pt-4 border-t border-slate-100">
                            <p className="text-sm text-slate-700 mb-4">{s.description}</p>
                            {s.scenario_image_url && (
                              <figure>
                                <figcaption className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2">
                                  <CreditCard className="w-4 h-4" />
                                  Exemple en situation
                                </figcaption>
                                <img
                                  src={s.scenario_image_url}
                                  alt={`Situation ${s.title}`}
                                  className="rounded-xl border border-slate-200 w-full object-contain bg-slate-50"
                                />
                              </figure>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

Note: avoid importing `Image` as a name that collides with the global — the import above aliases it to `ImageIcon`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/student/Signs.tsx
git commit -m "feat: add signs learning page for students"
```

---

### Task 9: Wire public-aware routes in App.tsx

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useSitePublic` from `@/lib/settings`; `Landing` from `@/pages/Landing`; `Signs` from `@/pages/student/Signs`; `useAuth` from `@/context/AuthContext`; existing `StudentRoute`, `LoadingScreen`.
- Produces route changes in `AppRoutes`:
  - `/` → `LandingOrSeries`
  - `/signs` → `SignsGate`
  - Existing `/exam/:seriesId`, `/revision`, `/revision/exam`, `/history` unchanged (always `StudentRoute`).

- [ ] **Step 1: Edit `src/App.tsx`**

Add imports:

```tsx
import Landing from '@/pages/Landing';
import Signs from '@/pages/student/Signs';
import { useSitePublic } from '@/lib/settings';
```

Add two components after `ProtectedRoute`:

```tsx
function LandingOrSeries() {
  const { user, loading } = useAuth();
  const isPublic = useSitePublic();

  if (loading || isPublic === null) return <LoadingScreen />;
  if (user) return <SeriesSelection />;
  if (isPublic) return <Landing />;
  return <Navigate to="/login" replace />;
}

function SignsGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const isPublic = useSitePublic();

  if (loading || isPublic === null) return <LoadingScreen />;
  if (user || isPublic) return <>{children}</>;
  return <Navigate to="/login" replace />;
}
```

Replace the existing `/` route block:

```tsx
<Route path="/" element={<LandingOrSeries />} />
```

Add a `/signs` route right after `/`:

```tsx
<Route
  path="/signs"
  element={
    <SignsGate>
      <Signs />
    </SignsGate>
  }
/>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: full Vite build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add public-aware routes for landing and signs"
```

---

### Task 10: Admin Sign form modal

**Files:**
- Create: `src/components/admin/SignFormModal.tsx`

**Interfaces:**
- Consumes: `api` from `@/lib/db`; `ImageUpload` from `@/components/admin/ImageUpload`; `TrafficSign`, `SIGN_CATEGORIES` from `@/types`.
- Produces `SignFormModal({ sign: TrafficSign | null, onClose, onSaved })` — modal with title, category select, required sign image upload, required explanation textarea, optional scenario image upload, active toggle, POST/PUT to `/signs`.

- [ ] **Step 1: Create `src/components/admin/SignFormModal.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { ImageUpload } from './ImageUpload';
import { api } from '@/lib/db';
import { SIGN_CATEGORIES } from '@/types';
import type { TrafficSign } from '@/types';

interface Props {
  sign: TrafficSign | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function SignFormModal({ sign, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(sign?.title ?? '');
  const [category, setCategory] = useState(sign?.category ?? SIGN_CATEGORIES[0]);
  const [imageUrl, setImageUrl] = useState(sign?.image_url ?? '');
  const [description, setDescription] = useState(sign?.description ?? '');
  const [scenarioImageUrl, setScenarioImageUrl] = useState(sign?.scenario_image_url ?? '');
  const [isActive, setIsActive] = useState(sign?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sign) {
      setTitle(sign.title);
      setCategory(sign.category);
      setImageUrl(sign.image_url);
      setDescription(sign.description);
      setScenarioImageUrl(sign.scenario_image_url ?? '');
      setIsActive(sign.is_active);
    }
  }, [sign]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Titre requis.');
      return;
    }
    if (!imageUrl.trim()) {
      setError("L'image du panneau est requise.");
      return;
    }
    if (!description.trim()) {
      setError('La signification est requise.');
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      title: title.trim(),
      category,
      image_url: imageUrl.trim(),
      description: description.trim(),
      scenario_image_url: scenarioImageUrl.trim() || null,
      is_active: isActive,
    };

    let res;
    if (sign) {
      res = await api.put<TrafficSign>(`/signs/${sign.id}`, payload);
    } else {
      res = await api.post<TrafficSign>('/signs', payload);
    }
    if (res.error) {
      setError(res.error.message);
      setSaving(false);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-slate-900">
            {sign ? 'Modifier le panneau' : 'Ajouter un panneau'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 bg-error-50 border border-error-200 text-error-700 rounded-lg p-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <ImageUpload value={imageUrl} onChange={setImageUrl} label="Image du panneau" hint="Obligatoire" />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nom du panneau <span className="text-error-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Cédez le passage"
              dir="auto"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Catégorie</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            >
              {SIGN_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Signification <span className="text-error-500">*</span>
            </label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              dir="auto"
              placeholder="Explique ce que ce panneau signifie pour le conducteur..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all resize-none"
            />
          </div>

          <ImageUpload
            value={scenarioImageUrl}
            onChange={setScenarioImageUrl}
            label="Image de situation (facultatif)"
            hint="Une image montrant le panneau en situation sur la route."
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Statut</label>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`w-full px-4 py-2.5 rounded-xl font-medium transition-all border ${
                isActive
                  ? 'bg-success-50 border-success-200 text-success-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              {isActive ? 'Visible' : 'Masqué'}
            </button>
          </div>

          <div className="flex gap-3 pt-2 sticky bottom-0 bg-white -mx-6 px-6 py-4 border-t border-slate-100 -mb-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : sign ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/SignFormModal.tsx
git commit -m "feat: add sign form modal for admin"
```

---

### Task 11: Admin Signs manager page

**Files:**
- Create: `src/pages/admin/AdminSigns.tsx`
- Modify: `src/App.tsx` (route)

**Interfaces:**
- Consumes: `api` from `@/lib/db`; `SignFormModal`; `TrafficSign`, `SIGN_CATEGORIES` from `@/types`.
- Produces `AdminSigns()` page at `/admin/signs`: list of signs (thumb + title + category + active toggle), reorder up/down (PATCH `/signs/reorder`), edit (modal), delete with confirmation. Mirrors `SeriesDetail.tsx` layout.

- [ ] **Step 1: Create `src/pages/admin/AdminSigns.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/db';
import type { TrafficSign } from '@/types';
import SignFormModal from '@/components/admin/SignFormModal';

export default function AdminSigns() {
  const [signs, setSigns] = useState<TrafficSign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSign, setEditingSign] = useState<TrafficSign | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<TrafficSign | null>(null);

  async function loadSigns() {
    setLoading(true);
    const res = await api.get<TrafficSign[]>('/signs?all=true');
    if (res.error) {
      setError('Unable to load signs.');
      setLoading(false);
      return;
    }
    setSigns(res.data.map((s) => ({ ...s, is_active: !!s.is_active })));
    setLoading(false);
  }

  useEffect(() => {
    loadSigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleActive(s: TrafficSign) {
    await api.put(`/signs/${s.id}`, {
      title: s.title,
      category: s.category,
      image_url: s.image_url,
      description: s.description,
      scenario_image_url: s.scenario_image_url,
      is_active: !s.is_active,
    });
    loadSigns();
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    const res = await api.del(`/signs/${deleteConfirm.id}`);
    if (res.error) {
      setError('Failed to delete sign.');
    } else {
      setDeleteConfirm(null);
      loadSigns();
    }
  }

  async function moveSign(s: TrafficSign, direction: 'up' | 'down') {
    const idx = signs.findIndex((item) => item.id === s.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= signs.length) return;
    const reordered = [...signs];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const res = await api.patch('/signs/reorder', { ids: reordered.map((item) => item.id) });
    if (res.error) {
      setError('Failed to reorder signs.');
      return;
    }
    loadSigns();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/dashboard"
              className="p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Panneaux de signalisation</h1>
              <p className="text-xs text-slate-500">
                {signs.length} panneau{signs.length !== 1 ? 'x' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingSign(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Ajouter un panneau</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 flex items-center gap-2 bg-error-50 border border-error-200 text-error-700 rounded-lg p-3 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
        )}

        {!loading && signs.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Aucun panneau pour le moment.</p>
            <p className="text-slate-400 text-sm mt-1">
              Clique sur "Ajouter un panneau" pour créer le premier.
            </p>
          </div>
        )}

        {!loading && signs.length > 0 && (
          <div className="space-y-3">
            {signs.map((s, idx) => (
              <div
                key={s.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    {s.image_url ? (
                      <img
                        src={s.image_url}
                        alt={s.title}
                        className="w-16 h-16 rounded-lg object-contain border border-slate-200 bg-slate-50"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200">
                        <ImageIcon className="w-6 h-6 text-slate-300" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-900 truncate">{s.title}</h3>
                      <button
                        onClick={() => toggleActive(s)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          s.is_active
                            ? 'text-success-600 hover:bg-success-50'
                            : 'text-slate-400 hover:bg-slate-100'
                        }`}
                        title={s.is_active ? 'Visible' : 'Masqué'}
                      >
                        {s.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                    </div>
                    <span className="text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full font-medium">
                      {s.category}
                    </span>
                    <p className="text-sm text-slate-500 mt-2 line-clamp-2">{s.description}</p>
                    {s.scenario_image_url && (
                      <p className="flex items-center gap-1 text-xs text-success-600 mt-1">
                        <ImageIcon className="w-3 h-3" />
                        Image de situation
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => moveSign(s, 'up')}
                      disabled={idx === 0}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveSign(s, 'down')}
                      disabled={idx === signs.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0 border-l border-slate-100 pl-2">
                    <button
                      onClick={() => {
                        setEditingSign(s);
                        setShowForm(true);
                      }}
                      className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(s)}
                      className="p-1.5 text-slate-500 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showForm && (
        <SignFormModal
          sign={editingSign}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            loadSigns();
          }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-error-50 rounded-xl flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-error-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Supprimer ce panneau ?</h3>
                <p className="text-sm text-slate-500">"{deleteConfirm.title}"</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Ce panneau sera définitivement supprimé. Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 bg-error-600 hover:bg-error-700 text-white rounded-xl font-medium transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register the route in `src/App.tsx`**

Add import:

```tsx
import AdminSigns from '@/pages/admin/AdminSigns';
```

Add route after the `/admin/series/:seriesId` route:

```tsx
<Route
  path="/admin/signs"
  element={
    <ProtectedRoute>
      <AdminSigns />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminSigns.tsx src/App.tsx
git commit -m "feat: add admin signs manager"
```

---

### Task 12: Admin dashboard — signs link + public mode toggle

**Files:**
- Modify: `src/pages/admin/AdminDashboard.tsx`

**Interfaces:**
- Consumes: `api` from `@/lib/db`; `useAuth` signOut (already used).
- Produces: a "Panneaux" link in the admin header (route `/admin/signs`) and a public-mode toggle switch bound to `site_public` (GET `/settings/public` on mount, PUT `/settings` on toggle). Uses `Signpost` and `Globe` icons.

- [ ] **Step 1: Edit `src/pages/admin/AdminDashboard.tsx`**

Update lucide imports — add `Signpost` and `Globe`:

```tsx
import {
  Car,
  Plus,
  Pencil,
  Trash2,
  FileQuestion,
  ChevronRight,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  LogOut,
  ArrowLeft,
  Users,
  Signpost,
  Globe,
} from 'lucide-react';
```

Add state + load inside the component (after `const [deleteConfirm, setDeleteConfirm] = useState<Series | null>(null);`):

```tsx
const [sitePublic, setSitePublic] = useState<boolean | null>(null);

useEffect(() => {
  api.get<{ site_public: boolean }>('/settings/public').then((res) => {
    if (!res.error) setSitePublic(res.data?.site_public ?? false);
  });
}, []);

async function togglePublic() {
  const next = !sitePublic;
  const res = await api.put('/settings', { site_public: next });
  if (!res.error) setSitePublic(next);
}
```

Add a "Panneaux" link in the header nav next to the existing Students link:

```tsx
<Link
  to="/admin/signs"
  className="text-sm text-slate-600 hover:text-primary-600 px-3 py-2 rounded-lg hover:bg-primary-50 transition-colors flex items-center gap-1.5"
>
  <Signpost className="w-4 h-4" />
  <span className="hidden sm:inline">Panneaux</span>
</Link>
```

Add a public-mode toggle row above the "Section header" in `<main>`:

```tsx
<div className="mb-6 bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
      <Globe className="w-5 h-5 text-primary-600" />
    </div>
    <div>
      <p className="font-bold text-slate-900">Mode public</p>
      <p className="text-sm text-slate-500">
        {sitePublic
          ? 'La page d’accueil et les panneaux sont visibles sans connexion.'
          : 'Seuls les élèves connectés voient la page d’accueil et les panneaux.'}
      </p>
    </div>
  </div>
  <button
    onClick={togglePublic}
    disabled={sitePublic === null}
    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
      sitePublic ? 'bg-success-500' : 'bg-slate-300'
    }`}
    aria-pressed={sitePublic ?? false}
    title={sitePublic ? 'Désactiver le mode public' : 'Activer le mode public'}
  >
    <span
      className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
        sitePublic ? 'translate-x-7' : 'translate-x-1'
      }`}
    />
  </button>
</div>
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/AdminDashboard.tsx
git commit -m "feat: add public mode toggle to admin dashboard"
```

---

### Task 13: End-to-end verification

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1–12.

- [ ] **Step 1: Typecheck + lint + build**

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: all three pass with no errors.

- [ ] **Step 2: Manual E2E with server running**

Start `npm run dev` (or `npm run dev:server` + `npm run dev:web`). Confirm:

1. Log in as admin → dashboard shows the "Mode public" toggle (off) and a "Panneaux" admin link.
2. In admin Panneaux manager: create a sign with a sign image and an optional scenario image; confirm it appears in the list; toggle active; reorder; delete.
3. As admin, toggle "Mode public" ON.
4. Open an incognito/private window → visit `/` → landing page shows (not redirected to `/login`); series cards show "Se connecter pour passer l'examen"; the Panneaux nav link works and `/signs` shows the signs grouped by category; expanding a sign shows the explanation + scenario image.
5. Try `/exam/<seriesId>` in the private window → redirected to `/login` (exams remain protected).
6. As admin, toggle "Mode public" OFF → anonymous `/` and `/signs` now redirect to `/login`.

- [ ] **Step 3: Final manual `git log` sanity**

```bash
git log --oneline -15
```

Expected: the twelve `feat:`/`chore:` commits from Tasks 1–12 present.

---

## Self-Review Notes

- **Spec coverage:** signs CRUD (Tasks 1,2,4,10,11), categories grouped display (Task 8), public mode toggle + public landing + `/signs` gating (Tasks 5,6,7,9,12), navigation (Task 6), image uploads (Task 10 via existing `ImageUpload`), auth rules (optionalUser on GET signs; requireAdmin on writes; exams stay protected — Task 9). No spec requirements left uncovered.
- **Type/name consistency:** `TrafficSign` / `SignInput` / `SIGN_CATEGORIES` / `toSign` / `signRoutes` / `settingsRoutes` / `useSitePublic` / `LandingOrSeries` / `SignsGate` used consistently across all tasks. `is_active` normalized with `!!` when read into React state, matching existing `Series` handling.
- **Placeholders:** none — every task contains full file contents or exact code edits.
- **Test framework note:** repo has no test runner (no jest/vitest in `package.json`); verification is typecheck + build + manual/curl checks per task, matching the repo's existing workflow.