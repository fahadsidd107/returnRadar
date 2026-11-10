ALTER TABLE users ADD COLUMN verified_at timestamptz;
ALTER TABLE sessions ADD COLUMN refresh_hash text UNIQUE;
ALTER TABLE sessions ADD COLUMN refresh_expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days';
CREATE TABLE account_tokens (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, purpose text NOT NULL CHECK(purpose IN ('verify','reset')), expires_at timestamptz NOT NULL);
CREATE TABLE mail_queue (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, recipient text NOT NULL, subject text NOT NULL, body text NOT NULL, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz);
CREATE TABLE rate_limits (bucket text PRIMARY KEY, attempts integer NOT NULL, window_at timestamptz NOT NULL);
