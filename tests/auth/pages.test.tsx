import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import AccountPage from "@/app/account/page";
import SignInPage from "@/app/sign-in/page";
import SignUpPage from "@/app/sign-up/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
const mocks = vi.hoisted(() => ({ currentSession: vi.fn(), requireSession: vi.fn(), auth: vi.fn(), configured: vi.fn(), redirect: vi.fn(), getProfile: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/alumni-directory", () => ({ homeAlumni: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/profiles", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/lib/session", () => ({ currentSession: mocks.currentSession, requireSession: mocks.requireSession }));
vi.mock("@/app/auth-actions", () => ({ googleSignIn: vi.fn(), logOut: vi.fn(), passwordSignIn: vi.fn(), registerAccount: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth-environment", () => ({ isGoogleAuthConfigured: mocks.configured, isAuthConfigured: mocks.configured }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, usePathname: () => "/" }));
const session = { user: { id: "lumina-id", name: "Google User", email: "person@gmail.com", alumniVerified: false, accountStatus: "pending", role: "alumni" }, expires: "2030-01-01" };
beforeEach(() => { vi.resetAllMocks(); mocks.getProfile.mockResolvedValue(null); });
describe("session-dependent pages", () => {
 it("shows an editorial landing page with join and sign-in CTAs and no account implementation copy", async () => {
  mocks.currentSession.mockResolvedValue(null); const html = renderToStaticMarkup(await Home());
  expect(html).toContain('href="/sign-up"'); expect(html).toContain("Join Lumina"); expect(html).toContain('href="/sign-in"');
  expect(html).toContain("Reconnect with the people who shaped"); expect(html).not.toContain("Continue with Google");
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
 it("renders a conventional sign-in page: email and password first, Google below", async () => {
  mocks.configured.mockReturnValue(true); mocks.auth.mockResolvedValue(null);
  const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }));
  const order = ["Email address", "Password", ">Sign in<", "Forgot password?", "or continue with", "Continue with Google", "Create an account"].map(text => html.indexOf(text));
  expect(order.every(index => index >= 0)).toBe(true); expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(html).toContain('autoComplete="current-password"');
  for (const text of ["Personal Gmail", "Alumni verification is handled separately", "verified after"]) expect(html).not.toContain(text);
 });
 it("explains a Google/password email conflict without linking accounts", async () => { mocks.configured.mockReturnValue(true); mocks.auth.mockResolvedValue(null); const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ error: "account-exists" }) })); expect(html).toContain("already has a Lumina password account"); });
 it("confirms a newly created account", async () => { mocks.configured.mockReturnValue(true); mocks.auth.mockResolvedValue(null); expect(renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ registered: "1" }) }))).toContain("Your account is ready"); });
 it("disables Google but keeps password sign-in when Google is unconfigured", async () => { mocks.configured.mockReturnValue(false); const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) })); expect(html).toMatch(/<button[^>]*disabled=""[^>]*class="button google-button"|<button[^>]*class="button google-button"[^>]*disabled=""/); expect(html).toContain('name="password"'); });
 it("renders a separate create-account page", async () => {
  mocks.configured.mockReturnValue(true); mocks.auth.mockResolvedValue(null);
  const html = renderToStaticMarkup(await SignUpPage());
  for (const name of ["full_name", "email", "password", "confirm_password"]) expect(html).toContain(`name="${name}"`);
  expect(html).toContain("Create account"); expect(html).toContain("Continue with Google"); expect(html).toContain('href="/sign-in"');
  expect(html).toContain('autoComplete="new-password"');
 });
 it("redirects authenticated users away from create account", async () => { mocks.configured.mockReturnValue(true); mocks.auth.mockResolvedValue(session); mocks.redirect.mockImplementation(() => { throw new Error("redirect"); }); await expect(SignUpPage()).rejects.toThrow("redirect"); expect(mocks.redirect).toHaveBeenCalledWith("/onboarding"); });
 it("does not pretend to send password reset emails", () => {
  const html = renderToStaticMarkup(<ForgotPasswordPage />);
  expect(html).toContain("not available yet"); expect(html).not.toMatch(/email (has been|was) sent|check your inbox/i); expect(html).not.toContain("<form");
 });
});
