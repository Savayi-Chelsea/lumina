-- Kenya job feed: a cache of real listings from external job boards, refreshed
-- at most daily. Additive only: two new tables; no existing rows change.
-- Apply with: .venv/bin/python scripts/apply_migration.py 009 --apply

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
