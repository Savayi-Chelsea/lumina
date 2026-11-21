-- Password reset tokens. Additive only: creates one new table; no existing rows change.
-- Apply with: .venv/Scripts/python.exe scripts/apply_migration.py 005 --apply

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    -- SHA-256 of a 32-byte random token. The raw token exists only in the emailed link.
    token_hash BYTEA PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON public.password_reset_tokens (user_id);
