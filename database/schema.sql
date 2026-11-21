-- =========================================================
-- LUMINA DATABASE SCHEMA
-- Initial Sprint I schema
-- =========================================================

-- ---------------------------------------------------------
-- 1. USERS
-- Authentication and account-level information
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT,

    -- Google account control is separate from independently verified alumni status.
    google_subject TEXT UNIQUE,
    google_image_url TEXT,
    alumni_verified BOOLEAN NOT NULL DEFAULT FALSE,

    role VARCHAR(30) NOT NULL DEFAULT 'alumni'
        CHECK (role IN ('alumni', 'admin')),

    account_status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (account_status IN ('active', 'suspended', 'pending')),

    email_verified BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ---------------------------------------------------------
-- 2. PROFILES
-- Professional profile for former Kenya Airways staff
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID UNIQUE NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    full_name VARCHAR(150) NOT NULL,

    headline VARCHAR(200),

    biography TEXT,

    -- Former Kenya Airways information
    former_kq_role VARCHAR(150),
    former_kq_department VARCHAR(150),
    kq_start_year INTEGER,
    kq_end_year INTEGER,

    -- Current professional information
    current_job_title VARCHAR(150),
    current_organization VARCHAR(200),
    industry VARCHAR(150),

    location VARCHAR(150),

    profile_completed BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (
        kq_start_year IS NULL
        OR kq_end_year IS NULL
        OR kq_end_year >= kq_start_year
    )
);


-- ---------------------------------------------------------
-- 3. WORK EXPERIENCE
-- Allows an alumnus to have multiple professional roles
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_experience (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_id UUID NOT NULL
        REFERENCES profiles(id)
        ON DELETE CASCADE,

    organization VARCHAR(200) NOT NULL,
    job_title VARCHAR(150) NOT NULL,

    start_date DATE,
    end_date DATE,

    is_current BOOLEAN NOT NULL DEFAULT FALSE,

    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (
        end_date IS NULL
        OR start_date IS NULL
        OR end_date >= start_date
    )
);


-- ---------------------------------------------------------
-- 4. SKILLS
-- Master list of professional skills
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) UNIQUE NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ---------------------------------------------------------
-- 5. PROFILE SKILLS
-- Many-to-many relationship between profiles and skills
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS profile_skills (
    profile_id UUID NOT NULL
        REFERENCES profiles(id)
        ON DELETE CASCADE,

    skill_id UUID NOT NULL
        REFERENCES skills(id)
        ON DELETE CASCADE,

    PRIMARY KEY (profile_id, skill_id)
);


-- ---------------------------------------------------------
-- 6. MENTORSHIP PREFERENCES
-- Controls whether a former staff member participates
-- in mentorship matching
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS mentorship_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_id UUID UNIQUE NOT NULL
        REFERENCES profiles(id)
        ON DELETE CASCADE,

    available_for_mentorship BOOLEAN NOT NULL DEFAULT FALSE,

    consent_to_matching BOOLEAN NOT NULL DEFAULT FALSE,

    mentorship_topics TEXT,

    maximum_mentees INTEGER DEFAULT 1
        CHECK (maximum_mentees >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ---------------------------------------------------------
-- 7. PROFILE EMBEDDINGS
-- Vector representation used for semantic mentor matching
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS profile_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_id UUID UNIQUE NOT NULL
        REFERENCES profiles(id)
        ON DELETE CASCADE,

    embedding VECTOR(768) NOT NULL,

    model_name VARCHAR(150) NOT NULL,

    source_hash VARCHAR(128) NOT NULL,

    indexed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ---------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_profiles_department
    ON profiles(former_kq_department);

CREATE INDEX IF NOT EXISTS idx_profiles_industry
    ON profiles(industry);

CREATE INDEX IF NOT EXISTS idx_work_experience_profile
    ON work_experience(profile_id);

CREATE INDEX IF NOT EXISTS idx_profile_skills_skill
    ON profile_skills(skill_id);

CREATE INDEX IF NOT EXISTS idx_mentorship_available
    ON mentorship_preferences(available_for_mentorship);

CREATE INDEX IF NOT EXISTS idx_mentorship_consent
    ON mentorship_preferences(consent_to_matching);


-- Prototype fixtures only; no existing users or profiles are modified.
-- Run within a transaction using scripts/migrate_alumni_registry.py.
CREATE TABLE IF NOT EXISTS public.alumni_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    synthetic_staff_number VARCHAR(40) NOT NULL UNIQUE
        CHECK (synthetic_staff_number ~ '^SYN-ALUM-[0-9]{3,}$'),
    surname VARCHAR(150) NOT NULL CHECK (length(btrim(surname)) > 0),
    former_kq_department VARCHAR(150) NOT NULL
        CHECK (length(btrim(former_kq_department)) > 0),
    kq_start_year INTEGER NOT NULL CHECK (kq_start_year >= 1977),
    kq_end_year INTEGER NOT NULL CHECK (kq_end_year >= kq_start_year),
    claimed_by_user_id UUID UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
    claimed_at TIMESTAMPTZ,
    CHECK (
        (claimed_by_user_id IS NULL AND claimed_at IS NULL)
        OR (claimed_by_user_id IS NOT NULL AND claimed_at IS NOT NULL)
    )
);
COMMENT ON TABLE public.alumni_registry IS
    'Prototype fixtures only. Contains fictional records, not an authorized Kenya Airways employee registry.';

CREATE TABLE IF NOT EXISTS public.verification_assistance_requests (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
    resolution_outcome VARCHAR(30) CHECK (
        resolution_outcome IS NULL
        OR resolution_outcome IN ('verified', 'closed_unresolved')
    ),
    CHECK (
        (resolved_at IS NULL AND resolved_by_user_id IS NULL AND resolution_outcome IS NULL)
        OR
        (resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL AND resolution_outcome IS NOT NULL)
    )
);
COMMENT ON TABLE public.verification_assistance_requests IS
    'Explicit requests for administrator assistance; ordinary signup and failed matching do not automatically create requests.';

-- ---------------------------------------------------------
-- Events, registrations and opportunities (migration 004)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL CHECK (length(btrim(title)) > 0),
    summary VARCHAR(300) NOT NULL CHECK (length(btrim(summary)) > 0),
    description TEXT NOT NULL CHECK (length(description) <= 5000),
    category VARCHAR(40) NOT NULL
        CHECK (category IN ('Reunion', 'Career conversation', 'Mentorship circle', 'Workshop', 'Networking', 'Community service')),
    format VARCHAR(20) NOT NULL CHECK (format IN ('in_person', 'online', 'hybrid')),
    location VARCHAR(200) NOT NULL CHECK (length(btrim(location)) > 0),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    capacity INTEGER CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 5000),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    -- Fictional demonstration rows are labelled in the interface.
    synthetic BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS events_published_start_idx ON public.events (starts_at) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS public.event_registrations (
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS event_registrations_user_idx ON public.event_registrations (user_id);

CREATE TABLE IF NOT EXISTS public.opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL CHECK (length(btrim(title)) > 0),
    organization VARCHAR(200) NOT NULL CHECK (length(btrim(organization)) > 0),
    opportunity_type VARCHAR(20) NOT NULL
        CHECK (opportunity_type IN ('Job', 'Contract', 'Advisory', 'Volunteer', 'Internship')),
    work_mode VARCHAR(20) NOT NULL CHECK (work_mode IN ('on_site', 'remote', 'hybrid')),
    location VARCHAR(150) NOT NULL CHECK (length(btrim(location)) > 0),
    industry VARCHAR(150),
    summary VARCHAR(300) NOT NULL CHECK (length(btrim(summary)) > 0),
    description TEXT NOT NULL CHECK (length(description) <= 5000),
    -- Plain-text instructions; no external links are stored or rendered.
    how_to_apply VARCHAR(1000) NOT NULL CHECK (length(btrim(how_to_apply)) > 0),
    closes_on DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    synthetic BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS opportunities_published_idx ON public.opportunities (created_at DESC) WHERE status = 'published';

-- ---------------------------------------------------------
-- Password reset tokens (migration 005)
-- ---------------------------------------------------------

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

-- ---------------------------------------------------------
-- Social profiles, messaging, mentorship requests, notifications, outbox (migration 006)
-- ---------------------------------------------------------

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS open_to_opportunities BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS banner_theme VARCHAR(20) NOT NULL DEFAULT 'horizon'
        CHECK (banner_theme IN ('horizon', 'savanna', 'coast', 'night', 'dawn'));

-- Uploaded profile photos, resized client-side and validated server-side.
CREATE TABLE IF NOT EXISTS public.profile_photos (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    data BYTEA NOT NULL CHECK (octet_length(data) BETWEEN 100 AND 524288),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMPTZ,
    CHECK (requester_id <> addressee_id)
);
-- One relationship per pair, whichever side asked first.
CREATE UNIQUE INDEX IF NOT EXISTS connections_pair_idx ON public.connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS connections_addressee_idx ON public.connections (addressee_id, status);

CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user_b UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMPTZ,
    CHECK (user_a < user_b)
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_pair_idx ON public.conversations (user_a, user_b);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON public.messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.mentorship_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    mentor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    goal VARCHAR(200) NOT NULL CHECK (length(btrim(goal)) > 0),
    message TEXT NOT NULL CHECK (length(btrim(message)) BETWEEN 1 AND 1000),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMPTZ,
    CHECK (mentee_id <> mentor_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mentorship_requests_open_idx ON public.mentorship_requests (mentee_id, mentor_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS mentorship_requests_mentor_idx ON public.mentorship_requests (mentor_id, status);

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    kind VARCHAR(40) NOT NULL CHECK (kind IN ('connection_request', 'connection_accepted', 'message', 'mentorship_request', 'mentorship_accepted', 'mentorship_declined')),
    link VARCHAR(300) NOT NULL CHECK (link LIKE '/%'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);

-- Transactional outbox: written with each profile change, relayed to Kafka topic
-- lumina.profile-changes, consumed by the matching service to re-embed the profile.
CREATE TABLE IF NOT EXISTS public.profile_change_outbox (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason VARCHAR(40) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS profile_change_outbox_pending_idx ON public.profile_change_outbox (id) WHERE published_at IS NULL;

-- Session recaps: short, co-signed posts about mentoring sessions that happened.
-- Either person in an accepted mentorship drafts a recap; it is published only
-- after the other person approves it. Admins can hide a published recap.
-- Additive only: no existing table or row changes.

CREATE TABLE IF NOT EXISTS public.session_recaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorship_id UUID NOT NULL REFERENCES public.mentorship_requests(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    topic VARCHAR(120) NOT NULL CHECK (length(btrim(topic)) > 0),
    session_date DATE NOT NULL,
    takeaways TEXT NOT NULL CHECK (length(btrim(takeaways)) BETWEEN 20 AND 1500),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'declined', 'withdrawn')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMPTZ,
    hidden_at TIMESTAMPTZ,
    hidden_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    CHECK (author_id <> partner_id)
);
-- One recap awaiting approval per mentorship at a time.
CREATE UNIQUE INDEX IF NOT EXISTS session_recaps_pending_idx ON public.session_recaps (mentorship_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS session_recaps_feed_idx ON public.session_recaps (decided_at DESC) WHERE status = 'published' AND hidden_at IS NULL;
CREATE INDEX IF NOT EXISTS session_recaps_partner_idx ON public.session_recaps (partner_id, status);
CREATE INDEX IF NOT EXISTS session_recaps_author_idx ON public.session_recaps (author_id, status);

CREATE TABLE IF NOT EXISTS public.recap_reactions (
    recap_id UUID NOT NULL REFERENCES public.session_recaps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (recap_id, user_id)
);
CREATE INDEX IF NOT EXISTS recap_reactions_user_idx ON public.recap_reactions (user_id);

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

-- ---------------------------------------------------------------------------
-- Migration 009: Kenya job feed (see database/migrations/009_job_feed.sql)
-- ---------------------------------------------------------------------------

-- One row per listing. Provider HTML is never stored: text is plain and bounded,
-- and links must be https. Listings are removed once expired or no longer
-- returned by the provider (Himalayas API terms require removing expired jobs).
CREATE TABLE IF NOT EXISTS public.external_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(20) NOT NULL CHECK (source IN ('himalayas', 'jsearch')),
    source_job_id VARCHAR(400) NOT NULL CHECK (length(btrim(source_job_id)) > 0),
    title VARCHAR(300) NOT NULL CHECK (length(btrim(title)) > 0),
    company VARCHAR(200) NOT NULL CHECK (length(btrim(company)) > 0),
    company_logo_url VARCHAR(1000) CHECK (company_logo_url IS NULL OR company_logo_url ~ '^https://'),
    location VARCHAR(200) NOT NULL CHECK (length(btrim(location)) > 0),
    work_mode VARCHAR(20) NOT NULL CHECK (work_mode IN ('on_site', 'remote', 'hybrid')),
    employment_type VARCHAR(40),
    seniority VARCHAR(80),
    excerpt VARCHAR(600) NOT NULL DEFAULT '',
    salary_min NUMERIC(14, 2) CHECK (salary_min IS NULL OR salary_min >= 0),
    salary_max NUMERIC(14, 2) CHECK (salary_max IS NULL OR salary_max >= 0),
    salary_currency VARCHAR(10),
    salary_period VARCHAR(20),
    -- Lumina career topics (feed searches) that returned this listing.
    topics TEXT[] NOT NULL DEFAULT '{}',
    apply_url VARCHAR(2000) NOT NULL CHECK (apply_url ~ '^https://'),
    -- Attribution: the provider's page for this listing and who published it.
    source_url VARCHAR(2000) NOT NULL CHECK (source_url ~ '^https://'),
    publisher VARCHAR(120) NOT NULL,
    posted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, source_job_id)
);
CREATE INDEX IF NOT EXISTS external_jobs_posted_idx ON public.external_jobs (posted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS external_jobs_topics_idx ON public.external_jobs USING GIN (topics);

-- One row per refresh attempt per provider: drives the daily schedule, the
-- admin health check and the evaluation. Errors are recorded as a short code only.
CREATE TABLE IF NOT EXISTS public.job_feed_runs (
    id BIGSERIAL PRIMARY KEY,
    source VARCHAR(20) NOT NULL CHECK (source IN ('himalayas', 'jsearch')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
    requests INTEGER NOT NULL DEFAULT 0 CHECK (requests >= 0),
    jobs_seen INTEGER NOT NULL DEFAULT 0 CHECK (jobs_seen >= 0),
    jobs_added INTEGER NOT NULL DEFAULT 0 CHECK (jobs_added >= 0),
    jobs_removed INTEGER NOT NULL DEFAULT 0 CHECK (jobs_removed >= 0),
    error VARCHAR(120)
);
CREATE INDEX IF NOT EXISTS job_feed_runs_source_idx ON public.job_feed_runs (source, started_at DESC);

-- ---------------------------------------------------------------------------
-- Migration 010: JobWebKenya job feed source (see database/migrations/010_job_feed_jobwebkenya.sql)
-- ---------------------------------------------------------------------------
ALTER TABLE public.external_jobs DROP CONSTRAINT IF EXISTS external_jobs_source_check;
ALTER TABLE public.external_jobs ADD CONSTRAINT external_jobs_source_check
    CHECK (source IN ('himalayas', 'jsearch', 'jobwebkenya'));
ALTER TABLE public.job_feed_runs DROP CONSTRAINT IF EXISTS job_feed_runs_source_check;
ALTER TABLE public.job_feed_runs ADD CONSTRAINT job_feed_runs_source_check
    CHECK (source IN ('himalayas', 'jsearch', 'jobwebkenya'));

-- ---------------------------------------------------------------------------
-- Migration 011: applications to community opportunities (see database/migrations/011_opportunity_applications.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.opportunity_applications (
    opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    note VARCHAR(1000) CHECK (note IS NULL OR length(btrim(note)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (opportunity_id, user_id)
);
CREATE INDEX IF NOT EXISTS opportunity_applications_user_idx ON public.opportunity_applications (user_id);
