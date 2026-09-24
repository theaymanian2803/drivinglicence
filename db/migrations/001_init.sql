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