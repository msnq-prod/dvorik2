DELETE FROM sessions WHERE token_hash IS NULL OR token_hash = '';

CREATE TRIGGER sessions_token_hash_required_insert
BEFORE INSERT ON sessions
WHEN NEW.token_hash IS NULL OR NEW.token_hash = ''
BEGIN SELECT RAISE(ABORT, 'session token hash required'); END;

CREATE TRIGGER sessions_token_hash_required_update
BEFORE UPDATE OF token_hash ON sessions
WHEN NEW.token_hash IS NULL OR NEW.token_hash = ''
BEGIN SELECT RAISE(ABORT, 'session token hash required'); END;

