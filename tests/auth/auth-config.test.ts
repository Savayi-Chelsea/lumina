import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, NextAuthConfig } from "next-auth";
import { createAuthConfig } from "@/lib/auth-config";
import type { LuminaUser } from "@/lib/lumina-users";

vi.mock("server-only", () => ({}));

const user: LuminaUser = { id: "00000000-0000-0000-0000-000000000001", role: "alumni", account_status: "pending", alumni_verified: false };
const account: Account = { provider: "google", type: "oidc", providerAccountId: "google-subject", access_token: "private-access-token", id_token: "private-id-token" };
const profile = { sub: "google-subject", email: "person@gmail.com", email_verified: true, name: "Google User", picture: "https://lh3.googleusercontent.com/example" };
type Callbacks = NonNullable<NextAuthConfig["callbacks"]>;
type SessionParams = Parameters<NonNullable<Callbacks["session"]>>[0];

describe("Auth.js policy", () => {
  const store = { linkGoogleUser: vi.fn(), findLuminaUser: vi.fn() };
  const config = createAuthConfig(store);
  const callbacks = config.callbacks!;

  beforeEach(() => {
    vi.clearAllMocks();
    store.linkGoogleUser.mockResolvedValue(user);
    store.findLuminaUser.mockResolvedValue(user);
  });

  it("uses encrypted JWT sessions with a bounded lifetime", () => {
    expect(config.session).toEqual({ strategy: "jwt", maxAge: 86400 });
  });

  it("accepts verified personal Gmail accounts", async () => {
    expect(await callbacks.signIn!({ user: {}, account, profile })).toBe(true);
  });

  it("rejects unverified email, mismatched subject and other providers", async () => {
    expect(await callbacks.signIn!({ user: {}, account, profile: { ...profile, email_verified: false } })).toBe(false);
    expect(await callbacks.signIn!({ user: {}, account, profile: { ...profile, sub: "different-subject" } })).toBe(false);
    expect(await callbacks.signIn!({ user: {}, account: { ...account, provider: "other" }, profile })).toBe(false);
  });

  it("links the stable Google subject and uses the existing Lumina UUID", async () => {
    const token = await callbacks.jwt!({ token: {}, user: {}, account, profile });
    expect(store.linkGoogleUser).toHaveBeenCalledWith("google-subject", "person@gmail.com", profile.picture);
    expect(token?.sub).toBe(user.id);
    expect(token?.alumniVerified).toBe(false);
    expect(JSON.stringify(token)).not.toContain("private-");
  });

  it("reloads verification from Lumina and ignores browser updates", async () => {
    const token = await callbacks.jwt!({ token: { luminaUserId: user.id }, user: {}, trigger: "update", session: { alumniVerified: true, role: "admin" } });
    expect(token?.alumniVerified).toBe(false);
    expect(token?.luminaRole).toBe("alumni");
    expect(store.linkGoogleUser).not.toHaveBeenCalled();
    store.findLuminaUser.mockResolvedValue({ ...user, alumni_verified: true });
    expect((await callbacks.jwt!({ token: { luminaUserId: user.id }, user: {} }))?.alumniVerified).toBe(true);
  });

  it("rejects suspended and deleted users on session access", async () => {
    store.findLuminaUser.mockResolvedValue({ ...user, account_status: "suspended" });
    expect(await callbacks.jwt!({ token: { luminaUserId: user.id }, user: {} })).toBeNull();
    store.findLuminaUser.mockResolvedValue(null);
    expect(await callbacks.jwt!({ token: { luminaUserId: user.id }, user: {} })).toBeNull();
  });

  it("fails closed on database errors without logging credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      store.linkGoogleUser.mockRejectedValue(new Error("password profile source SELECT secret"));
      expect(await callbacks.jwt!({ token: {}, user: {}, account, profile })).toBeNull();
      expect(JSON.stringify(log.mock.calls)).not.toContain("password");
    } finally { log.mockRestore(); }
  });

  it("exposes only the public session allowlist", async () => {
    const token = await callbacks.jwt!({ token: {}, user: {}, account, profile });
    const session = await callbacks.session!({
      token: { ...token, access_token: "secret-access", refresh_token: "secret-refresh" },
      session: { expires: "2030-01-01T00:00:00Z", user: {} },
    } as unknown as SessionParams);
    expect(session.user).toMatchObject({ id: user.id, name: "Google User", email: "person@gmail.com", alumniVerified: false });
    expect(JSON.stringify(session)).not.toContain("secret");
    expect(JSON.stringify(session)).not.toContain("google-subject");
  });

  it("rejects arbitrary remote profile image URLs", async () => {
    const token = await callbacks.jwt!({ token: {}, user: {}, account, profile: { ...profile, picture: "https://attacker.example/photo" } });
    expect(token?.picture).toBeNull();
  });
});
