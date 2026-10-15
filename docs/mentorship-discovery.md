# Sprint II: mentorship discovery

## Start the demonstration

The existing synthetic alumni seed, matching consent/preferences, and BGE profile
embeddings must already be present. The prototype dataset is fictional; all mentor
cards/profile views from `@synthetic.lumina.local` are labeled accordingly.

Set these server-only values in `.env` (never use `NEXT_PUBLIC_`):

```dotenv
MATCHING_SERVICE_URL=http://127.0.0.1:8000
MATCHING_SERVICE_TIMEOUT_MS=60000
```

`MATCHING_TOP_K` and `MATCHING_SIMILARITY_THRESHOLD` remain owned by FastAPI.
The browser cannot override ranking, thresholds or top-k settings. Missing or
invalid configuration returns a friendly unavailable state, never fixture matches.

Start the API in one terminal:

```powershell
.venv\Scripts\python.exe -m uvicorn services.matching.app.main:app --host 127.0.0.1 --port 8000
```

Wait for `GET http://127.0.0.1:8000/ready` to return 200 before the presentation.
This loads the existing pinned model and checks the database; a cold model may
take time to load. To prepare missing/stale embeddings, use the existing
`scripts/index_profile_embeddings.py` workflow rather than changing the search
algorithm or creating fake vectors. Do not re-seed existing profiles just to demo.

Then start Lumina (`npm.cmd run dev`, or `npm.cmd run build` and `npm.cmd start`).
Use an origin registered for the existing Google OAuth client.

## Lecturer walkthrough

1. Click **Continue with Google** and complete Google sign-in with a test account.
2. Use an unclaimed synthetic registry fixture in `/verify`. For example, the
   existing fixture `SYN-ALUM-001`, surname `Wafula`, department `Safety & Quality`,
   service years `2008`–`2016` works only while unclaimed. Never take over a claim.
3. Verification activates the account. Complete the profile and open Lumina Home.
4. Open **Mentorship** and enter:
   “I want to move from IT support into AWS cloud engineering and DevOps.”
5. Click **Find mentors**. The loading state appears while the real request runs.
6. Next.js validates the request and calls FastAPI `POST /mentors/search`.
   The unchanged BGE query encoder and pgvector cosine search rank eligible
   mentors. Next.js adds names through the profile relation and rechecks consent,
   availability and active account status without reordering results.
7. Review **Match relevance**, professional history and skills. Relevance is cosine
   similarity (−1 to 1), not probability or a promise of mentoring suitability.
8. Open **View alumni profile** for biography, topics, service years and current
   professional details. Messaging/mentor requests and LLM explanations are not
   implemented.

## Access and privacy

An active, verified alumni account or active administrator is required for search
and mentor profile viewing. Pending users get a verification prompt; direct API
calls return 403. Anonymous API calls return 401. Admin support access is explicit;
an admin role never bypasses suspension. Roles/status come from the existing
server-refreshed session model.

Only profiles opted into matching and currently available are exposed. Consent and
availability are checked again when enriching results and when opening a direct
profile URL. Withdrawn/unavailable profiles return 404; an ineligible viewer is
gated before profile lookup. Private account/registry data is not part of a public
profile. Query requests and service diagnostics are not logged or persisted by
the Next.js integration.

The proxy has a configurable bounded timeout, no caching, JSON size limits, a
strict response validator and an output allowlist. It hides internal service URLs,
configuration, raw vectors, source hashes, model identifiers, SQL and error bodies.
Malformed or out-of-order service responses fail safely rather than reranking or
falling back to fictional results. Empty results remain an honest empty state.

## Automated checks

```powershell
$env:LUMINA_TEST_DATABASE='1'
npm.cmd run test:auth
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:auth:http
npm.cmd run test:frontend:browser
npm.cmd run test:mentorship:live
.venv\Scripts\python.exe -m unittest discover -s services/matching/tests
```

Browser-state tests deliberately intercept only the Next.js API to exercise
loading, errors, malformed JSON, empty results and retries reproducibly. The
separate `test:mentorship:live` command uses the **real** matching API, BGE model
and pgvector data, preserves the exact returned ranking, verifies a disposable
registry fixture through the actual form, and opens the real full mentor profile.
It can start the local API if needed, or reuse a running one.

Google's external OAuth exchange is not automated: the live test uses a signed
Google-linked session fixture with the production Auth.js/session validation.
The manual walkthrough above includes actual Google sign-in. Set
`LUMINA_TEST_GOOGLE_REDIRECT=1` to additionally test the real Auth.js authorization
redirect (requires access to Google's public discovery metadata); the external
consent/token exchange is still manual. Test fixture rows
are removed and all pre-existing application data is compared after cleanup.
Screenshots and a machine-readable report are in
`artifacts/frontend/mentorship-live/` (gitignored).
