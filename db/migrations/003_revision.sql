CREATE TABLE IF NOT EXISTS student_revision (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  wrong_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'to_review',
  created_at TEXT NOT NULL,
  corrected_at TEXT,
  PRIMARY KEY (student_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_student_revision_status ON student_revision(student_id, status);