-- Stable optimistic-concurrency token for identity writes.
ALTER TABLE users ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);

CREATE INDEX IF NOT EXISTS users_status_idx ON users(status, id);
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_primary_role ON user_roles(user_id);
