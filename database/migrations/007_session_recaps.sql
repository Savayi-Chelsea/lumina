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
