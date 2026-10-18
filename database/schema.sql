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
