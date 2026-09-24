/*
# Create Series and Questions tables for Driver's License Exam Platform

## Overview
Creates the core data model for a Category B driver's license exam platform (Moroccan Code de la Route style).
The admin dashboard requires authentication (Supabase email/password) to manage content.
The student interface is public — anyone can view active series and take exams.

## New Tables

### 1. `series`
- `id` (uuid, primary key, auto-generated)
- `title` (text, not null) — e.g. "Series 1"
- `description` (text, nullable) — optional description of the series
- `is_active` (boolean, default true) — whether students can see this series
- `category` (text, default 'B') — license category
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 2. `questions`
- `id` (uuid, primary key, auto-generated)
- `series_id` (uuid, foreign key → series.id ON DELETE CASCADE)
- `image_url` (text, nullable) — URL to the scenario image
- `audio_url` (text, nullable) — URL to the question audio
- `question_text` (text, not null) — question text (supports Arabic and French)
- `option_1` (text, not null) — first answer option
- `option_2` (text, not null) — second answer option
- `option_3` (text, nullable) — third answer option
- `option_4` (text, nullable) — fourth answer option
- `correct_answers` (integer[], default '{}') — array of correct option indices (1-based), e.g. [1] or [1,3]
- `timer_duration` (integer, default 20) — seconds for this question; allowed values: 10, 20, 30
- `category` (text, default 'B') — license category for this question
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

## Indexes
- `questions.series_id` — foreign key lookups
- `series.is_active` — filtering active series for students

## Security (RLS)
- `series`: public read (anon + authenticated) so students can browse; only authenticated admins can write.
- `questions`: public read (anon + authenticated) so students can take exams; only authenticated admins can write.
- No user_id column — this is admin-managed content, not per-user data. Authenticated users (admins) have full CRUD; anon users have read-only access.

## Seed Data
- Inserts "Series 1" as default active series if it doesn't exist.

## Notes
1. The admin dashboard uses Supabase email/password auth. Any authenticated user is considered an admin (the app protects the /admin route client-side).
2. Students do not need to sign in — they browse active series and take exams using the anon key.
3. `correct_answers` uses 1-based indices to match the UI button numbering (1, 2, 3, 4).
4. `timer_duration` is constrained to 10, 20, or 30 seconds via CHECK constraint.
*/

-- ===== SERIES TABLE =====
CREATE TABLE IF NOT EXISTS series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  category text NOT NULL DEFAULT 'B',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE series ENABLE ROW LEVEL SECURITY;

-- Public read for students (anon + authenticated)
DROP POLICY IF EXISTS "public_select_series" ON series;
CREATE POLICY "public_select_series"
  ON series FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin write (authenticated only)
DROP POLICY IF EXISTS "admin_insert_series" ON series;
CREATE POLICY "admin_insert_series"
  ON series FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_series" ON series;
CREATE POLICY "admin_update_series"
  ON series FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_series" ON series;
CREATE POLICY "admin_delete_series"
  ON series FOR DELETE
  TO authenticated
  USING (true);

-- ===== QUESTIONS TABLE =====
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  image_url text,
  audio_url text,
  question_text text NOT NULL,
  option_1 text NOT NULL,
  option_2 text NOT NULL,
  option_3 text,
  option_4 text,
  correct_answers integer[] NOT NULL DEFAULT '{}',
  timer_duration integer NOT NULL DEFAULT 20 CHECK (timer_duration IN (10, 20, 30)),
  category text NOT NULL DEFAULT 'B',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- Public read for students (anon + authenticated)
DROP POLICY IF EXISTS "public_select_questions" ON questions;
CREATE POLICY "public_select_questions"
  ON questions FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin write (authenticated only)
DROP POLICY IF EXISTS "admin_insert_questions" ON questions;
CREATE POLICY "admin_insert_questions"
  ON questions FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_questions" ON questions;
CREATE POLICY "admin_update_questions"
  ON questions FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_questions" ON questions;
CREATE POLICY "admin_delete_questions"
  ON questions FOR DELETE
  TO authenticated
  USING (true);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_questions_series_id ON questions(series_id);
CREATE INDEX IF NOT EXISTS idx_series_is_active ON series(is_active);

-- ===== SEED: Series 1 =====
INSERT INTO series (title, description, is_active, category)
SELECT 'Series 1', 'Première série de questions du code de la route - Catégorie B', true, 'B'
WHERE NOT EXISTS (SELECT 1 FROM series WHERE title = 'Series 1');
