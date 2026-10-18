import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mentorship/search/route";
import { MatchingQueryRejected } from "@/lib/mentor-search";
const mocks = vi.hoisted(() => ({ session: vi.fn(), search: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ currentSession: mocks.session }));
vi.mock("@/lib/mentor-search", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/mentor-search")>(), searchMentors: mocks.search }));
function request(body: unknown = { query: "AWS and DevOps" }, headers: Record<string,string> = {}) {
  return new Request("http://lumina.test/api/mentorship/search",{ method: "POST", headers: { "Content-Type": "application/json", Origin: "http://lumina.test", ...headers }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "http://lumina.test");
  vi.resetAllMocks(); mocks.session.mockResolvedValue({ user: { role: "alumni", accountStatus: "active", alumniVerified: true } }); mocks.search.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("authenticated mentorship proxy", () => {
  it("rejects anonymous and pending users before calling matching", async () => {
    mocks.session.mockResolvedValue(null); expect((await POST(request())).status).toBe(401);
    mocks.session.mockResolvedValue({ user: { role: "alumni", accountStatus: "pending", alumniVerified: true } }); expect((await POST(request())).status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("returns results with no-store and uses the validated query", async () => {
    const response = await POST(request({ query: " AWS  and DevOps " }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ results: [] });
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(mocks.search).toHaveBeenCalledWith("AWS and DevOps");
  });
  it("validates payload, raw size, content type and origin on the server", async () => {
    for (const body of [{}, [], { query: 123 }, { query: " " }, { query: "a".repeat(501) }, { query: "AWS", similarity_threshold: -1 }, { query: "AWS", private: "x".repeat(5000) }]) expect((await POST(request(body))).status).toBe(400);
    expect((await POST(request(undefined,{ "Content-Type": "text/plain" }))).status).toBe(400);
    expect((await POST(request(undefined,{ Origin: "http://other.test" }))).status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("does not leak errors or raw service diagnostics", async () => {
    mocks.search.mockRejectedValue(new Error("SQL password vector internal-host"));
    const response = await POST(request()); expect(response.status).toBe(503);
    const text = await response.text(); expect(text).toContain("SERVICE_UNAVAILABLE"); expect(text).not.toMatch(/SQL|password|vector|internal-host/);
    mocks.search.mockRejectedValue(new MatchingQueryRejected()); expect((await POST(request())).status).toBe(400);
  });
  it("accepts the configured public origin with unrelated internal and forwarded hosts", async () => {
    const incoming = new Request("http://localhost:3000/api/mentorship/search",{ method: "POST",headers: { "Content-Type": "application/json",Host: "internal:4567", Origin: "http://lumina.test", "X-Forwarded-Host": "evil.test", "X-Forwarded-Proto": "https" },body: JSON.stringify({ query: "AWS" }) });
    expect((await POST(incoming)).status).toBe(200);
  });
  it.each(["null", "garbage", "https://[", "http://lumina.test/path", "http://lumina.test?x", "http://lumina.test#", "http://user@lumina.test", "http://lumina.test, http://evil.test", "https://lumina.test", "http://lumina.test:3001"])("rejects invalid or different Origin %s", async origin => {
    expect((await POST(request(undefined, { Origin: origin, Host: "evil.test", "X-Forwarded-Host": "lumina.test" }))).status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("rejects missing Origin even with same-origin fetch metadata", async () => {
    const incoming = request(undefined, { "Sec-Fetch-Site": "same-origin" });
    incoming.headers.delete("origin");
    expect((await POST(incoming)).status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("does not trust an external Origin matching forged host headers", async () => {
    expect((await POST(request(undefined, { Origin: "https://evil.test", Host: "evil.test", "X-Forwarded-Host": "evil.test", "X-Forwarded-Proto": "https" }))).status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it.each(["HTTP://LUMINA.TEST:80", "https://LUMINA.TEST:443/"])("normalizes scheme, hostname and default ports: %s", async configured => {
    vi.stubEnv("APP_ORIGIN", configured);
    expect((await POST(request(undefined, { Origin: configured.startsWith("HTTP:") ? "http://lumina.test" : "https://lumina.test" }))).status).toBe(200);
  });
  it.each([undefined, "", "not-an-origin", "ftp://lumina.test", "https://secret@lumina.test", "https://lumina.test/path", "https://lumina.test?", "https://lumina.test#", " https://lumina.test", "https://lumina.test\\evil"])("fails safely for invalid APP_ORIGIN (%s)", async configured => {
    vi.stubEnv("APP_ORIGIN", configured);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: { code: "SERVICE_UNAVAILABLE", message: "Mentor discovery is temporarily unavailable. Please try again shortly." } });
      expect(log).toHaveBeenCalledExactlyOnceWith("Mentorship unavailable: APP_ORIGIN is missing or invalid.");
      expect(mocks.search).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
  it("preserves active admin access without alumni verification", async () => {
    mocks.session.mockResolvedValue({ user: { role: "admin", accountStatus: "active", alumniVerified: false } });
    expect((await POST(request())).status).toBe(200);
  });
  it("denies active unverified alumni", async () => {
    mocks.session.mockResolvedValue({ user: { role: "alumni", accountStatus: "active", alumniVerified: false } });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });

});
