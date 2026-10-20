import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LuminaLogo } from "@/components/lumina-logo";
import { AlumniHome } from "@/components/alumni-home";
import type { CommunityEvent, Opportunity } from "@/lib/community";
import { profileProgress } from "@/lib/profile-progress";
import type { Profile } from "@/lib/profiles";

vi.mock("@/app/auth-actions", () => ({ logOut: vi.fn(), googleSignIn: vi.fn() }));

describe("Lumina discovery presentation", () => {
  it("uses the final supplied logo in every size variant", () => {
    for (const variant of ["full", "wordmark", "compact"] as const) {
      const html = renderToStaticMarkup(<LuminaLogo variant={variant} />);
      expect(html).toContain("LuminaLogo"); expect(html).toContain('alt="Lumina"'); expect(html).not.toContain("logo-type");
    }
  });
  it("calculates detail completion from saved fields without changing the core completion flag", () => {
    expect(profileProgress(null)).toEqual({ completed: 0, total: 11, percentage: 0 });
    const profile = { full_name: "Member", headline: "  ", kq_start_year: 2000, profile_completed: true } as Profile;
    expect(profileProgress(profile)).toEqual({ completed: 2, total: 11, percentage: 18 });
    expect(profile.profile_completed).toBe(true);
  });
  it("includes all discovery sections with explicit fixture disclosures and real progress", () => {
    const html = renderToStaticMarkup(<AlumniHome user={{ id: "id", name: "Real Name", role: "alumni", accountStatus: "active", alumniVerified: true }} profile={null} />);
    for (const text of ["Real Name", "0 of 11", "Find a mentor", "Explore alumni", "No upcoming events yet", "No open opportunities right now", "Stay close to"]) expect(html).toContain(text);
    expect(html).not.toContain("95% match"); expect(html).not.toContain("Connect now");
  });
  it("keeps pending verification authoritative even when the verification flag is true", () => {
    const html = renderToStaticMarkup(<AlumniHome user={{ id: "id", role: "alumni", accountStatus: "pending", alumniVerified: true }} profile={null} />);
    expect(html).not.toContain("Verified by Lumina"); expect(html).toContain('href="/verify"');
  });
  it("shows real community listings on Home without demo labels", () => {
    const event = { id: "5b0e3c1e-0000-4000-8000-000000000001", title: "Engineering reunion", summary: "Old hangar stories.", description: "", category: "Reunion", format: "in_person", location: "Nairobi", starts_at: "2030-01-10T15:00:00Z", ends_at: "2030-01-10T18:00:00Z", capacity: 40, status: "published", synthetic: true, registration_count: 3, registered: false, updated_at: "" } as unknown as CommunityEvent;
    const opportunity = { id: "5b0e3c1e-0000-4000-8000-000000000002", title: "Ops advisor", organization: "Example Org", opportunity_type: "Advisory", work_mode: "hybrid", location: "Nairobi", industry: null, summary: "Advise.", description: "", how_to_apply: "Email.", closes_on: null, status: "published", synthetic: false, created_at: "" } as unknown as Opportunity;
    const html = renderToStaticMarkup(<AlumniHome user={{ id: "id", role: "alumni", accountStatus: "active", alumniVerified: true }} profile={null} events={[event]} opportunities={[opportunity]} />);
    for (const text of ["Engineering reunion", "Thu, 10 Jan 2030, 18:00 – 21:00 EAT", "3 attending · 37 places left", "Ops advisor", "Open until filled", `/events/${event.id}`, `/opportunities/${opportunity.id}`]) expect(html).toContain(text);
    expect(html).not.toContain("Sample listing");
  });
  it("hides community listings from alumni awaiting verification", () => {
    const html = renderToStaticMarkup(<AlumniHome user={{ id: "id", role: "alumni", accountStatus: "pending", alumniVerified: false }} profile={null} />);
    expect(html).toContain("see upcoming gatherings"); expect(html).toContain("explore opportunities shared");
  });
});
