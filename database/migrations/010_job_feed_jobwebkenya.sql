-- Kenya job feed: allow a third source, JobWebKenya (on-site jobs in Kenya from the
-- board's public RSS feed). Constraint change only; no rows are touched.
-- Apply with: .venv/bin/python scripts/apply_migration.py 010 --apply
ALTER TABLE public.external_jobs DROP CONSTRAINT IF EXISTS external_jobs_source_check;
ALTER TABLE public.external_jobs ADD CONSTRAINT external_jobs_source_check
    CHECK (source IN ('himalayas', 'jsearch', 'jobwebkenya'));
ALTER TABLE public.job_feed_runs DROP CONSTRAINT IF EXISTS job_feed_runs_source_check;
ALTER TABLE public.job_feed_runs ADD CONSTRAINT job_feed_runs_source_check
    CHECK (source IN ('himalayas', 'jsearch', 'jobwebkenya'));
