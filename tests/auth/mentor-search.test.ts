import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchMentors, parseServiceResults, MatchingUnavailable, MatchingQueryRejected } from "@/lib/mentor-search";
import { validateMentorQuery, canDiscoverMentors } from "@/lib/mentorship-contract";
const mocks = vi.hoisted(() => ({ profiles: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/mentor-profiles", () => ({ discoverableMentors: mocks.profiles }));
const first = "11111111-1111-1111-1111-111111111111";
const second = "22222222-2222-2222-2222-222222222222";
const row = (id = first, score = .72) => ({ profile_id: id, headline: "Cloud engineer", former_kq_role: "Systems Administrator", former_kq_department: "ICT / Digital", current_job_title: "Cloud Engineer", current_organization: "Example Organization", relevant_skills: ["AWS", "Docker"], similarity_score: score });
const payload = (results: unknown[] = [row()]) => ({ results, top_k: 5, similarity_threshold: .5 });
beforeEach(() => {
  vi.stubEnv("MATCHING_SERVICE_URL", "http://matching.internal:8000");
  vi.stubEnv("MATCHING_SERVICE_TIMEOUT_MS", "60000");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload())));
  mocks.profiles.mockResolvedValue([{ id: first, full_name: "Alumni One", synthetic: true }, { id: second, full_name: "Alumni Two", synthetic: false }]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("mentorship access and input", () => {
  it("accepts normalized natural language and exactly 500 characters", () => {
    expect(validateMentorQuery("  AWS\n and  DevOps ")).toBe("AWS and DevOps");
    expect(validateMentorQuery("a".repeat(500))).toHaveLength(500);
    expect(validateMentorQuery("😀".repeat(500))).toHaveLength(1000);
  });
  it("rejects blank, nonstring, oversized raw input and invisible characters", () => {
    for (const value of [null, 1, {}, " \n ", "a".repeat(501), " ".repeat(501), "AWS\u200b", "AWS\0"]) expect(() => validateMentorQuery(value)).toThrow();
  });
  it("requires active verified alumni, permits active support admins, and denies suspended users", () => {
    expect(canDiscoverMentors({ role: "alumni", accountStatus: "pending", alumniVerified: true })).toBe(false);
    expect(canDiscoverMentors({ role: "alumni", accountStatus: "active", alumniVerified: false })).toBe(false);
    expect(canDiscoverMentors({ role: "alumni", accountStatus: "active", alumniVerified: true })).toBe(true);
    expect(canDiscoverMentors({ role: "admin", accountStatus: "active", alumniVerified: false })).toBe(true);
    expect(canDiscoverMentors({ role: "admin", accountStatus: "suspended", alumniVerified: true })).toBe(false);
  });
});

describe("server-side matching integration", () => {
  it("calls only the configured service with validated query and server settings", async () => {
    const result = await searchMentors(" AWS  and DevOps ");
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("http://matching.internal:8000/mentors/search");
    expect(options).toMatchObject({ method: "POST", cache: "no-store", redirect: "error", body: JSON.stringify({ query: "AWS and DevOps" }) });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(result[0]).toMatchObject({ name: "Alumni One", matchRelevance: .72, availableForMentorship: true });
  });
  it("preserves ranked order while enriching names and allowlisting output", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(payload([{ ...row(first,.8), source_hash: "secret", embedding: [1], sql: "SELECT secret" },row(second,.7)])));
    mocks.profiles.mockResolvedValue([{ id: second, full_name: "Second", synthetic: false }, { id: first, full_name: "First", synthetic: true }]);
    const results = await searchMentors("Cloud engineering");
    expect(results.map(value => value.name)).toEqual(["First", "Second"]);
    expect(results.map(value => value.matchRelevance)).toEqual([.8,.7]);
    const serialized = JSON.stringify(results);
    for (const privateValue of ["source_hash", "embedding", "SELECT secret", "matching.internal", "model_name"]) expect(serialized).not.toContain(privateValue);
  });
  it("handles no matches without querying profiles", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(payload([])));
    mocks.profiles.mockResolvedValue([]);
    expect(await searchMentors("rare goal")).toEqual([]);
    expect(mocks.profiles).toHaveBeenCalledWith([]);
  });
  it("suppresses mentors whose consent, availability or account access changed", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(payload([row(first,.8),row(second,.7)])));
    mocks.profiles.mockResolvedValue([{ id: second, full_name: "Still available", synthetic: false }]);
    expect((await searchMentors("AWS")).map(item => item.profileId)).toEqual([second]);
  });
  it("fails safely for timeouts, service errors, HTML and invalid JSON", async () => {
    for (const response of [new Response("secret SQL",{ status: 503 }), new Response("<html>internal</html>",{ headers: { "Content-Type": "text/html" } }), new Response("{",{ headers: { "Content-Type": "application/json" } })]) {
      vi.mocked(fetch).mockResolvedValue(response); await expect(searchMentors("AWS")).rejects.toBeInstanceOf(MatchingUnavailable);
    }
    vi.mocked(fetch).mockRejectedValue(new DOMException("secret internal host","TimeoutError"));
    await expect(searchMentors("AWS")).rejects.toBeInstanceOf(MatchingUnavailable);
  });
  it("maps service token/input rejection without exposing backend detail", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ detail: "secret model internals" },{ status: 422 }));
    await expect(searchMentors("AWS")).rejects.toBeInstanceOf(MatchingQueryRejected);
  });
  it("requires server configuration and validates before network access", async () => {
    vi.stubEnv("MATCHING_SERVICE_URL", ""); await expect(searchMentors("AWS")).rejects.toBeInstanceOf(MatchingUnavailable);
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("MATCHING_SERVICE_URL", "file:///etc/private"); await expect(searchMentors("AWS")).rejects.toBeInstanceOf(MatchingUnavailable);
    await expect(searchMentors(" ")).rejects.toThrow("Describe"); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed results, invalid IDs, duplicates, scores and broken ranking", () => {
    const invalid: unknown[] = [null, {}, { ...payload(), top_k: 0 }, { ...payload(), similarity_threshold: "0.5" },
      payload([{ ...row(), profile_id: "not-a-uuid" }]), payload([{ ...row(), relevant_skills: [123] } as never]),
      payload([{ ...row(), headline: 123 } as never]), payload([{ ...row(), similarity_score: NaN }]),
      payload([{ ...row(), similarity_score: 1.1 }]), payload([row(first,.7),row(first,.6)]),
      payload([row(first,.7),row(second,.8)])];
    for (const value of invalid) expect(() => parseServiceResults(value)).toThrow(MatchingUnavailable);
  });
});
