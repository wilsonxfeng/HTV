ALTER TABLE sessions ADD COLUMN IF NOT EXISTS body_region text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tracking_mode text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS camera_view text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS target_side text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS analysis_version text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS segmentation_cache_version text;
CREATE TABLE IF NOT EXISTS pose_frames (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL,
  t_ms double precision NOT NULL CHECK (t_ms >= 0),
  landmarks jsonb NOT NULL,
  PRIMARY KEY (session_id, captured_at)
);
CREATE INDEX IF NOT EXISTS pose_frames_session_time ON pose_frames (session_id, t_ms);
CREATE INDEX IF NOT EXISTS sessions_exercise_time ON sessions (patient_id, exercise_id, started_at DESC);
