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
