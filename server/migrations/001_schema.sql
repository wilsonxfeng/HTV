CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY,
  display_name text NOT NULL,
  demonstration boolean NOT NULL DEFAULT false,
  schedule jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES patients(id),
  exercise_id text NOT NULL,
  hand text NOT NULL CHECK (hand IN ('Left', 'Right')),
  started_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete')),
  video_key text,
  upload_key text,
  video_mime_type text NOT NULL,
  duration_ms double precision NOT NULL,
  metadata jsonb NOT NULL,
  calibration jsonb,
  completed boolean NOT NULL DEFAULT false,
  completion_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_patient_time ON sessions (patient_id, started_at DESC);
CREATE TABLE IF NOT EXISTS hand_frames (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL,
  t_ms double precision NOT NULL CHECK (t_ms >= 0),
  landmarks jsonb NOT NULL,
  PRIMARY KEY (session_id, captured_at)
);
CREATE INDEX IF NOT EXISTS hand_frames_session_time ON hand_frames (session_id, t_ms);
CREATE TABLE IF NOT EXISTS repetitions (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  rep_index integer NOT NULL,
  start_ms double precision NOT NULL,
  peak_ms double precision NOT NULL,
  end_ms double precision NOT NULL,
  metrics jsonb NOT NULL,
  PRIMARY KEY (session_id, rep_index),
  CHECK (start_ms < peak_ms AND peak_ms < end_ms)
);
CREATE TABLE IF NOT EXISTS session_reports (
  session_id uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  metrics jsonb NOT NULL,
  ai_summary jsonb,
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);
UPDATE sessions SET metadata=jsonb_set(metadata,'{videoKind}',CASE WHEN calibration->>'source'='demo' THEN '"synthetic"'::jsonb ELSE '"camera"'::jsonb END) WHERE NOT metadata ? 'videoKind';
