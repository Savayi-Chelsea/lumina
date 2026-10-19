import "server-only";

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED = 10_000;

/**
 * Per-email failed-attempt limiter held in process memory.
 * Prototype-grade: resets on restart and is not shared between instances.
 * Production needs a shared store (database or cache) and per-IP limits at the edge.
 */
export function createSignInThrottle(now = () => Date.now(), max = MAX_FAILURES, windowMs = WINDOW_MS) {
  const failures = new Map<string, number[]>();
  const recent = (key: string) => (failures.get(key) || []).filter(time => now() - time < windowMs);
  return {
    isLimited(key: string) { return recent(key).length >= max; },
    recordFailure(key: string) {
      if (!failures.has(key) && failures.size >= MAX_TRACKED) {
        for (const [entry] of failures) { if (!recent(entry).length) failures.delete(entry); }
        if (failures.size >= MAX_TRACKED) failures.delete(failures.keys().next().value!);
      }
      failures.set(key, [...recent(key), now()]);
    },
    reset(key: string) { failures.delete(key); },
  };
}

export type SignInThrottle = ReturnType<typeof createSignInThrottle>;

// Server actions and the Auth.js route handler can load separate module copies.
const throttleGlobal = globalThis as typeof globalThis & { luminaSignInThrottle?: SignInThrottle; luminaResetThrottle?: SignInThrottle };
export function signInThrottle() {
  throttleGlobal.luminaSignInThrottle ??= createSignInThrottle();
  return throttleGlobal.luminaSignInThrottle;
}

/** Password reset requests: at most 3 emails per address per 15 minutes. */
export const MAX_RESET_REQUESTS = 3;
export function resetRequestThrottle() {
  throttleGlobal.luminaResetThrottle ??= createSignInThrottle(undefined, MAX_RESET_REQUESTS);
  return throttleGlobal.luminaResetThrottle;
}
