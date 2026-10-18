import { describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { normalizeEmail, parseRegistration, parseSignIn } from "@/lib/credentials-input";
import { createSignInThrottle, MAX_FAILURES, WINDOW_MS } from "@/lib/sign-in-throttle";
import { authorizePassword } from "@/lib/auth-config";

vi.mock("server-only", () => ({}));

const PASSWORD = "harbour lights at dawn";
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const valid = { full_name: "  Amina   Otieno ", email: " Amina.Otieno@Example.COM ", password: PASSWORD, confirm_password: PASSWORD };

describe("Argon2id password hashing", () => {
  it("stores a salted PHC hash and never the plaintext", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(hash).not.toContain(PASSWORD);
    expect(await hashPassword(PASSWORD)).not.toBe(hash);
  });

  it("verifies only the correct password", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
    expect(await verifyPassword("harbour lights at dusk", hash)).toBe(false);
    expect(await verifyPassword(PASSWORD.toUpperCase(), hash)).toBe(false);
  });

  it("never verifies Google-only, synthetic non-login or tampered hashes", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, null)).toBe(false);
    expect(await verifyPassword("synthetic_not_for_login", "synthetic_not_for_login")).toBe(false);
    expect(await verifyPassword(PASSWORD, hash.replace("m=19456", "m=999999"))).toBe(false);
    expect(await verifyPassword(PASSWORD, hash.replace("argon2id", "argon2i"))).toBe(false);
    expect(await verifyPassword(PASSWORD, PASSWORD)).toBe(false);
  });
});

describe("credential input", () => {
  it("normalizes registration details", () => {
    expect(parseRegistration(form(valid))).toEqual({ ok: true, value: { fullName: "Amina Otieno", email: "amina.otieno@example.com", password: PASSWORD } });
    expect(normalizeEmail("  Person@Mail.Example ")).toBe("person@mail.example");
  });

  it.each([
    [{ full_name: " " }, "Enter your full name."],
    [{ full_name: "x".repeat(151) }, "no more than 150"],
    [{ email: "not-an-email" }, "valid email"],
    [{ email: "person@localhost" }, "valid email"],
    [{ email: `${"a".repeat(250)}@x.com` }, "valid email"],
    [{ password: "short", confirm_password: "short" }, "at least 10"],
    [{ password: "x".repeat(129), confirm_password: "x".repeat(129) }, "no more than 128"],
    [{ password: " ".repeat(12), confirm_password: " ".repeat(12) }, "only spaces"],
    [{ confirm_password: "a different phrase" }, "do not match"],
  ])("rejects %o", (override, message) => {
    const result = parseRegistration(form({ ...valid, ...override }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(message);
  });

  it("accepts long passphrases without composition rules", () => {
    expect(parseRegistration(form({ ...valid, password: "all lowercase words", confirm_password: "all lowercase words" })).ok).toBe(true);
  });

  it("shape-checks sign-in without exposing the password policy", () => {
    expect(parseSignIn({ email: "A@B.example", password: "short" })).toEqual({ email: "a@b.example", password: "short" });
    expect(parseSignIn({ email: "bad", password: PASSWORD })).toBeNull();
    expect(parseSignIn({ email: "a@b.example", password: "" })).toBeNull();
    expect(parseSignIn({ email: "a@b.example", password: 42 })).toBeNull();
    expect(parseSignIn(undefined)).toBeNull();
  });
});

describe("sign-in throttle", () => {
  it("limits repeated failures per email within the window and resets on success", () => {
    let time = 0;
    const throttle = createSignInThrottle(() => time);
    for (let i = 0; i < MAX_FAILURES; i++) { expect(throttle.isLimited("a@b.example")).toBe(false); throttle.recordFailure("a@b.example"); }
    expect(throttle.isLimited("a@b.example")).toBe(true);
    expect(throttle.isLimited("other@b.example")).toBe(false);
    time += WINDOW_MS;
    expect(throttle.isLimited("a@b.example")).toBe(false);
    throttle.recordFailure("a@b.example"); throttle.reset("a@b.example");
    expect(throttle.isLimited("a@b.example")).toBe(false);
  });
});

describe("password authorization", () => {
  const id = "00000000-0000-0000-0000-000000000009";
  const setup = async (account: Record<string, unknown> | null) => {
    const store = { findPasswordAccount: vi.fn().mockResolvedValue(account) };
    return { store, throttle: createSignInThrottle() };
  };

  it("authorizes the correct password and returns only public identity", async () => {
    const { store, throttle } = await setup({ id, account_status: "pending", password_hash: await hashPassword(PASSWORD), full_name: "Amina Otieno" });
    const user = await authorizePassword(store, { email: " Member@Example.com ", password: PASSWORD }, throttle);
    expect(user).toEqual({ id, name: "Amina Otieno", email: "member@example.com" });
    expect(store.findPasswordAccount).toHaveBeenCalledWith("member@example.com");
    expect(JSON.stringify(user)).not.toContain("argon2");
  });

  it("returns the same null for wrong passwords, unknown emails, Google-only and suspended accounts", async () => {
    const hash = await hashPassword(PASSWORD);
    for (const account of [
      { id, account_status: "active", password_hash: hash, full_name: null },
      null,
      { id, account_status: "pending", password_hash: null, full_name: null },
      { id, account_status: "suspended", password_hash: hash, full_name: null },
    ]) {
      const { store, throttle } = await setup(account);
      const password = account?.account_status === "active" ? "the wrong passphrase" : PASSWORD;
      expect(await authorizePassword(store, { email: "member@example.com", password }, throttle)).toBeNull();
    }
  });

  it("stops checking passwords once the email is rate limited", async () => {
    const { store, throttle } = await setup({ id, account_status: "active", password_hash: await hashPassword(PASSWORD), full_name: null });
    for (let i = 0; i < MAX_FAILURES; i++) await authorizePassword(store, { email: "member@example.com", password: "wrong passphrase" }, throttle);
    store.findPasswordAccount.mockClear();
    expect(await authorizePassword(store, { email: "member@example.com", password: PASSWORD }, throttle)).toBeNull();
    expect(store.findPasswordAccount).not.toHaveBeenCalled();
  });

  it("rejects malformed input before touching storage", async () => {
    const { store, throttle } = await setup(null);
    expect(await authorizePassword(store, { email: "nope", password: PASSWORD }, throttle)).toBeNull();
    expect(store.findPasswordAccount).not.toHaveBeenCalled();
  });
});
