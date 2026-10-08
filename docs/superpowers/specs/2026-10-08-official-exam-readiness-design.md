# Official Exam Mode + Readiness Meter Design

Date: 2026-10-08

## Problem

Students can practice per-series exams but there is no way to simulate the
real DTC exam, which draws questions from the whole bank with fixed rules.
Without a readiness signal, students (and the school) can't tell when someone
is actually ready to pass.

## Goals

- **Official exam mode**: a true simulation — N random questions drawn from
  ALL active questions in the bank, fixed pass score, uniform per-question
  timer. Reuses the existing exam engine.
- **Readiness meter**: a per-student "Prêt pour l'examen" gauge blending
  weighted recent attempt pass-rate with revision clearance, plus a trend.

## Non-goals

- Question-level analytics for the school (own aggregation schema) — deferred.
- Admin UI to tune official-exam settings keys — values are storable in the
  `settings` table and readable via the API; tuning UI later.
- Per-question answer breakdown UI in official mode beyond existing results.

## Approach

Seeded official series row + settings keys, a dedicated `/api/exams` router
(draw + complete), a `/api/readiness` endpoint, a special card + gauge on
the student home, and an `officialMode` variant of `ExamScreen`.

## Data model (migration `006_official_exam.sql`)

- `ALTER TABLE series ADD COLUMN is_official INTEGER NOT NULL DEFAULT 0;`
  (idempotent via existing `alreadyApplied` check in `server/db.ts`).
- Index on `series(is_official)`.
- Seed one hidden series row: `title='Examen officiel'`, `category='B'`,
  `is_official=1`, `is_active=1`, `pass_score=35`,
  `required_questions=40` (insert only if no `is_official=1` row exists).
- Seed settings keys (idempotent upsert):
  - `official_question_count = '40'`
  - `official_pass_score = '35'`
  - `official_timer_duration = '20'`

The official series row exists so `exam_attempts.series_id` FK stays intact;
attempts against it get `series_title = "Examen officiel"` via the existing
LEFT JOIN. The row is excluded from every normal series listing.

## Backend

### `GET /api/series` — exclude official series

Both the student and admin listing queries gain `AND s.is_official = 0` so the
seeded official series never appears as a normal series card or in admin
Series Management. (`GET /:id` and `GET /:id/questions` unchanged; the official
flow has its own endpoints.)

### New router `server/routes/exams.ts` (mounted at `/api/exams`)

All endpoints `requireStudent`.

- `GET /official/meta` → `{ data: { pass_score, question_count, timer_duration } }`
  from the settings keys (falls back to 35/40/20). Used by the student home
  card so the draw isn't fired for the info alone.
- `GET /official` → draws `question_count` random ACTIVE questions from the
  whole bank. "Active" is defined by the question's owning series:
  `SELECT q.* FROM questions q JOIN series s ON s.id = q.series_id
   WHERE s.is_active = 1 AND s.is_official = 0
   ORDER BY RANDOM() LIMIT ?`
  The official series row itself contributes no questions (filtered via
  `is_official = 0`); questions have no own is_active flag. Returns
  `{ data: { pass_score, question_count, timer_duration, questions: Question[] } }`.
  Returns 409 with a French-clear error if the bank has fewer active questions
  than `official_question_count`.
- `POST /official/complete` → body
  `{ score, total_questions, wrong_question_ids }`; validates score bounds;
  looks up the official series id (`SELECT id FROM series WHERE is_official =
  1 LIMIT 1`); computes `passed = score >= official_pass_score`; inserts one
  `exam_attempts` row (series_id = official row id) and upserts
  `student_revision` rows for wrong ids — same revisions logic as the existing
  `POST /api/attempts`. Returns the serialized attempt (201).

### New router `server/routes/readiness.ts` (mounted at `/api/readiness`)

`GET /` `requireStudent` → computes and returns:

- `attempts_pass_rate` (0–1): last 10 attempts, newest first; each passed
  flag weighted by `(n - i)` so more recent attempts weigh more; weighted mean.
- `revision_clearance` (0–1): `corrected / (corrected + to_review)` from
  `student_revision` counts; 0 if no rows.
- `readiness_pct` (0–100): `round(100 * (0.7 * attempts_pass_rate + 0.3 *
  revision_clearance))`, clamped.
- `trend`: `'up' | 'down' | 'flat'` — compare mean passed of the most recent
  3 attempts vs the 3 before that.
- `attempts_count`, `to_review`, `corrected` for display.

`student_revision.status` values are `to_review` / `corrected` (see migration
003 and `server/routes/revision.ts`).

## Frontend

### Types (`src/types/index.ts`)

- `OfficialExamMeta = { pass_score: number; question_count: number; timer_duration: number }`
- `OfficialExamStart = OfficialExamMeta & { questions: Question[] }`
- `Readiness = { readiness_pct: number; attempts_pass_rate: number;
  revision_clearance: number; trend: 'up' | 'down' | 'flat'; attempts_count:
  number; to_review: number; corrected: number }`

### `src/pages/student/SeriesSelection.tsx`

Fetch, alongside `/series` and `/revision`:
- `GET /exams/official/meta` for the official card.
- `GET /readiness` for the gauge.

Render a distinct **"Examen officiel"** card (accent styling, `question_count`
questions · `pass_score`/`question_count` to pass) linking to `/exam/official`,
and a **"Prêt pour l'examen"** gauge card (readiness %, trend arrow, label:
`< 40` "En route", `< 70` "Bien parti", else "Prêt"; plus to-review count).
Empty/absent data degrades gracefully (no card / "—").

### `src/pages/student/ExamScreen.tsx` — `officialMode`

Add optional prop `officialMode = false`. When true:

- Load branch `GET /exams/official`; build the `series` state object from the
  response (`title: 'Examen officiel'`, `category: 'Officiel'`,
  `pass_score`, `required_questions`); map returned questions to set a
  uniform `timer_duration` = official `timer_duration`
  (cast `as Question['timer_duration']`; normal exam path unchanged).
- Submit branch: `POST /exams/official/complete` with
  `{ score, total_questions, wrong_question_ids }` instead of `/attempts`.
- The top-bar category badge shows "Officiel".

### `src/App.tsx`

Add route `/exam/official` →
`<StudentRoute><ExamScreen officialMode /></StudentRoute>`, placed before the
existing `/exam/:seriesId` route. (React Router ranks static over dynamic,
so `/exam/official` matches the static route regardless.)

## Error handling

- 409 when bank has fewer active questions than required (clear French message).
- Official meta/start/complete and readiness all return 401 via `requireStudent`
  when unauthenticated.
- Score validation and total_questions bounds reuse the existing attempt POST
  validation style.

## Verification

- Typecheck + lint + build (no test framework in repo).
- Live API: meta returns 40/35/20; start draws 40 random active questions and
  returns 409 if insufficient; complete records an attempt + revision rows and
  computes `passed` vs 35; `/series` no longer lists the official row;
  readiness returns sane 0–100 with trend.
- UI: official card + gauge on home; `/exam/official` runs the full engine
  with uniform timer and posts to the official endpoint.

## Decisions / rulings

- Official series row is hidden from all normal listings; the official flow is
  entered only via the special card → `/exam/official`.
- Official attempts are stored against the seeded official series id so no FK
  migration is required and history display "just works".
- Readiness weights attempts 70% / revision 30% (matches approved selection);
  blend and thresholds are constants in one place so they're easy to tune.
- Client casts official `timer_duration` to the existing `10|20|30` union so
  the whole engine (timer, progress ring) reuses unchanged logic — a
  documented, contained cast rather than threading a separate official-timer
  state through navigation callbacks.