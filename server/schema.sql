CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(24) NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,24}$'),
  password_salt BYTEA NOT NULL,
  password_hash BYTEA NOT NULL,
  public_key TEXT NOT NULL,
  wrapped_private_key JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contacts (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, contact_id), CHECK(user_id <> contact_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  envelope_sender JSONB NOT NULL,
  envelope_recipient JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS messages_pair_created ON messages(sender_id, recipient_id, created_at);
