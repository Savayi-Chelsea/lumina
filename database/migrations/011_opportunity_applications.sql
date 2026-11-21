-- Apply through Lumina: verified alumni can apply to a community opportunity
-- with an optional short note. The application shares the applicant's name,
-- email and Lumina profile with the administrators who manage the listing.
-- Additive only: one new table; no existing rows change.
-- Apply with: .venv/bin/python scripts/apply_migration.py 011 --apply
CREATE TABLE IF NOT EXISTS public.opportunity_applications (
    opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    note VARCHAR(1000) CHECK (note IS NULL OR length(btrim(note)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (opportunity_id, user_id)
);
CREATE INDEX IF NOT EXISTS opportunity_applications_user_idx ON public.opportunity_applications (user_id);
