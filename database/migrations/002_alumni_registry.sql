-- Prototype fixtures only; no existing users or profiles are modified.
-- Run within a transaction using scripts/migrate_alumni_registry.py.
CREATE TABLE public.alumni_registry (
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

CREATE TABLE public.verification_assistance_requests (
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
