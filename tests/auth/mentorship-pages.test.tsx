import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MentorshipPage from "@/app/(alumni)/mentorship/page";
import AlumniProfilePage from "@/app/(alumni)/alumni/[id]/page";
const mocks = vi.hoisted(() => ({ session: vi.fn(), profiles: vi.fn(), notFound: vi.fn(), member: vi.fn(), state: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/alumni-directory", () => ({ alumniProfile: mocks.profiles, relatedAlumni: async () => [] }));
vi.mock("@/lib/social", () => ({ memberByProfile: mocks.member, connectionState: mocks.state, connectionCount: async () => 4 }));
vi.mock("@/lib/messages", () => ({ canMessage: async () => false }));
vi.mock("@/lib/mentorship-requests", () => ({ mentorshipWith: async () => null }));
vi.mock("@/lib/db", () => ({ database: () => ({}) }));
vi.mock("@/app/(alumni)/social-actions", () => ({ connect: vi.fn(), answerConnection: vi.fn(), startConversation: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
const user = { role: "alumni", accountStatus: "active", alumniVerified: true };
beforeEach(() => {
  vi.resetAllMocks(); mocks.session.mockResolvedValue({ user: { ...user, id: "viewer" } }); mocks.notFound.mockImplementation(() => { throw new Error("not found"); });
  mocks.member.mockResolvedValue({ user_id: "internal-user-7f3c" }); mocks.state.mockResolvedValue({ state: "none", id: null });
});
describe("mentorship page access and profile presentation", () => {
  it("renders the real natural language form only for authorized users", async () => {
    const html = renderToStaticMarkup(await MentorshipPage());
    expect(html).toContain("Find mentors"); expect(html).toMatch(/maxlength="500"/i); expect(html).toContain("0 / 500 characters"); expect(html).toContain("AWS cloud engineering");
    mocks.session.mockResolvedValue({ user: { ...user, accountStatus: "pending" } });
    const gated = renderToStaticMarkup(await MentorshipPage()); expect(gated).toContain('href="/verify"'); expect(gated).not.toContain("Find mentors");
  });
  it("requires authentication and gates direct profile access before reading data", async () => {
    mocks.session.mockRejectedValue(new Error("sign in")); await expect(MentorshipPage()).rejects.toThrow("sign in");
    mocks.session.mockResolvedValue({ user: { ...user, alumniVerified: false } });
    const html = renderToStaticMarkup(await AlumniProfilePage({ params: Promise.resolve({ id: "private" }) }));
    expect(html).toContain("Complete verification"); expect(mocks.profiles).not.toHaveBeenCalled();
  });
  it("opens a fuller opted-in profile and handles absent/withdrawn profiles safely", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    mocks.profiles.mockResolvedValue({ experience: [], mentorship_available: true, id, full_name: "Synthetic Mentor", headline: "Cloud engineering", biography: "Professional story", former_kq_role: "Engineer", former_kq_department: "ICT / Digital", kq_start_year: 2000, kq_end_year: 2010, current_job_title: "Cloud Engineer", current_organization: "Example", location: "Nairobi", industry: "Technology", mentorship_topics: "AWS careers", skills: ["AWS"], synthetic: true });
    const html = renderToStaticMarkup(await AlumniProfilePage({ params: Promise.resolve({ id }) }));
    for (const text of ["Synthetic Mentor", "Professional story", "AWS careers", "Open to mentoring", "Request mentorship", "Connect", "4 connections", "Nairobi"]) expect(html).toContain(text);
    expect(html).not.toContain("Synthetic demo profile");
    for (const text of ["google_subject", "email", "source_hash", "embedding", "password_hash", "internal-user-7f3c"]) expect(html).not.toContain(text);
    mocks.profiles.mockResolvedValue(null); await expect(AlumniProfilePage({ params: Promise.resolve({ id }) })).rejects.toThrow("not found");
    await expect(AlumniProfilePage({ params: Promise.resolve({ id: "invalid" }) })).rejects.toThrow("not found");
  });
  it("preserves admin profile access and hides mentorship information for ordinary directory alumni", async () => {
    mocks.session.mockResolvedValue({ user: { role: "admin", accountStatus: "active", alumniVerified: false } });
    const id = "11111111-1111-1111-1111-111111111111";
    mocks.profiles.mockResolvedValue({ id, full_name: "Directory Alumnus", skills: [], experience: [], mentorship_available: false });
    const html = renderToStaticMarkup(await AlumniProfilePage({ params: Promise.resolve({ id }) }));
    expect(html).toContain("Directory Alumnus"); expect(html).toContain("Back to Network"); expect(html).toContain("No experience added yet");
    expect(html).not.toContain("Open to mentoring"); expect(html).not.toContain("Request mentorship");
  });

});
