# Lumina: Sprint II evidence

Recorded 19 October 2026 on the local development environment (Windows 11, Docker Desktop,
PostgreSQL 17 + pgvector, Next.js 16 production build, FastAPI matching service).
All alumni, events and opportunities are fictional synthetic data.

## 1. Objectives and what now works

| Objective | Implemented workflow (input → processing → output) |
| --- | --- |
| Secure access for former KQ staff | Email/password or Google sign-in → Auth.js JWT session refreshed from PostgreSQL on every request → pending account sent to verification |
| Alumni verification | Staff number, surname, department, service years → automatic registry match → account activated, or retry/assistance request (admin handles exceptions only) |
| Account recovery | Email → single-use, 30-minute, hashed token → email (Mailpit) → new Argon2id password |
| Professional profiles | Profile form → validated save → profile page and directory card |
| Alumni Network | Search text and filters → parameterised PostgreSQL query → paginated, shareable results → unified profile page |
| Semantic mentorship | Natural-language goal → BGE query embedding → pgvector cosine search over consenting, available mentors → ranked mentors → profile |
| Events | Admin creates/publishes event → alumni browse and reserve a place → capacity-safe registration → attendee list for admin |
| Opportunities | Admin publishes listing → alumni filter/search open listings → detail with application instructions |
| Administration | Dashboard counts, verification exceptions, event/opportunity management, user suspension and reinstatement |

## 2. Test and build results

| Check | Result |
| --- | --- |
| Unit, component and live-database tests (Vitest, `LUMINA_TEST_DATABASE=1`) | 254 passed in 26 files |
| Matching service tests (Python) | 35 passed |
| Synthetic dataset tests (Python, with database) | 9 passed |
| Production HTTP auth smoke tests | 15 checks passed |
| Live mentorship test (real BGE + pgvector) | Passed |
| Browser suite (Playwright, production build) | 13 scenario groups passed; 0 runtime errors |
| Responsive viewports | 320, 375, 768, 1024, 1440 px (plus 430, 600, 900, 1280, 1920 px) with no horizontal overflow |
| TypeScript, ESLint, production build, `git diff --check` | Clean |

Every database test works on temporary tables or disposable rows and asserts afterwards that existing data is unchanged.

## 3. Matching evaluation (Issue #6)

Full report: `evaluation/results/matching_evaluation.md`. Corpus: 133 consenting, available synthetic mentors; k = 5.

| Query set | System | P@5 | R@5 | F1@5 | MRR |
| --- | --- | --- | --- | --- | --- |
| Domain (12 queries) | Semantic (BGE + pgvector) | 1.000 | 0.475 | 0.637 | 1.000 |
| Domain (12 queries) | Keyword baseline (TF-IDF) | 1.000 | 0.475 | 0.637 | 1.000 |
| Career transition (10 queries) | Semantic (BGE + pgvector) | 0.620 | 0.477 | 0.482 | 0.775 |
| Career transition (10 queries) | Keyword baseline (TF-IDF) | 0.500 | 0.331 | 0.358 | 0.667 |

- Domain queries name the department area, so both systems reach the recall ceiling.
- Transition queries describe a career move whose answer depends on where mentors work now. On these, semantic matching outperforms keyword matching on every metric.
- An off-topic control query ("astrophysics research on black holes") returns no mentors.
- Labels are rule-based on synthetic data; the figures do not describe real Kenya Airways alumni.

## 4. AI-assisted development decisions

These suggestions were evaluated, accepted or rejected during Sprint II:

1. **Rejected: the first evaluation design.** Department-only queries gave both semantic and keyword search a perfect P@5 of 1.0, so they could not show any difference. The query set was extended with career-transition queries labelled by current industry, title and organization; these showed a measurable gap.
2. **Rejected: the newest email library release.** nodemailer 10.x conflicted with Auth.js's declared peer range, and several 10.1 releases had been published within a single day. The project instead pins nodemailer 8.0.11: inside Auth.js's range and more than two weeks old.
3. **Rejected: React's default form submission for admin forms.** Browser tests showed that React's automatic form reset could overwrite a correction typed right after a validation error. Admin forms now submit through their own handler, so admin input is never lost.
4. **Accepted: Argon2id from Node.js's built-in `crypto`.** This avoided an extra native dependency, using OWASP baseline parameters (19 MiB memory, 2 passes, parallelism 1).
5. **Accepted: reset tokens in the URL fragment.** Fragments are never sent to the server or in `Referer` headers. Only a SHA-256 digest of the token is stored.

## 5. Screenshots (`docs/evidence/`)

| File | Shows |
| --- | --- |
| `landing-1440.png`, `landing-375.png` | Public landing page, desktop and phone |
| `auth-sign-in-desktop.png`, `auth-sign-up-375.png`, `auth-forgot-password-768.png` | Sign in, create account, password reset request |
| `verification-1440.png` | Alumni verification form |
| `home-verified-desktop.png` | Verified alumni home with real alumni, events and opportunities |
| `network-1440.png`, `network-375.png`, `alumni-profile-1440.png` | Alumni Network and a full profile |
| `mentorship-results-desktop.png`, `mentorship-results-mobile.png` | Ranked semantic mentor results |
| `events-1440.png`, `event-registered-desktop.png`, `events-detail-375.png` | Events list, a confirmed reservation, phone detail view |
| `opportunities-1440.png`, `opportunities-375.png`, `opportunities-detail-1440.png` | Opportunities board and detail |
| `admin-1440.png`, `admin-events-desktop.png`, `admin-users-1440.png` | Admin dashboard, event management, user management |
| `navigation-375.png` | Phone navigation menu |

## 6. Known limitations and Sprint III preparation

- Sign-in and reset rate limits are in memory per server process; production needs a shared store and edge rate limiting.
- Sessions issued before a password reset stay valid until they expire (24 hours).
- Email addresses of password accounts are not verified; alumni verification still gates every privileged feature.
- Kafka, LLM-generated match explanations and AWS deployment are designed in the report but **not implemented**.
- Before deployment: production `APP_ORIGIN`, rotated Google OAuth secret, real SMTP provider, managed PostgreSQL with pgvector, model-weight caching for the matching service, HTTPS cookies, and a decision on keeping synthetic data out of production.
