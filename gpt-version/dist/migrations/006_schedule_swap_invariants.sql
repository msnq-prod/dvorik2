ALTER TABLE shift_swap_requests ADD COLUMN source_shift_version INTEGER NOT NULL DEFAULT 0 CHECK (source_shift_version >= 0);

-- A legacy pending request has no trustworthy captured shift revision. It is
-- safer to expire it than to accept a callback against an unknown preview.
UPDATE shift_swap_requests
SET status = 'expired',
    resolved_at = COALESCE(resolved_at, updated_at, created_at),
    version = version + 1
WHERE status = 'pending';

DROP INDEX shift_swap_pending_unique;

CREATE UNIQUE INDEX shift_swap_pending_target_unique
  ON shift_swap_requests(from_shift_id, from_user_id, to_user_id)
  WHERE status = 'pending';
