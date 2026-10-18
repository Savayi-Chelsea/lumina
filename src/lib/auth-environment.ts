import "server-only";

/** Sessions (and therefore email/password sign-in) only need the Auth.js secret. */
export function isAuthConfigured() {
  return Boolean(process.env.AUTH_SECRET);
}

export function isGoogleAuthConfigured() {
  return Boolean(process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}
