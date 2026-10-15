import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitVerification, submitAssistance } from "@/app/(alumni)/verify/actions";
import { reviewVerification } from "@/app/admin/verification/actions";

const mocks = vi.hoisted(() => ({ requireSession: vi.fn(), requireAdmin: vi.fn(), verify: vi.fn(), request: vi.fn(), resolve: vi.fn(), redirect: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: mocks.requireSession, requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/verification", () => ({ verifyAlumni: mocks.verify, requestAssistance: mocks.request, resolveAssistance: mocks.resolve }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const previous = { message: "" };
function data() {
  const form = new FormData();
  for (const [key,value] of Object.entries({ staff_number: "SYN-ALUM-001", surname: "Wafula", department: "Safety & Quality", start_year: "2008", end_year: "2016" })) form.set(key,value);
  return form;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireSession.mockResolvedValue({ user: { id: "user" } });
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin" } });
  mocks.redirect.mockImplementation(path => { throw new Error(`redirect:${path}`); });
});
describe("self-service verification actions", () => {
  it("requires authentication before validation or writes", async () => {
    mocks.requireSession.mockRejectedValue(new Error("signin"));
    await expect(submitVerification(previous,data())).rejects.toThrow("signin");
    await expect(submitAssistance(previous)).rejects.toThrow("signin");
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("validates server-side before querying the registry", async () => {
    expect((await submitVerification(previous,new FormData())).message).toContain("staff number");
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("returns friendly unresolved feedback and does not create an assistance request", async () => {
    mocks.verify.mockResolvedValue("unresolved");
    const result = await submitVerification(previous,data());
    expect(result.message).toContain("try again"); expect(result.message).toContain("has not been suspended");
    expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("redirects successful verification to profile completion", async () => {
    mocks.verify.mockResolvedValue("verified");
    await expect(submitVerification(previous,data())).rejects.toThrow("redirect:/profile?verified=1");
    expect(mocks.revalidate).toHaveBeenCalledWith("/");
  });
  it("does not leak database errors or registry details", async () => {
    mocks.verify.mockRejectedValue(new Error("secret staff claimant-id SQL"));
    const result = await submitVerification(previous,data());
    expect(result.message).toContain("temporarily unavailable"); expect(result.message).not.toContain("secret");
  });
  it("creates assistance only when explicitly requested and handles failures", async () => {
    mocks.request.mockResolvedValue(true);
    expect((await submitAssistance(previous)).message).toContain("Assistance requested");
    mocks.request.mockRejectedValue(new Error("private"));
    expect((await submitAssistance(previous)).message).toContain("could not be saved");
  });
});
describe("admin exception actions", () => {
  it("requires admin authorization before resolution", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("forbidden"));
    await expect(reviewVerification(new FormData())).rejects.toThrow("forbidden");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation for registry association", async () => {
    const form = data(); form.set("user_id","target"); form.set("outcome","verified");
    await expect(reviewVerification(form)).rejects.toThrow("result=invalid");
    expect(mocks.resolve).not.toHaveBeenCalled();
    form.set("confirm_association","yes"); mocks.resolve.mockResolvedValue(true);
    await expect(reviewVerification(form)).rejects.toThrow("result=verified");
    expect(mocks.resolve).toHaveBeenCalledWith("target","verified","SYN-ALUM-001");
  });
  it("closes unresolved without a staff record or suspension decision", async () => {
    const form = new FormData(); form.set("user_id","target"); form.set("outcome","closed_unresolved"); mocks.resolve.mockResolvedValue(true);
    await expect(reviewVerification(form)).rejects.toThrow("result=closed_unresolved");
    expect(mocks.resolve).toHaveBeenCalledWith("target","closed_unresolved",undefined);
    form.set("outcome","reject"); await expect(reviewVerification(form)).rejects.toThrow("result=invalid");
  });
});
