ALTER TABLE users ADD COLUMN email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS email_registration_tokens (
  username TEXT NOT NULL,
  email TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_email_registration_tokens_hash ON email_registration_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_registration_tokens_expires ON email_registration_tokens(expires_at);
