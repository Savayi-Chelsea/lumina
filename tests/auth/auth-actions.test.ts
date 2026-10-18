import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError, CredentialsSignin } from "@auth/core/errors";
import { googleSignIn, logOut, passwordSignIn, registerAccount } from "@/app/auth-actions";
import { signInThrottle, MAX_FAILURES } from "@/lib/sign-in-throttle";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn(), configured: vi.fn(), authConfigured: vi.fn(), redirect: vi.fn(), createPasswordUser: vi.fn(), hashPassword: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ signIn: mocks.signIn, signOut: mocks.signOut }));
// Load the error class without importing Next.js runtime helpers in the unit runner.
vi.mock("next-auth", async () => ({ AuthError: (await import("@auth/core/errors")).AuthError }));
vi.mock("@/lib/auth-environment", () => ({ isGoogleAuthConfigured: mocks.configured, isAuthConfigured: mocks.authConfigured }));
vi.mock("@/lib/lumina-users", () => ({ createPasswordUser: mocks.createPasswordUser }));
vi.mock("@/lib/passwords", () => ({ hashPassword: mocks.hashPassword }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
afterEach(() => vi.resetAllMocks());

const PASSWORD = "harbour lights at dawn";
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const registration = { full_name: "Amina Otieno", email: "Amina@Example.com", password: PASSWORD, confirm_password: PASSWORD };

describe("authentication server actions", () => {
  it("starts only Google sign in and returns to protected onboarding", async () => {
    mocks.configured.mockReturnValue(true);
    await googleSignIn();
    expect(mocks.signIn).toHaveBeenCalledWith("google", { redirectTo: "/onboarding" });
  });

  it("uses a safe sign-in failure message", async () => {
    mocks.configured.mockReturnValue(true);
    mocks.signIn.mockRejectedValue(new AuthError("private credential details"));
    mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
    await expect(googleSignIn()).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/sign-in?error=signin");
  });

  it("signs out through Auth.js and returns home", async () => {
    await logOut();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: "/" });
  });
});

describe("password sign-in action", () => {
  it("forwards only the email and password to the credentials provider", async () => {
    mocks.authConfigured.mockReturnValue(true);
    const data = form({ email: "member@example.com", password: PASSWORD, $ACTION_ID_abc: "", role: "admin" });
    await passwordSignIn({ message: "" }, data);
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", { email: "member@example.com", password: PASSWORD, redirectTo: "/onboarding" });
  });

  it("returns one generic message for any invalid credentials", async () => {
    mocks.authConfigured.mockReturnValue(true);
    mocks.signIn.mockRejectedValue(new CredentialsSignin());
    const state = await passwordSignIn({ message: "" }, form({ email: "unknown@example.com", password: "whatever-it-is" }));
    expect(state.message).toBe("Email or password is incorrect.");
    expect(state.message).not.toContain("unknown@example.com");
  });

  it("tells the person to wait once the email is rate limited", async () => {
    mocks.authConfigured.mockReturnValue(true);
    mocks.signIn.mockRejectedValue(new CredentialsSignin());
    for (let i = 0; i < MAX_FAILURES; i++) signInThrottle().recordFailure("limited@example.com");
    const state = await passwordSignIn({ message: "" }, form({ email: " Limited@Example.com", password: "whatever-it-is" }));
    expect(state.message).toContain("Too many sign-in attempts");
  });

  it("hides internal authentication errors", async () => {
    mocks.authConfigured.mockReturnValue(true);
    mocks.signIn.mockRejectedValue(new AuthError("SELECT password_hash FROM users"));
    const state = await passwordSignIn({ message: "" }, form({ email: "member@example.com", password: PASSWORD }));
    expect(state.message).toContain("temporarily unavailable");
    expect(state.message).not.toContain("password_hash");
  });

  it("lets the successful Next.js redirect propagate", async () => {
    mocks.authConfigured.mockReturnValue(true);
    mocks.signIn.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(passwordSignIn({ message: "" }, form({ email: "member@example.com", password: PASSWORD }))).rejects.toThrow("NEXT_REDIRECT");
  });

  it("is unavailable without session configuration", async () => {
    mocks.authConfigured.mockReturnValue(false);
    expect((await passwordSignIn({ message: "" }, form({ email: "member@example.com", password: PASSWORD }))).message).toContain("unavailable");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});

describe("registration action", () => {
  it("hashes before storage, creates the account and signs in to onboarding", async () => {
    mocks.authConfigured.mockReturnValue(true);
    mocks.hashPassword.mockResolvedValue("$argon2id$hash");
    mocks.createPasswordUser.mockResolvedValue("created");
    await registerAccount({ message: "" }, form(registration));
    expect(mocks.hashPassword).toHaveBeenCalledWith(PASSWORD);
    expect(mocks.createPasswordUser).toHaveBeenCalledWith("Amina Otieno", "amina@example.com", "$argon2id$hash");
    expect(JSON.stringify(mocks.createPasswordUser.mock.calls)).not.toContain(PASSWORD);
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", { email: "amina@example.com", password: PASSWORD, redirectTo: "/onboarding" });
  });

  it("returns validation messages without touching storage", async () => {
    mocks.authConfigured.mockReturnValue(true);
    for (const [override, message] of [[{ email: "bad" }, "valid email"], [{ password: "short", confirm_password: "short" }, "at least 10"], [{ confirm_password: "different phrase!" }, "do not match"]] as const) {
      expect((await registerAccount({ message: "" }, form({ ...registration, ...override }))).message).toContain(message);
    }
    expect(mocks.createPasswordUser).not.toHaveBeenCalled();
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it("rejects duplicate email addresses", async () => {
    mocks.authConfigured.mockReturnValue(true);
    mocks.hashPassword.mockResolvedValue("$argon2id$hash");
    mocks.createPasswordUser.mockResolvedValue("duplicate");
    expect((await registerAccount({ message: "" }, form(registration))).message).toBe("An account with this email already exists. Sign in instead.");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("fails safely when storage is unavailable", async () => {
    mocks.authConfigured.mockReturnValue(true);
    mocks.hashPassword.mockResolvedValue("$argon2id$hash");
    mocks.createPasswordUser.mockRejectedValue(new Error("connection to secret-host failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await registerAccount({ message: "" }, form(registration))).message).toContain("could not create your account");
      expect(JSON.stringify(log.mock.calls)).not.toContain("secret-host");
      expect(JSON.stringify(log.mock.calls)).not.toContain(PASSWORD);
    } finally { log.mockRestore(); }
  });

  it("sends the person to sign in if automatic sign-in after registration fails", async () => {
    mocks.authConfigured.mockReturnValue(true);
    mocks.hashPassword.mockResolvedValue("$argon2id$hash");
    mocks.createPasswordUser.mockResolvedValue("created");
    mocks.signIn.mockRejectedValue(new CredentialsSignin());
    mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
    await expect(registerAccount({ message: "" }, form(registration))).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/sign-in?registered=1");
  });
});
