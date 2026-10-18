import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthConfigured, isGoogleAuthConfigured } from "@/lib/auth-environment";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

describe("Google auth configuration", () => {
  it("requires all server secrets", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "");
    expect(isGoogleAuthConfigured()).toBe(false);
    vi.stubEnv("AUTH_GOOGLE_ID", "test-client");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "test-client-secret");
    expect(isGoogleAuthConfigured()).toBe(false);
    vi.stubEnv("AUTH_SECRET", "test-session-secret");
    expect(isGoogleAuthConfigured()).toBe(true);
  });

  it("allows password sessions with only the Auth.js secret", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "");
    expect(isAuthConfigured()).toBe(false);
    vi.stubEnv("AUTH_SECRET", "test-session-secret");
    expect(isAuthConfigured()).toBe(true);
    expect(isGoogleAuthConfigured()).toBe(false);
  });
});
