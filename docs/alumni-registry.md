# Synthetic alumni verification prototype

This registry contains fictional fixtures derived from `data/synthetic_alumni.csv`.
It is not Kenya Airways employee data and is not evidence of real employment.
Production use requires a private, authorized source and appropriate identity controls.

## Local setup

Migration 002 adds `alumni_registry` and `verification_assistance_requests`.
It does not update existing users, profiles, Google identities, roles or statuses.
The runner checks every existing column and row using counts and SHA-256 hashes,
inside a transaction with write locks. It refuses remote targets, databases other
than `lumina`, and pre-existing migration tables. It does not drop or recreate them.

```powershell
.venv\Scripts\python.exe scripts/migrate_alumni_registry.py
.venv\Scripts\python.exe scripts/migrate_alumni_registry.py --apply
.venv\Scripts\python.exe scripts/generate_alumni_registry.py
.venv\Scripts\python.exe scripts/import_alumni_registry.py --apply
```

The importer derives the same fixtures directly from the source CSV. Generation
writes a reviewable CSV; import does not accept arbitrary employee data files.
Numbers are prefixed `SYN-`, and registry UUIDs are deterministic. Reimports insert
missing fixtures, preserve existing claims and application data, and reject changed
source values rather than overwriting records. Neither tool invokes the original
profile seeder or changes matching data.

Example fixture: `SYN-ALUM-001`, surname `Wafula`, department `Safety & Quality`,
service years `2008`–`2016`. This is a fictional demonstration identity.

## Verification behavior

Google sign-in routes through `/onboarding`. Unverified alumni go to `/verify`;
verified alumni proceed to profile completion or home; administrators go to `/admin`.
Only server-side code reads registry records. Staff numbers, surnames and registry
claims are never added to profile fields, browser sessions or public network data.

Matching accepts case differences and surrounding/repeated whitespace, with NFC
Unicode normalization for surname and department. Years and staff numbers must
match exactly after staff-number trimming and uppercasing. No fuzzy names or
approximate years are accepted. Controlled form inputs preserve details on failure.

A transaction locks the account and registry record, claims one record for one
user, activates the account and sets alumni verification. Unique constraints and
row locks prevent duplicate or concurrent claims. A claimed record cannot be
transferred to another account by either frontend. Repeated verification is safe.
Suspended accounts cannot be reactivated through this flow. Existing verified
accounts remain verified without retroactively claiming registry fixtures.

Failed matches return a generic unresolved result without revealing whether a
record exists or who claimed it. No failure suspends or rejects an account, changes
a profile, or creates routine admin work. Users can retry or explicitly request help.

## Assistance and exceptions

Only explicit assistance requests appear in the admin queue. Repeated requests
while open are idempotent. Administrators may associate a confirmed available
synthetic registry record, or close unresolved without changing account status.
Association requires explicit confirmation and rechecks the admin role in PostgreSQL.
There is no suspension/rejection action, automatic claim transfer, or free-text note.

Resolved requests populate `resolved_at`, `resolved_by_user_id`, and
`resolution_outcome` together. Outcomes are `verified` or `closed_unresolved`.
Unresolved requests have all three NULL. Closing unresolved permits retry/reopening.
A successful self-service retry also resolves an open request as `verified`, with
the claimant's own user ID as resolver. This represents self-resolution, not admin
approval. Admin resolutions record the administrator's user ID.

## Checks

```powershell
$env:LUMINA_TEST_DATABASE='1'
npm.cmd run test:auth
.venv\Scripts\python.exe -m unittest discover -s tests/registry
.venv\Scripts\python.exe -m unittest discover -s services/matching/tests
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:auth:http
```

Registry SQL tests use an isolated, randomly named schema; original auth SQL tests
use temporary tables. HTTP tests remove their own fixtures and compare existing
data. Google OAuth itself remains external; HTTP checks use a signed local session.
The FastAPI matching service is unchanged.
