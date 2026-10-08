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
