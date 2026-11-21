# Automated test results

Run 2026-11-19T19:18:29+00:00 with live PostgreSQL, Kafka and the matching service (LUMINA_TEST_DATABASE=1, LUMINA_TEST_KAFKA=1, LUMINA_TEST_SYNTHETIC_DIRECTORY=1, LUMINA_TEST_GOOGLE_REDIRECT=1). Command: `bash scripts/evaluate_test_suites.sh`.

| Suite | What it covers | Passed | Failed | Skipped | Result | Time |
| --- | --- | --- | --- | --- | --- | --- |
| lint | Static analysis (ESLint) | 1 run | 0 | 0 | pass | 8 s |
| typecheck | Type safety (tsc --noEmit) | 1 run | 0 | 0 | pass | 2 s |
| vitest | Web app: auth, verification, mentorship, social, privacy, jobs (incl. live PostgreSQL) | 325 tests | 0 | 0 | pass | 7 s |
| pytest | Matching service, indexing, Kafka worker (live broker), registry, seeding, email worker (+334 subtests passed) | 78 tests | 0 | 0 | pass | 51 s |
| http-smoke | Production HTTP: sessions, roles, verification, sign-out | 15 scenarios | 0 | 0 | pass | 5 s |
| browser-smoke | Browser end-to-end: every member and admin journey, 5 viewports | 17 scenarios | 0 | 0 | pass | 79 s |
| mentorship-live | Live demo path: Google-linked session to real BGE mentor results | 4 scenarios | 0 | 0 | pass | 5 s |

Full output for each suite is in the matching `.log` file in this folder; `vitest.json` and `pytest.xml` hold per-test results.
