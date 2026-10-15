import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import AccountPage from "@/app/account/page";
import SignInPage from "@/app/sign-in/page";
const mocks = vi.hoisted(() => ({ currentSession: vi.fn(), requireSession: vi.fn(), auth: vi.fn(), configured: vi.fn(), redirect: vi.fn(), getProfile: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/profiles", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/lib/session", () => ({ currentSession: mocks.currentSession, requireSession: mocks.requireSession }));
vi.mock("@/app/auth-actions", () => ({ googleSignIn: vi.fn(), logOut: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth-environment", () => ({ isGoogleAuthConfigured: mocks.configured }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, usePathname: () => "/" }));
const session = { user: { id: "lumina-id", name: "Google User", email: "person@gmail.com", alumniVerified: false, accountStatus: "pending", role: "alumni" }, expires: "2030-01-01" };
beforeEach(() => { vi.resetAllMocks(); mocks.getProfile.mockResolvedValue(null); });
describe("session-dependent pages", () => {
 it("shows an editorial landing page with one Google CTA and no account implementation copy", async () => {
  mocks.currentSession.mockResolvedValue(null); const html = renderToStaticMarkup(await Home());
  expect(html).toContain("Continue with Google"); expect(html).toContain("Reconnect with the people who shaped");
  expect(html.match(/Continue with Google/g)).toHaveLength(1);
  for (const text of ["Personal Gmail", "Google authentication succeeded", "Alumni verification is handled separately", "account_status", "Sign out"]) expect(html).not.toContain(text);
 });
 it("shows pending alumni a verification entry point without presenting them as verified", async () => {
  mocks.currentSession.mockResolvedValue(session); const html = renderToStaticMarkup(await Home());
  expect(html).toContain("Google User"); expect(html).toContain('href="/verify"'); expect(html).toContain("Not verified");
  expect(html).not.toContain("Verified by Lumina"); expect(html).not.toContain("Google authentication succeeded");
 });
 it("shows verified alumni status only for active verified users", async () => { mocks.currentSession.mockResolvedValue({ ...session, user: { ...session.user, accountStatus: "active", alumniVerified: true } }); const html = renderToStaticMarkup(await Home()); expect(html).toContain("Verified by Lumina"); expect(html).not.toContain('href="/verify"'); });
 it("keeps pending status authoritative even with a true verification flag", async () => { mocks.currentSession.mockResolvedValue({ ...session, user: { ...session.user, alumniVerified: true } }); const html = renderToStaticMarkup(await Home()); expect(html).not.toContain("Verified by Lumina"); });
 it("shows administration entry only for admin users", async () => { mocks.currentSession.mockResolvedValue(session); expect(renderToStaticMarkup(await Home())).not.toContain('href="/admin"'); mocks.currentSession.mockResolvedValue({ ...session, user: { ...session.user, role: "admin" } }); expect(renderToStaticMarkup(await Home())).toContain('href="/admin"'); });
 it("checks the server session before rendering account", async () => { mocks.requireSession.mockRejectedValue(new Error("redirect to sign in")); await expect(AccountPage()).rejects.toThrow("redirect to sign in"); });
 it("renders authenticated account", async () => { mocks.requireSession.mockResolvedValue(session); expect(renderToStaticMarkup(await AccountPage())).toContain("signed in"); });
 it("renders generic sign-in error", async () => { mocks.configured.mockReturnValue(true); mocks.auth.mockResolvedValue(null); const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ error: "private SQL credential detail" }) })); expect(html).toContain("sign you in"); expect(html).not.toContain("private SQL"); });
 it("redirects already authenticated users", async () => { mocks.configured.mockReturnValue(true); mocks.auth.mockResolvedValue(session); mocks.redirect.mockImplementation(() => { throw new Error("redirect"); }); await expect(SignInPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect"); expect(mocks.redirect).toHaveBeenCalledWith("/onboarding"); });
});
