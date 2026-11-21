-- Engagement, privacy and accountability.
-- New tables, two defaulted columns on profiles, and a wider list of
-- notification kinds. No existing row is changed.

-- 1. Match quality: what a member was shown, which result they requested, and
--    how good the match turned out to be. No search text is stored.
CREATE TABLE IF NOT EXISTS public.mentor_search_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    searcher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    source VARCHAR(20) NOT NULL CHECK (source IN ('search', 'recommendation')),
    result_count SMALLINT NOT NULL CHECK (result_count BETWEEN 0 AND 50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS mentor_search_events_searcher_idx ON public.mentor_search_events (searcher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mentor_search_events_created_idx ON public.mentor_search_events (created_at);

CREATE TABLE IF NOT EXISTS public.mentor_search_results (
    event_id UUID NOT NULL REFERENCES public.mentor_search_events(id) ON DELETE CASCADE,
    rank SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 50),
    mentor_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    score REAL NOT NULL CHECK (score BETWEEN -1 AND 1),
    PRIMARY KEY (event_id, rank)
);
CREATE INDEX IF NOT EXISTS mentor_search_results_mentor_idx ON public.mentor_search_results (mentor_profile_id);

CREATE TABLE IF NOT EXISTS public.mentorship_request_origins (
    request_id UUID PRIMARY KEY REFERENCES public.mentorship_requests(id) ON DELETE CASCADE,
    event_id UUID REFERENCES public.mentor_search_events(id) ON DELETE SET NULL,
    rank SMALLINT CHECK (rank BETWEEN 1 AND 50)
);

CREATE TABLE IF NOT EXISTS public.mentorship_feedback (
    mentorship_id UUID NOT NULL REFERENCES public.mentorship_requests(id) ON DELETE CASCADE,
    rater_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    match_rating SMALLINT NOT NULL CHECK (match_rating BETWEEN 1 AND 5),
    would_recommend BOOLEAN NOT NULL,
    comment VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mentorship_id, rater_id)
);

-- 3. Privacy controls (Kenya Data Protection Act 2019): directory listing,
--    profile visibility, and a record of every consent choice.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_in_directory BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(20) NOT NULL DEFAULT 'members'
    CHECK (profile_visibility IN ('members', 'connections'));

CREATE TABLE IF NOT EXISTS public.privacy_consents (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    kind VARCHAR(40) NOT NULL CHECK (kind IN ('mentor_matching', 'directory_listing', 'profile_visibility', 'weekly_digest', 'session_emails')),
    value VARCHAR(20) NOT NULL,
    policy_version VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS privacy_consents_user_idx ON public.privacy_consents (user_id, created_at DESC);

-- 5. Session scheduling: mentors publish time slots, mentees book them.
CREATE TABLE IF NOT EXISTS public.mentor_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('video', 'phone', 'in_person')),
    details VARCHAR(300),  -- meeting link or place, shown only to the booked mentee
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'booked', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (ends_at > starts_at AND ends_at - starts_at <= INTERVAL '3 hours')
);
CREATE INDEX IF NOT EXISTS mentor_availability_mentor_idx ON public.mentor_availability (mentor_id, starts_at);

CREATE TABLE IF NOT EXISTS public.mentorship_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id UUID NOT NULL REFERENCES public.mentor_availability(id) ON DELETE CASCADE,
    mentorship_id UUID NOT NULL REFERENCES public.mentorship_requests(id) ON DELETE CASCADE,
    agenda VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
    cancelled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reminder_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS mentorship_sessions_slot_idx ON public.mentorship_sessions (slot_id) WHERE status = 'booked';
CREATE INDEX IF NOT EXISTS mentorship_sessions_mentorship_idx ON public.mentorship_sessions (mentorship_id);

-- 6. Append-only audit log of administrative and account actions.
CREATE TABLE IF NOT EXISTS public.audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action VARCHAR(60) NOT NULL,
    target_type VARCHAR(40) NOT NULL,
    target_id VARCHAR(80),
    details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(details) <= 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log (actor_id, created_at DESC);

-- Entries can never be edited or removed; the only permitted change is the
-- actor becoming NULL when that account is deleted.
CREATE OR REPLACE FUNCTION public.audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
       AND (NEW.id, NEW.action, NEW.target_type, NEW.target_id, NEW.details, NEW.created_at)
           IS NOT DISTINCT FROM (OLD.id, OLD.action, OLD.target_type, OLD.target_id, OLD.details, OLD.created_at) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'audit_log is append-only';
END $$;
DROP TRIGGER IF EXISTS audit_log_append_only ON public.audit_log;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.audit_log_append_only();

-- 8. Email: per-member preferences (weekly digest is opt-in) and a delivery
--    ledger so no email is ever sent twice.
CREATE TABLE IF NOT EXISTS public.email_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    weekly_digest BOOLEAN NOT NULL DEFAULT FALSE,
    session_emails BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.email_deliveries (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    kind VARCHAR(30) NOT NULL CHECK (kind IN ('weekly_digest', 'session_booked', 'session_cancelled', 'session_reminder')),
    reference VARCHAR(80) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, kind, reference)
);

-- In-app notifications for sessions and recaps. The list only grows, so every
-- existing notification stays valid.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
    'connection_request', 'connection_accepted', 'message', 'mentorship_request', 'mentorship_accepted', 'mentorship_declined',
    'session_booked', 'session_cancelled', 'recap_to_approve', 'recap_published'));
