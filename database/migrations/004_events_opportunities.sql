-- Events and Opportunities MVP. Additive only: creates new tables; no existing rows change.
-- Apply with: .venv/Scripts/python.exe scripts/apply_migration.py 004 --apply

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
