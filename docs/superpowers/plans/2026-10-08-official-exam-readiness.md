# Official Exam Mode + Readiness Meter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a true "official exam" simulation (random questions drawn from the whole active bank with fixed rules, reusing the exam engine) and a per-student readiness meter ("Prêt pour l'examen").

**Architecture:** One migration adds `series.is_official` and seeds a hidden official series row + three tuning settings keys. A new `/api/exams` router draws the bank and completes attempts (stored against the seeded official series id so the existing FK + history join work). A new `/api/readiness` router computes the gauge from recent weighted attempts + revision clearance. Frontend adds an official card + readiness gauge to the student home and an `officialMode` variant of `ExamScreen`.

**Tech Stack:** Hono + @libsql/client, React 18 + react-router-dom v7, Vite, Tailwind, lucide-react. No test framework — verification is typecheck + lint + build + manual API checks.

**Spec:** `docs/superpowers/specs/2026-10-08-official-exam-readiness-design.md`

## Global Constraints

- French UI copy on student pages (admin copy may stay English).
- Settings keys used by THIS feature (seeded, "1"/"0"-style string values, server-side fallbacks): `official_question_count` → 40, `official_pass_score` → 35, `official_timer_duration` → 20.
- The seeded official series row must be excluded from every normal series listing (`is_official = 0` filter on `GET /api/series`); it is only reachable via the special exam flow.
- All new routes use `requireStudent` (students only; public-mode landing does not expose the official exam).
- Existing helpers to reuse: `toIssue` is NOT for this; use `toQuestion` from `../serialize` and `toAttempt` from `../serialize`; `db` from `../db`; `randomUUID` from `node:crypto`.
- Do NOT modify `server/routes/attempts.ts` or `server/routes/settings.ts` behavior.
- `StudentRoute` guard in App.tsx is wrapped around the new route.
- Typecheck runs both tsconfigs: `npm run typecheck`. Build: `npm run build`. Lint: `npm run lint`.

---

### Task 1: Migration — official series + settings keys

**Files:**
- Create: `db/migrations/006_official_exam.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `series.is_official` column (default 0), index `idx_series_is_official`; one seeded official series row (`title='Examen officiel'`, `category='B'`, `is_official=1`, `is_active=1`, `pass_score=35`, `required_questions=40`) only if none exists; settings rows `official_question_count='40'`, `official_pass_score='35'`, `official_timer_duration='20'` (idempotent upserts). The migration ledger auto-tracks via `server/db.ts`; the `ALTER TABLE` is idempotent via the existing `alreadyApplied` check.

- [ ] **Step 1: Create the migration file**

Create `db/migrations/006_official_exam.sql`:

```sql
ALTER TABLE series ADD COLUMN is_official INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_series_is_official ON series(is_official);

INSERT INTO series (id, title, description, is_active, category, pass_score, required_questions, is_official, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'Examen officiel', 'Simulation de l''examen officiel — questions tirées de toute la banque', 1, 'B', 35, 40, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM series WHERE is_official = 1);

INSERT INTO settings (key, value) VALUES ('official_question_count', '40')
ON CONFLICT(key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('official_pass_score', '35')
ON CONFLICT(key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('official_timer_duration', '20')
ON CONFLICT(key) DO NOTHING;
```

Note the `''` escapes inside `'Simulation de l''examen officiel'` — SQLite single-quote escaping.

- [ ] **Step 2: Verify the migration applies cleanly**

Run: `npm run dev:server` in a terminal and confirm the server starts with `[server] listening on http://localhost:3001` and no migration errors, then stop it. (A pre-existing dev server may already hold :3001 — if so, verify PBY running the migration runner instead:)

```bash
npx tsx -e "import { init } from './server/db'; import { db } from './server/db'; init().then(async () => { const s = await db.execute({ sql: \"SELECT title, is_official FROM series WHERE is_official = 1\" }); console.log('official series:', s.rows); const k = await db.execute({ sql: \"SELECT key, value FROM settings WHERE key LIKE 'official_%' ORDER BY key\" }); console.log('settings:', k.rows); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });"
```

(If the quoting fights you on Windows, write the same logic to a throwaway `.ts` file and run it via `npx tsx <file>` — the goal is confirming one official series row and the three settings rows exist.)

- [ ] **Step 3: Commit**

```bash
git add db/migrations/006_official_exam.sql
git commit -m "chore: add official exam series and settings keys"
```

---

### Task 2: Exclude the official series from normal listings

**Files:**
- Modify: `server/routes/series.ts` (the `GET /` list query, both branches)

**Interfaces:**
- Consumes: Task 1 (`series.is_official` column exists).
- Produces: `GET /api/series` never returns `is_official = 1` rows (student AND admin `?all=true` branches). Used by `SeriesSelection.tsx` and `AdminDashboard.tsx` unchanged.

- [ ] **Step 1: Edit both list branches**

In `server/routes/series.ts`, the `GET /` handler builds SQL as:

```ts
const result = await db.execute(
  `SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.series_id = s.id) AS question_count
   FROM series s
   ${includeAll ? '' : 'WHERE s.is_active = 1'}
   ORDER BY s.created_at ASC`
);
```

Replace with a version that always filters out official series (append `AND s.is_official = 0` to both branches):

```ts
const where = includeAll ? 'WHERE s.is_official = 0' : 'WHERE s.is_active = 1 AND s.is_official = 0';
const result = await db.execute(
  `SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.series_id = s.id) AS question_count
   FROM series s
   ${where}
   ORDER BY s.created_at ASC`
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/routes/series.ts
git commit -m "feat: exclude official exam series from normal listings"
```

---

### Task 3: Official exams API router

**Files:**
- Create: `server/routes/exams.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: Task 1 (settings rows + official series row); `db` from `../db`; `requireStudent` from `../middleware`; `toQuestion`, `toAttempt` from `../serialize`; `randomUUID` from `node:crypto`.
- Produces router `examRoutes` mounted at `/api/exams`:
  - `GET /official/meta` → `{ data: { pass_score, question_count, timer_duration } }`
  - `GET /official` → `{ data: { pass_score, question_count, timer_duration, questions: Question[] } }` — 409 if insufficient active questions.
  - `POST /official/complete` → body `{ score, total_questions, wrong_question_ids }` → creates `exam_attempts` row against the official series id + revision rows, returns serialized attempt (201).
- Also exports `readOfficialConfig()` for Task 4's use (or duplicate the settings read; prefer a shared helper).

- [ ] **Step 1: Create `server/routes/exams.ts`**

```ts
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { requireStudent } from '../middleware';
import { toQuestion, toAttempt } from '../serialize';

export const examRoutes = new Hono<AppEnv>();

export interface OfficialConfig {
  pass_score: number;
  question_count: number;
  timer_duration: number;
}

async function readSetting(key: string, fallback: string): Promise<string> {
  const res = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] });
  return res.rows[0] ? String((res.rows[0] as Record<string, unknown>).value) : fallback;
}

export async function readOfficialConfig(): Promise<OfficialConfig> {
  return {
    pass_score: Number(await readSetting('official_pass_score', '35')),
    question_count: Number(await readSetting('official_question_count', '40')),
    timer_duration: Number(await readSetting('official_timer_duration', '20')),
  };
}

async function officialSeriesId(): Promise<string | null> {
  const res = await db.execute({ sql: 'SELECT id FROM series WHERE is_official = 1 LIMIT 1' });
  return res.rows[0] ? (res.rows[0] as Record<string, unknown>).id as string : null;
}

examRoutes.get('/official/meta', requireStudent, async (c) => {
  return c.json({ data: await readOfficialConfig() });
});

examRoutes.get('/official', requireStudent, async (c) => {
  const config = await readOfficialConfig();
  const result = await db.execute({
    sql: `SELECT q.* FROM questions q
          JOIN series s ON s.id = q.series_id
          WHERE s.is_active = 1 AND s.is_official = 0
          ORDER BY RANDOM() LIMIT ?`,
    args: [config.question_count],
  });
  const questions = result.rows.map((r) => toQuestion(r as Record<string, unknown>));
  if (questions.length < config.question_count) {
    return c.json(
      {
        error: `Il n'y a pas encore assez de questions actives pour l'examen officiel (${questions.length}/${config.question_count}).`,
      },
      409
    );
  }
  return c.json({ data: { ...config, questions } });
});

type CompleteBody = {
  score?: number;
  total_questions?: number;
  wrong_question_ids?: unknown;
};

examRoutes.post('/official/complete', requireStudent, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<CompleteBody>().catch(() => ({} as CompleteBody));
  const { score, total_questions } = body;
  if (typeof score !== 'number' || typeof total_questions !== 'number') {
    return c.json({ error: 'score and total_questions are required' }, 400);
  }
  const config = await readOfficialConfig();
  if (score < 0 || total_questions !== config.question_count || score > total_questions) {
    return c.json({ error: 'Invalid score values' }, 400);
  }
  const seriesId = await officialSeriesId();
  if (!seriesId) return c.json({ error: 'Official exam is not configured.' }, 500);

  const passed = score >= config.pass_score ? 1 : 0;
  const id = randomUUID();
  const now = new Date().toISOString();

  const requested = Array.isArray(body.wrong_question_ids)
    ? body.wrong_question_ids.filter((q): q is string => typeof q === 'string')
    : [];
  let wrongIds: string[] = [];
  if (requested.length > 0) {
    const placeholders = requested.map(() => '?').join(',');
    const qres = await db.execute({
      sql: `SELECT id FROM questions WHERE id IN (${placeholders})`,
      args: [...requested],
    });
    wrongIds = qres.rows.map((r) => r.id as string);
  }

  const statements: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: 'INSERT INTO exam_attempts (id, student_id, series_id, score, total_questions, passed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, user.id, seriesId, score, total_questions, passed, now],
    },
  ];
  wrongIds.forEach((questionId) => {
    statements.push({
      sql: `INSERT INTO student_revision (student_id, question_id, wrong_count, status, created_at, corrected_at)
       VALUES (?, ?, 1, 'to_review', ?, NULL)
       ON CONFLICT (student_id, question_id) DO UPDATE SET
         wrong_count = student_revision.wrong_count + 1,
         status = 'to_review',
         corrected_at = NULL`,
      args: [user.id, questionId, now],
    });
  });
  await db.batch(statements);

  const created = await db.execute({
    sql: `SELECT a.*, s.title AS series_title
     FROM exam_attempts a
     LEFT JOIN series s ON s.id = a.series_id
     WHERE a.id = ?`,
    args: [id],
  });
  return c.json({ data: toAttempt(created.rows[0] as Record<string, unknown>) }, 201);
});
```

- [ ] **Step 2: Register the router in `server/index.ts`**

Add import after the `settingsRoutes` import:

```ts
import { examRoutes } from './routes/exams';
```

Add mount after `app.route('/api/settings', settingsRoutes);`:

```ts
app.route('/api/exams', examRoutes);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual API check (server running; logged-in student token required)**

Login as a student via `POST /api/student-auth/login` (email + access code) into a cookie jar; then:

```bash
curl.exe -s -b <cookiejar> http://localhost:3001/api/exams/official/meta
curl.exe -s -b <cookiejar> http://localhost:3001/api/exams/official
```

Expected: meta returns `{"data":{"pass_score":35,"question_count":40,"timer_duration":20}}`; official returns 20 questions if the bank has <40 (assuming the fresh install has few questions) OR a 409 with a French message. Do not expect 40 unless the bank actually has 40 active questions.

- [ ] **Step 5: Commit**

```bash
git add server/routes/exams.ts server/index.ts
git commit -m "feat: add official exam API router"
```

---

### Task 4: Readiness API router

**Files:**
- Create: `server/routes/readiness.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `db` from `../db`; `requireStudent` from `../middleware`; `readOfficialConfig` from `./exams` (for the official pass target in display — optional). Actually readiness is attempt-based only, so `readOfficialConfig` is NOT needed; drop it.
- Produces router `readinessRoutes` mounted at `/api/readiness`: `GET /` → `{ data: Readiness }` where:
  - `Readiness = { readiness_pct: number; attempts_pass_rate: number; revision_clearance: number; trend: 'up' | 'down' | 'flat'; attempts_count: number; to_review: number; corrected: number }`

- [ ] **Step 1: Create `server/routes/readiness.ts`**

```ts
import { Hono } from 'hono';
import { db } from '../db';
import type { AppEnv } from '../auth';
import { requireStudent } from '../middleware';

export const readinessRoutes = new Hono<AppEnv>();

readinessRoutes.get('/', requireStudent, async (c) => {
  const user = c.get('user');

  const attemptsRes = await db.execute({
    sql: `SELECT passed, created_at FROM exam_attempts
          WHERE student_id = ? ORDER BY created_at DESC LIMIT 10`,
    args: [user.id],
  });
  const attempts = attemptsRes.rows as { passed: unknown; created_at: unknown }[];
  const passedFlags = attempts.map((r) => (Number(r.passed) === 1 ? 1 : 0));

  let attempts_pass_rate = 0;
  if (passedFlags.length > 0) {
    const n = passedFlags.length;
    const totalWeight = (n * (n + 1)) / 2;
    let weighted = 0;
    passedFlags.forEach((p, i) => {
      weighted += p * (n - i);
    });
    attempts_pass_rate = weighted / totalWeight;
  }

  const revisionRes = await db.execute({
    sql: `SELECT status, COUNT(*) AS c FROM student_revision
          WHERE student_id = ? GROUP BY status`,
    args: [user.id],
  });
  const statusCounts = new Map<string, number>();
  for (const r of revisionRes.rows as { status: unknown; c: unknown }[]) {
    statusCounts.set(String(r.status), Number(r.c));
  }
  const toReview = statusCounts.get('to_review') ?? 0;
  const corrected = statusCounts.get('corrected') ?? 0;

  let revision_clearance = 0;
  const revTotal = toReview + corrected;
  if (revTotal > 0) {
    revision_clearance = corrected / revTotal;
  }

  const raw = 0.7 * attempts_pass_rate + 0.3 * revision_clearance;
  const readiness_pct = Math.max(0, Math.min(100, Math.round(raw * 100)));

  let trend: 'up' | 'down' | 'flat' = 'flat';
  if (passedFlags.length >= 4) {
    const recent = passedFlags.slice(0, 3);
    const older = passedFlags.slice(3, 6);
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const d = avg(recent) - avg(older);
    trend = d > 0.001 ? 'up' : d < -0.001 ? 'down' : 'flat';
  }

  return c.json({
    data: {
      readiness_pct,
      attempts_pass_rate,
      revision_clearance,
      trend,
      attempts_count: passedFlags.length,
      to_review: toReview,
      corrected,
    },
  });
});
```

- [ ] **Step 2: Register the router in `server/index.ts`**

Add import after the `examRoutes` import:

```ts
import { readinessRoutes } from './routes/readiness';
```

Add mount after `app.route('/api/exams', examRoutes);`:

```ts
app.route('/api/readiness', readinessRoutes);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual API check**

With a logged-in student cookie jar:

```bash
curl.exe -s -b <cookiejar> http://localhost:3001/api/readiness
```

Expected: `{"data":{"readiness_pct":<0-100>,"attempts_pass_rate":<0-1>,"revision_clearance":<0-1>,"trend":"flat","attempts_count":<n>,"to_review":<n>,"corrected":<n>}}` (zeros on a fresh student).

- [ ] **Step 5: Commit**

```bash
git add server/routes/readiness.ts server/index.ts
git commit -m "feat: add readiness meter API"
```

---

### Task 5: Shared frontend types

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: Task 3's response shapes.
- Produces (used by Tasks 6–8):
  - `type OfficialExamMeta = { pass_score: number; question_count: number; timer_duration: number }`
  - `type OfficialExamStart = OfficialExamMeta & { questions: Question[] }`
  - `type ReadyTrend = 'up' | 'down' | 'flat'`
  - `type Readiness = { readiness_pct: number; attempts_pass_rate: number; revision_clearance: number; trend: ReadyTrend; attempts_count: number; to_review: number; corrected: number }`

- [ ] **Step 1: Append to `src/types/index.ts`**

```ts
export type OfficialExamMeta = {
  pass_score: number;
  question_count: number;
  timer_duration: number;
};

export type OfficialExamStart = OfficialExamMeta & {
  questions: Question[];
};

export type ReadyTrend = 'up' | 'down' | 'flat';

export interface Readiness {
  readiness_pct: number;
  attempts_pass_rate: number;
  revision_clearance: number;
  trend: ReadyTrend;
  attempts_count: number;
  to_review: number;
  corrected: number;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (types are additive; nothing imports them yet).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add official exam and readiness types"
```

---

### Task 6: `ExamScreen` official mode

**Files:**
- Modify: `src/pages/student/ExamScreen.tsx`

**Interfaces:**
- Consumes: Task 5 (`OfficialExamStart`, via `api.get`); existing exam engine.
- Produces: `ExamScreen({ revisionMode = false, officialMode = false })` — when `officialMode`, loads `GET /exams/official`, sets a uniform per-question timer from the response, and submits to `POST /exams/official/complete`. Normal and revision modes unchanged.

- [ ] **Step 1: Update props + load branch**

Change the props type:

```tsx
interface ExamScreenProps {
  revisionMode?: boolean;
  officialMode?: boolean;
}
```

And the function signature:

```tsx
export default function ExamScreen({ revisionMode = false, officialMode = false }: ExamScreenProps) {
```

In the `loadData` effect, add an official branch BEFORE the `if (!seriesId) return;` block (and after the revision branch), importing `OfficialExamStart`:

```tsx
import type { CompleteRevisionResult, OfficialExamStart, Question, RevisionSummary, Series } from '@/types';
```

```tsx
      if (officialMode) {
        const res = await api.get<OfficialExamStart>('/exams/official');
        if (res.error) {
          setError("Impossible de charger l'examen officiel.");
          setPhase('exam');
          return;
        }
        const data = res.data;
        setSeries({
          id: 'official',
          title: 'Examen officiel',
          description: data.question_count + ' questions tirées de toute la banque',
          is_active: true,
          category: 'Officiel',
          pass_score: data.pass_score,
          required_questions: data.question_count,
          created_at: '',
          updated_at: '',
        });
        const qData = data.questions.map((q) => ({
          ...q,
          timer_duration: data.timer_duration as Question['timer_duration'],
        }));
        setQuestions(qData);
        setTimeLeft(data.timer_duration);
        setPhase('exam');
        return;
      }
```

Add `officialMode` to that effect's dependency array — the effect currently ends `// eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [revisionMode, seriesId]);`. KEEP the eslint-disable (the effect also references `location`, `navigate`, and helper closures) and change the deps to:

```tsx
  }, [revisionMode, officialMode, seriesId]);
```

- [ ] **Step 2: Update the submit effect**

In the submit `useEffect` (starts `if (phase !== 'results' || submittedRef.current) return;`), insert the official branch before `if (!series?.id) return;`:

```tsx
    if (officialMode) {
      api.post('/exams/official/complete', {
        score,
        total_questions: questions.length,
        wrong_question_ids: results
          .filter((r) => !r.correct)
          .map((r) => r.question.id),
      });
      return;
    }
```

Add `officialMode` to that effect's dependency array — the effect currently ends `// eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [phase, revisionMode, series?.id, results.length, questions.length]);`. KEEP the eslint-disable (it references `results` and `questions` through closures) and change the deps to:

```tsx
  }, [phase, revisionMode, officialMode, series?.id, results.length, questions.length]);
```

- [ ] **Step 3: Top-bar category badge**

`ExamScreen.tsx` line ~578-581 renders `{series?.category}`. For `officialMode` the `series.category` is `'Officiel'` (set in Step 1), so no change needed — verify it renders.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add src/pages/student/ExamScreen.tsx
git commit -m "feat: add official exam mode to exam screen"
```

---

### Task 7: Route — `/exam/official`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 6 (`ExamScreen` with `officialMode` prop).
- Produces: route `/exam/official` → `StudentRoute` + `<ExamScreen officialMode />`, placed immediately before the existing `/exam/:seriesId` route.

- [ ] **Step 1: Add the route**

In `src/App.tsx`, inside `AppRoutes`, before the `/exam/:seriesId` route, add:

```tsx
<Route
  path="/exam/official"
  element={
    <StudentRoute>
      <ExamScreen officialMode />
    </StudentRoute>
  }
/>
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: route official exam mode"
```

---

### Task 8: Student home — official card + readiness gauge

**Files:**
- Modify: `src/pages/student/SeriesSelection.tsx`

**Interfaces:**
- Consumes: Task 3 endpoints, Task 4 endpoint, Task 5 types, `SIGN_CATEGORIES` unused here; existing `api` + `SiteHeader` + `SeriesWithCount`.
- Produces: `SeriesSelection` additionally fetches `GET /exams/official/meta` (`OfficialExamMeta`) and `GET /readiness` (`Readiness`); renders a distinct official-exam card linking to `/exam/official` and a "Prêt pour l'examen" readiness gauge card above the series grid. Degrades gracefully when either fetch fails or data is absent.

- [ ] **Step 1: Update imports + state**

In `src/pages/student/SeriesSelection.tsx`, extend imports:

```tsx
import type { OfficialExamMeta, Readiness, RevisionSummary, SeriesWithCount } from '@/types';
```

Add state alongside the existing:

```tsx
const [officialMeta, setOfficialMeta] = useState<OfficialExamMeta | null>(null);
const [readiness, setReadiness] = useState<Readiness | null>(null);
```

Update the `useEffect` to fetch all three in parallel:

```tsx
  useEffect(() => {
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
    loadSeries();
    api.get<RevisionSummary>('/revision').then((res) => {
      if (!res.error) setToReviewCount(res.data.to_review.length);
    });
    api.get<OfficialExamMeta>('/exams/official/meta').then((res) => {
      if (!res.error) setOfficialMeta(res.data);
    });
    api.get<Readiness>('/readiness').then((res) => {
      if (!res.error) setReadiness(res.data);
    });
  }, []);
```

- [ ] **Step 2: Render the official card + readiness gauge**

Inside `<main>`, after the header `<div className="text-center mb-10">…</div>` and before the series section, add:

```tsx
        {/* Official exam + readiness */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          {officialMeta && (
            <Link
              to="/exam/official"
              className="lg:col-span-2 group bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-6 text-white shadow-lg hover:shadow-2xl transition-all duration-300 animate-fade-in"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Trophy className="w-7 h-7 text-white" />
                </div>
                <span className="px-3 py-1 bg-white/20 text-white text-xs font-semibold rounded-full">
                  OFFICIEL
                </span>
              </div>
              <h3 className="text-xl font-bold mb-1">Examen officiel</h3>
              <p className="text-white/80 text-sm mb-4">
                {officialMeta.question_count} questions tirées de toute la banque · Score
                minimum {officialMeta.pass_score}/{officialMeta.question_count} · {officialMeta.timer_duration}s / question
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                Commencer la simulation
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          )}

          {readiness && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 bg-success-50 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-success-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Prêt pour l'examen</p>
                  <p className="text-xs text-slate-500">
                    Basé sur tes {readiness.attempts_count > 0 ? 'dernières tentatives' : 'résultats'} et ta révision
                  </p>
                </div>
                {readiness.trend !== 'flat' && (
                  <span
                    className={`ml-auto flex items-center gap-1 text-xs font-semibold ${
                      readiness.trend === 'up' ? 'text-success-600' : 'text-error-600'
                    }`}
                  >
                    {readiness.trend === 'up' ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {readiness.trend === 'up' ? 'En hausse' : 'En baisse'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 mb-3">
                <span className="text-4xl font-extrabold text-slate-900 tabular-nums">
                  {readiness.readiness_pct}%
                </span>
                <div className="flex-1 bg-slate-100 rounded-full h-3.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      readiness.readiness_pct >= 70
                        ? 'bg-success-500'
                        : readiness.readiness_pct >= 40
                        ? 'bg-warning-500'
                        : 'bg-error-500'
                    }`}
                    style={{ width: `${readiness.readiness_pct}%` }}
                  />
                </div>
              </div>
              <p className="text-sm text-slate-500">
                {readiness.readiness_pct >= 70
                  ? 'Prêt — tu as toutes les chances de réussir.'
                  : readiness.readiness_pct >= 40
                  ? 'Bien parti — continue les séries et la révision.'
                  : 'En route — entraîne-toi encore avant l’examen officiel.'}
                {readiness.to_review > 0 && (
                  <span className="mt-1 block text-xs text-warning-600">
                    {readiness.to_review} question{readiness.to_review > 1 ? 's' : ''} à revoir
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
```

Add these icons to the existing lucide import in this file (`Trophy`, `TrendingUp`, `TrendingDown` — verify `ChevronRight` is already imported; it is).

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: both succeed. If `TrendingUp`/`TrendingDown` are not exported by the installed lucide-react version, swap to `ArrowUp`/`ArrowDown`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/student/SeriesSelection.tsx
git commit -m "feat: add official exam card and readiness gauge to student home"
```

---

### Task 9: End-to-end verification

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1–8.

- [ ] **Step 1: Typecheck + lint + build**

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: all pass, no NEW warnings (pre-existing `ExamScreen`/`AdminSigns` warnings acceptable).

- [ ] **Step 2: Manual API E2E (server running)**

1. `GET /api/series` (student or anonymous) → must NOT contain any `title === 'Examen officiel'` row.
2. `GET /api/exams/official/meta` (student) → `{pass_score:35, question_count:40, timer_duration:20}`.
3. `GET /api/exams/official` (student) → 409 with French message if bank < 40 active, else 40 random questions.
4. If you have a bank with ≥ 40 active questions, complete an attempt via `POST /api/exams/official/complete` with a valid score and confirm: 201, `passed` correct vs 35, attempt appears in `GET /api/attempts` with `series_title: "Examen officiel"`, and wrong questions land in `GET /api/revision`. Otherwise, verify the 400 path (bad score) returns the French error.
5. `GET /api/readiness` (same student) → returns 0–100, fields present, trend `'flat'` or directional.

- [ ] **Step 3: UI smoke test**

In the running app: log in as a student → home shows the "Examen officiel" card (gradient, OFFICIEL badge) with 40 / 35 / 20s and the "Prêt pour l'examen" gauge card. Click "Commencer la simulation" → full exam UI with uniform 20s timer per question, top-bar "Officiel" badge; finish a few questions → results screen; attempt recorded in "Mes résultats".

---

## Self-Review Notes

- **Spec coverage:** migration + settings keys (Task 1), series filter (Task 2), exams router meta/draw/complete with 409/400/500 (Task 3), readiness router (Task 4), types (Task 5), ExamScreen officialMode + submit + uniform timer (Task 6), route (Task 7), home card + gauge (Task 8), verification (Task 9). All spec sections mapped.
- **Type consistency:** `OfficialExamMeta`/`OfficialExamStart`/`Readiness`/`ReadyTrend` defined once (Task 5) and consumed consistently; `readOfficialConfig` exported from Task 3 but Task 4 intentionally does NOT import it (readiness is attempt-based only) — noted in Task 4's Interfaces so no stray dependency.
- **Placeholders:** none — every task contains full code blocks or exact edits.
- **Test framework:** no test runner in repo; verification = typecheck/lint/build + manual API + UI smoke per task, matching repo workflow.
- **Returns shapes:** `POST /official/complete` returns `{ data: SerializedExamAttempt }` (201); the client only fires it (fire-and-forget), consistent with the existing `/attempts` POST.