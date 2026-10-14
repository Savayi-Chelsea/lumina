import { afterEach, describe, expect, it, vi } from "vitest";
import { currentSession, requireSession } from "@/lib/session";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), configured: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth-environment", () => ({ isGoogleAuthConfigured: mocks.configured }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
afterEach(() => vi.resetAllMocks());

describe("server session guard", () => {
  it("redirects unauthenticated users to sign in", async () => {
    mocks.configured.mockReturnValue(true);
    mocks.auth.mockResolvedValue(null);
    mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
    await expect(requireSession()).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("redirects safely when Google credentials are absent", async () => {
    mocks.configured.mockReturnValue(false);
    mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
    await expect(requireSession()).rejects.toThrow("redirect");
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("returns the authenticated server session", async () => {
    const session = { user: { id: "lumina-user" } };
    mocks.configured.mockReturnValue(true);
    mocks.auth.mockResolvedValue(session);
    expect(await requireSession()).toBe(session);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not invent a session when unconfigured", async () => {
    mocks.configured.mockReturnValue(false);
    expect(await currentSession()).toBeNull();
  });
});
