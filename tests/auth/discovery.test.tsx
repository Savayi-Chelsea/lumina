import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LuminaLogo } from "@/components/lumina-logo";
import { AlumniHome } from "@/components/alumni-home";
import { CommunityExplorer } from "@/components/community-explorer";
import { profileProgress } from "@/lib/profile-progress";
import type { Profile } from "@/lib/profiles";

vi.mock("@/app/auth-actions", () => ({ logOut: vi.fn(), googleSignIn: vi.fn() }));

describe("Lumina discovery presentation", () => {
  it("supports all logo variants and optional approved local assets", () => {
    for (const variant of ["full", "wordmark", "compact"] as const) {
      const html = renderToStaticMarkup(<LuminaLogo variant={variant} />);
      expect(html).toContain("Lumina"); expect(html).not.toContain("brand-path"); expect(html).not.toContain("8599");
    }
    const html = renderToStaticMarkup(<LuminaLogo variant="wordmark" assets={{ wordmark: { src: "/approved-logo.svg", width: 150, height: 40 } }} />);
    expect(html).toContain("/approved-logo.svg"); expect(html).toContain('alt="Lumina"');
  });
  it("calculates detail completion from saved fields without changing the core completion flag", () => {
    expect(profileProgress(null)).toEqual({ completed: 0, total: 11, percentage: 0 });
    const profile = { full_name: "Member", headline: "  ", kq_start_year: 2000, profile_completed: true } as Profile;
    expect(profileProgress(profile)).toEqual({ completed: 2, total: 11, percentage: 18 });
    expect(profile.profile_completed).toBe(true);
  });
  it("includes all discovery sections with explicit fixture disclosures and real progress", () => {
    const html = renderToStaticMarkup(<AlumniHome user={{ id: "id", name: "Real Name", role: "alumni", accountStatus: "active", alumniVerified: true }} profile={null} />);
    for (const text of ["Real Name", "0 of 11", "Recommended mentors preview", "Suggested alumni preview", "Upcoming events preview", "Fictional opportunities", "ALUMNI SPOTLIGHT", "There is no live activity feed yet", "not personalized matches"]) expect(html).toContain(text);
    expect(html).not.toContain("95% match"); expect(html).not.toContain("Connect now");
  });
  it("keeps pending verification authoritative even when the verification flag is true", () => {
    const html = renderToStaticMarkup(<AlumniHome user={{ id: "id", role: "alumni", accountStatus: "pending", alumniVerified: true }} profile={null} />);
    expect(html).not.toContain("Verified by Lumina"); expect(html).toContain('href="/verify"');
  });
  it("labels each discovery page as a preview rather than live backend functionality", () => {
    for (const section of ["network", "events", "opportunities"] as const) {
      const html = renderToStaticMarkup(<CommunityExplorer section={section} />);
      expect(html).toContain("Demo preview"); expect(html).toContain("not available");
      expect(html).toContain('aria-pressed="true"');
    }
  });
});
