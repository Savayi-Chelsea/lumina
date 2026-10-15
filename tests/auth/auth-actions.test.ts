import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "next-auth";
import { googleSignIn, logOut } from "@/app/auth-actions";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn(), configured: vi.fn(), redirect: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: mocks.signIn, signOut: mocks.signOut }));
// Load the error class without importing Next.js runtime helpers in the unit runner.
vi.mock("next-auth", async () => ({ AuthError: (await import("@auth/core/errors")).AuthError }));
vi.mock("@/lib/auth-environment", () => ({ isGoogleAuthConfigured: mocks.configured }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
afterEach(() => vi.resetAllMocks());

describe("authentication server actions", () => {
  it("starts only Google sign in and returns to protected onboarding", async () => {
    mocks.configured.mockReturnValue(true);
    await googleSignIn();
    expect(mocks.signIn).toHaveBeenCalledWith("google", { redirectTo: "/onboarding" });
  });

  it("uses a safe sign-in failure message", async () => {
    mocks.configured.mockReturnValue(true);
    mocks.signIn.mockRejectedValue(new AuthError("private credential details"));
    mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
    await expect(googleSignIn()).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/sign-in?error=signin");
  });

  it("signs out through Auth.js and returns home", async () => {
    await logOut();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: "/" });
  });
});
