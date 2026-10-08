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
