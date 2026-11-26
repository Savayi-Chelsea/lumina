import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditProfilePage from "@/app/(alumni)/profile/edit/page";

const mocks = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/profiles", () => ({ getProfile: async () => null }));
vi.mock("@/lib/departments", () => ({ kqDepartments: async () => ["ICT / Digital"] }));
vi.mock("@/app/(alumni)/profile/actions", () => ({ updateProfile: vi.fn() }));

const session = (role: "alumni" | "admin") => ({ user: { id: "id", name: "Grace Example", role, accountStatus: "active", alumniVerified: true } });
beforeEach(() => { mocks.requireSession.mockReset(); });

describe("Delete profile from Profile › Edit", () => {
  it("links members to the existing, safeguarded account deletion and says what it removes", async () => {
    mocks.requireSession.mockResolvedValue(session("alumni"));
    const html = renderToStaticMarkup(await EditProfilePage());
    expect(html).toContain("Delete your profile");
    expect(html).toContain('href="/account/privacy#delete-account"');
    expect(html).toContain("deletes your Lumina account with it");
    expect(html).toContain("can&#x27;t be undone");
  });

  it("does not offer it to administrators, whose accounts can't be deleted there", async () => {
    mocks.requireSession.mockResolvedValue(session("admin"));
    expect(renderToStaticMarkup(await EditProfilePage())).not.toContain("Delete your profile");
  });
});
