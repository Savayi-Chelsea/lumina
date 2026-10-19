import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completePasswordReset, requestPasswordReset } from "@/app/password-actions";
import { MAX_RESET_REQUESTS, signInThrottle } from "@/lib/sign-in-throttle";

const mocks = vi.hoisted(() => ({ after: vi.fn(), redirect: vi.fn(), configured: vi.fn(), sendMail: vi.fn(), issue: vi.fn(), consume: vi.fn(), hash: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/mailer", () => ({ isEmailConfigured: mocks.configured, sendMail: mocks.sendMail }));
vi.mock("@/lib/password-reset", async () => ({ ...(await vi.importActual<object>("@/lib/password-reset")), issueResetToken: mocks.issue, consumeResetToken: mocks.consume }));
vi.mock("@/lib/passwords", () => ({ hashPassword: mocks.hash }));
vi.mock("@/lib/db", () => ({ database: vi.fn() }));

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const runAfter = async () => { for (const [task] of mocks.after.mock.calls) await task(); };

beforeEach(() => { vi.stubEnv("APP_ORIGIN", "http://localhost:3000"); mocks.configured.mockReturnValue(true); mocks.hash.mockResolvedValue("$argon2id$new"); });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

describe("password reset request", () => {
  it("returns the same response for existing and unknown accounts and emails only real ones", async () => {
    mocks.issue.mockResolvedValueOnce("t".repeat(43)).mockResolvedValueOnce(null);
    const known = await requestPasswordReset({ message: "" }, form({ email: "Member@Example.com" }));
    const unknown = await requestPasswordReset({ message: "" }, form({ email: "nobody@example.com" }));
    expect(known).toEqual(unknown);
    expect(mocks.issue).not.toHaveBeenCalled();
    await runAfter();
    expect(mocks.issue).toHaveBeenCalledWith("member@example.com");
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const mail = mocks.sendMail.mock.calls[0][0];
    expect(mail.to).toBe("member@example.com");
    expect(mail.text).toContain(`http://localhost:3000/reset-password#token=${"t".repeat(43)}`);
    expect(mail.text).not.toContain("?token=");
  });

  it("limits repeated requests per email without changing the response", async () => {
    mocks.issue.mockResolvedValue(null);
    for (let i = 0; i < MAX_RESET_REQUESTS + 2; i++) expect((await requestPasswordReset({ message: "" }, form({ email: "limit@example.com" }))).sent).toBe(true);
    expect(mocks.after).toHaveBeenCalledTimes(MAX_RESET_REQUESTS);
  });

  it("does not leak delivery failures", async () => {
    mocks.issue.mockResolvedValue("t".repeat(43));
    mocks.sendMail.mockRejectedValue(new Error("smtp password rejected for user@host"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await requestPasswordReset({ message: "" }, form({ email: "fail@example.com" }))).sent).toBe(true);
      await runAfter();
      expect(JSON.stringify(log.mock.calls)).not.toContain("smtp password");
    } finally { log.mockRestore(); }
  });

  it("validates the email and respects missing email configuration", async () => {
    expect((await requestPasswordReset({ message: "" }, form({ email: "nope" }))).message).toContain("valid email");
    mocks.configured.mockReturnValue(false);
    expect((await requestPasswordReset({ message: "" }, form({ email: "a@b.example" }))).message).toContain("not available");
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

describe("password reset completion", () => {
  const valid = { token: "t".repeat(43), password: "brand new passphrase", confirm_password: "brand new passphrase" };

  it("sets the new password, clears sign-in lockout and returns to sign in", async () => {
    mocks.consume.mockResolvedValue("member@example.com");
    for (let i = 0; i < 5; i++) signInThrottle().recordFailure("member@example.com");
    mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
    await expect(completePasswordReset({ message: "" }, form(valid))).rejects.toThrow("redirect");
    expect(mocks.consume).toHaveBeenCalledWith(valid.token, "$argon2id$new");
    expect(mocks.redirect).toHaveBeenCalledWith("/sign-in?reset=1");
    expect(signInThrottle().isLimited("member@example.com")).toBe(false);
  });

  it("explains invalid or expired links", async () => {
    mocks.consume.mockResolvedValue(null);
    expect((await completePasswordReset({ message: "" }, form(valid))).message).toContain("invalid, already used or expired");
  });

  it.each([
    [{ token: "" }, "incomplete"],
    [{ password: "short", confirm_password: "short" }, "at least 10"],
    [{ confirm_password: "a different phrase" }, "do not match"],
  ])("rejects %o before touching tokens", async (override, message) => {
    expect((await completePasswordReset({ message: "" }, form({ ...valid, ...override }))).message).toContain(message);
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});
