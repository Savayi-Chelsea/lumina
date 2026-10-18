import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { directoryHref, networkReturn, parseDirectoryQuery } from "@/lib/network-query";
import { googleProfileImage, profileInitials } from "@/lib/profile-image";
import { AlumniCard } from "@/components/alumni-card";
import NetworkPage from "@/app/(alumni)/network/page";
import type { AlumniSummary } from "@/lib/alumni-directory";
const mocks = vi.hoisted(() => ({ session: vi.fn(), search: vi.fn(), options: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/alumni-directory", () => ({ searchAlumni: mocks.search, directoryOptions: mocks.options }));
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ user: { role: "alumni", accountStatus: "active", alumniVerified: true } }); mocks.search.mockResolvedValue({ profiles: [], total: 0, page: 1, pages: 1 }); mocks.options.mockResolvedValue({ department: [], industry: [], skill: [], location: [] }); });
describe("Network input and navigation", () => {
 it.each([{ q: ["one", "two"] }, { department: "x".repeat(151) }, { industry: "\n" }, { skill: "x".repeat(101) }, { location: "x".repeat(151) }, { page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "1000000" }, { page: ["1", "2"] }])("rejects malformed filters %j", input => { expect(() => parseDirectoryQuery(input)).toThrow(); });
 it("preserves filters across pagination and safe profile return links", () => {
   const query = parseDirectoryQuery({ q: " Cloud ", department: "ICT / Digital", skill: "AWS", industry: "Technology", location: "Nairobi" });
   const href = directoryHref(query, 2);
   expect(href).toContain("page=2"); expect(href).toContain("department=ICT"); expect(networkReturn(href)).toBe(href);
   for (const bad of ["https://evil.test", "//evil.test", "/network/evil", "/network?page=-1"]) expect(networkReturn(bad)).toBe("/network");
 });
 it("normalizes text and treats injection strings as ordinary text", () => { expect(parseDirectoryQuery({ q: " ' OR 1=1 -- " }).q).toBe("' OR 1=1 --"); });
 it("gates pending and unverified viewers without reading profiles", async () => {
   for (const user of [{ role: "alumni", accountStatus: "pending", alumniVerified: true }, { role: "alumni", accountStatus: "active", alumniVerified: false }]) {
     mocks.session.mockResolvedValue({ user });
     expect(renderToStaticMarkup(await NetworkPage({ searchParams: Promise.resolve({}) }))).toContain("Complete verification");
   }
   expect(mocks.search).not.toHaveBeenCalled();
 });
 it("allows active admins and renders an empty state", async () => {
   mocks.session.mockResolvedValue({ user: { role: "admin", accountStatus: "active", alumniVerified: false } });
   const html = renderToStaticMarkup(await NetworkPage({ searchParams: Promise.resolve({}) }));
   expect(html).toContain("No alumni found"); expect(html).toContain('method="get"'); expect(mocks.search).toHaveBeenCalled();
 });
 it("shows validation feedback before querying", async () => { expect(renderToStaticMarkup(await NetworkPage({ searchParams: Promise.resolve({ page: "-1" }) }))).toContain("Check your Network filters"); expect(mocks.search).not.toHaveBeenCalled(); });
});
describe("professional avatar and card fallbacks", () => {
 it("creates initials and only accepts safe Google image URLs", () => {
   expect(profileInitials("  Amina   Kariuki ")).toBe("AK"); expect(profileInitials(" ")).toBe("L");
   expect(googleProfileImage("https://lh3.googleusercontent.com/photo")).toBeTruthy();
   for (const value of ["http://lh3.googleusercontent.com/photo", "https://googleusercontent.com.evil.test/photo", "https://user@lh3.googleusercontent.com/photo", "javascript:alert(1)"]) expect(googleProfileImage(value)).toBeNull();
 });
 it("renders useful fallbacks without claiming mentorship availability", () => {
   const profile = { id: "id", full_name: "Amina Kariuki", skills: [], mentorship_available: false } as unknown as AlumniSummary;
   const html = renderToStaticMarkup(<AlumniCard profile={profile} />);
   for (const text of ["AK", "Not added yet", "Professional details to come", "View profile"]) expect(html).toContain(text);
   expect(html).not.toContain("Available for mentorship");
 });
});
