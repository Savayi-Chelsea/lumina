import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import AccountPage from "@/app/account/page";
import SignInPage from "@/app/sign-in/page";

const mocks = vi.hoisted(() => ({ currentSession: vi.fn(), requireSession: vi.fn(), auth: vi.fn(), configured: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/session", () => ({ currentSession: mocks.currentSession, requireSession: mocks.requireSession }));
vi.mock("@/app/auth-actions", () => ({ googleSignIn: vi.fn(), logOut: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth-environment", () => ({ isGoogleAuthConfigured: mocks.configured }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const session = { user: { id: "lumina-id", name: "Google User", email: "person@gmail.com", alumniVerified: false }, expires: "2030-01-01" };
beforeEach(() => vi.resetAllMocks());

describe("session-dependent pages", () => {
  it("shows sign in to unauthenticated visitors", async () => {
    mocks.currentSession.mockResolvedValue(null);
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("Sign in with Google");
    expect(html).not.toContain("Sign out");
  });

  it("shows account information and sign out to signed-in visitors", async () => {
    mocks.currentSession.mockResolvedValue(session);
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("person@gmail.com");
    expect(html).toContain("Sign out");
    expect(html).not.toContain("Sign in with Google");
  });

  it("checks the server session before rendering the protected page", async () => {
    mocks.requireSession.mockRejectedValue(new Error("redirect to sign in"));
    await expect(AccountPage()).rejects.toThrow("redirect to sign in");
    expect(mocks.requireSession).toHaveBeenCalledOnce();
  });

  it("renders the protected account for a valid session", async () => {
    mocks.requireSession.mockResolvedValue(session);
    expect(renderToStaticMarkup(await AccountPage())).toContain("You’re signed in");
  });

  it("renders a generic sign-in error without echoing untrusted error details", async () => {
    mocks.configured.mockReturnValue(true);
    mocks.auth.mockResolvedValue(null);
    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ error: "private SQL credential detail" }) }));
    expect(html).toContain("We couldn’t sign you in");
    expect(html).not.toContain("private SQL");
  });

  it("redirects already authenticated users away from sign in", async () => {
    mocks.configured.mockReturnValue(true);
    mocks.auth.mockResolvedValue(session);
    mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
    await expect(SignInPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/account");
  });
});
