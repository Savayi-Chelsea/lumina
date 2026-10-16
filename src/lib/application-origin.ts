import "server-only";

// Accept only an HTTP(S) origin, with an optional trailing slash. Reject URL
// parser repairs, credentials, paths, queries, fragments and origin lists.
function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value || !/^https?:\/\/[^\s/\\?#@]+\/?$/i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

export function applicationOrigin(): string {
  // Read at runtime so deployment configuration is never baked into a build.
  const origin = normalizeOrigin(process.env.APP_ORIGIN);
  if (!origin) {
    console.error("Mentorship unavailable: APP_ORIGIN is missing or invalid.");
    throw new Error("Application origin configuration unavailable");
  }
  return origin;
}

export function matchesApplicationOrigin(origin: string | null, configuredOrigin: string): boolean {
  // No missing-Origin exception, including for server callers or Fetch Metadata.
  return normalizeOrigin(origin) === configuredOrigin;
}
