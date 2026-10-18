import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MentorshipPage from "@/app/(alumni)/mentorship/page";
import AlumniProfilePage from "@/app/(alumni)/alumni/[id]/page";
const mocks = vi.hoisted(() => ({ session: vi.fn(), profiles: vi.fn(), notFound: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/alumni-directory", () => ({ alumniProfile: mocks.profiles }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
const user = { role: "alumni", accountStatus: "active", alumniVerified: true };
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ user }); mocks.notFound.mockImplementation(() => { throw new Error("not found"); }); });
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
    for (const text of ["Synthetic Mentor", "Professional story", "AWS careers", "Available for mentorship", "Synthetic demo profile", "Nairobi"]) expect(html).toContain(text);
    for (const text of ["google_subject", "email", "source_hash", "embedding", "password_hash"]) expect(html).not.toContain(text);
    mocks.profiles.mockResolvedValue(null); await expect(AlumniProfilePage({ params: Promise.resolve({ id }) })).rejects.toThrow("not found");
    await expect(AlumniProfilePage({ params: Promise.resolve({ id: "invalid" }) })).rejects.toThrow("not found");
  });
  it("preserves admin profile access and hides mentorship information for ordinary directory alumni", async () => {
    mocks.session.mockResolvedValue({ user: { role: "admin", accountStatus: "active", alumniVerified: false } });
    const id = "11111111-1111-1111-1111-111111111111";
    mocks.profiles.mockResolvedValue({ id, full_name: "Directory Alumnus", skills: [], experience: [], mentorship_available: false });
    const html = renderToStaticMarkup(await AlumniProfilePage({ params: Promise.resolve({ id }) }));
    expect(html).toContain("Directory Alumnus"); expect(html).toContain("Back to Network"); expect(html).toContain("Work experience has not been added yet");
    expect(html).not.toContain("Available for mentorship");
  });

});
