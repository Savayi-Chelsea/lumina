-- Version 001: Google identities on the existing Lumina users table.
-- Run transactionally with scripts/migrate_google_auth.py against local development only.
-- Existing values, roles, statuses, profiles and password hashes are preserved.
ALTER TABLE public.users ADD COLUMN google_subject TEXT UNIQUE;
ALTER TABLE public.users ADD COLUMN alumni_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;
