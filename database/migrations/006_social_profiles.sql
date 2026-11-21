-- LinkedIn-style profiles, connections, messaging, mentorship requests, notifications
-- and the profile-change outbox feeding Kafka. Additive: new tables plus two
-- defaulted profile columns; no existing values change.
-- Apply with: .venv/Scripts/python.exe scripts/apply_migration.py 006 --apply

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
