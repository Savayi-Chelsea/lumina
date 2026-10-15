import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mentorship/search/route";
import { MatchingQueryRejected } from "@/lib/mentor-search";
const mocks = vi.hoisted(() => ({ session: vi.fn(), search: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ currentSession: mocks.session }));
vi.mock("@/lib/mentor-search", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/mentor-search")>(), searchMentors: mocks.search }));
function request(body: unknown = { query: "AWS and DevOps" }, headers: Record<string,string> = {}) {
  return new Request("http://lumina.test/api/mentorship/search",{ method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.session.mockResolvedValue({ user: { role: "alumni", accountStatus: "active", alumniVerified: true } }); mocks.search.mockResolvedValue([]);
});
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
  it("accepts the public Host when Next constructs an internal request URL", async () => {
    const incoming = new Request("http://localhost:3000/api/mentorship/search",{ method: "POST",headers: { "Content-Type": "application/json",Host: "127.0.0.1:4567",Origin: "http://127.0.0.1:4567" },body: JSON.stringify({ query: "AWS" }) });
    expect((await POST(incoming)).status).toBe(200);
  });
});
