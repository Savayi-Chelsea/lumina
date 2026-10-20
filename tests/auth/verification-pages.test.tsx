import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VerifyPage from "@/app/(alumni)/verify/page";
import OnboardingPage from "@/app/onboarding/page";
import VerificationPage from "@/app/admin/verification/page";
const mocks = vi.hoisted(() => ({ requireSession: vi.fn(), assistance: vi.fn(), requests: vi.fn(), profile: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/verification", () => ({ getAssistanceStatus: mocks.assistance, pendingRequests: mocks.requests }));
vi.mock("@/lib/profiles", () => ({ getProfile: mocks.profile }));
vi.mock("@/app/(alumni)/verify/actions", () => ({ submitVerification: vi.fn(), submitAssistance: vi.fn() }));
vi.mock("@/app/admin/verification/actions", () => ({ reviewVerification: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
const user = { id: "id", role: "alumni", accountStatus: "pending", alumniVerified: false };
beforeEach(() => {
  vi.resetAllMocks(); mocks.requireSession.mockResolvedValue({ user }); mocks.assistance.mockResolvedValue(null); mocks.requests.mockResolvedValue([]);
  mocks.redirect.mockImplementation(path => { throw new Error(`redirect:${path}`); });
});
describe("registry frontend", () => {
  it("requires a session and labels all verification fields like a real registry check", async () => {
    const html = renderToStaticMarkup(await VerifyPage());
    for (const label of ["Staff number", "Surname", "Former KQ department", "KQ start year", "KQ end year", "Why we verify", "Request assistance"]) expect(html).toContain(label);
    for (const text of ["Synthetic", "Fictional", "prototype", "fixture"]) expect(html).not.toContain(text);
    expect(html).not.toContain("Wafula");
    mocks.requireSession.mockRejectedValue(new Error("signin")); await expect(VerifyPage()).rejects.toThrow("signin");
  });
  it("shows open assistance and safely closed unresolved states", async () => {
    mocks.assistance.mockResolvedValue({ resolution_outcome: null });
    expect(renderToStaticMarkup(await VerifyPage())).toContain("Assistance request open");
    mocks.assistance.mockResolvedValue({ resolution_outcome: "closed_unresolved" });
    const html = renderToStaticMarkup(await VerifyPage()); expect(html).toContain("closed unresolved"); expect(html).toContain("request assistance again");
  });
  it("routes pending accounts to verification, verified users to profile or home, admins to admin", async () => {
    await expect(OnboardingPage()).rejects.toThrow("redirect:/verify");
    mocks.requireSession.mockResolvedValue({ user: { ...user, alumniVerified: true, accountStatus: "active" } });
    mocks.profile.mockResolvedValue(null); await expect(OnboardingPage()).rejects.toThrow("redirect:/profile");
    mocks.profile.mockResolvedValue({ profile_completed: true }); await expect(OnboardingPage()).rejects.toThrow("redirect:/");
    mocks.requireSession.mockResolvedValue({ user: { ...user, role: "admin" } }); await expect(OnboardingPage()).rejects.toThrow("redirect:/admin");
  });
  it("redirects already verified users out of verification", async () => {
    mocks.requireSession.mockResolvedValue({ user: { ...user, alumniVerified: true, accountStatus: "active" } });
    await expect(VerifyPage()).rejects.toThrow("redirect:/profile"); expect(mocks.assistance).not.toHaveBeenCalled();
  });
  it("shows an exceptions-only empty queue and safe resolution controls", async () => {
    let html = renderToStaticMarkup(await VerificationPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("No open assistance requests");
    mocks.requests.mockResolvedValue([{ id: "id", full_name: "Fixture", email: "fixture@example.test", account_status: "pending", requested_at: new Date() }]);
    html = renderToStaticMarkup(await VerificationPage({ searchParams: Promise.resolve({ result: "closed_unresolved" }) }));
    expect(html).toContain("Associate record and verify"); expect(html).toContain("Close unresolved"); expect(html).not.toContain("Reject and suspend");
    expect(html).not.toContain("textarea"); expect(html).not.toContain("Wafula");
  });
});
