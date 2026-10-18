-- Optional public professional photo, refreshed only from validated Google sign-ins.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_image_url TEXT;
