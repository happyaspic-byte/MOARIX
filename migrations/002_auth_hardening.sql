CREATE TABLE IF NOT EXISTS login_attempts (
  identifier_hash char(64) PRIMARY KEY,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_cleanup_idx
  ON login_attempts (updated_at);
