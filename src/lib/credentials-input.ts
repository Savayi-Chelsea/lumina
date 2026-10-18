import "server-only";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
const EMAIL_MAX = 255;
const NAME_MAX = 150;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export type Registration = { fullName: string; email: string; password: string };
export type ParsedRegistration = { ok: true; value: Registration } | { ok: false; message: string };

const text = (value: unknown) => typeof value === "string" ? value : "";

/** Lowercases and trims; password accounts are always stored in this form. */
export function normalizeEmail(value: unknown) {
  return text(value).trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return email.length > 0 && email.length <= EMAIL_MAX && EMAIL.test(email);
}

/** Length-only policy: passphrases welcome, no composition rules. */
export function passwordProblem(password: string) {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters. A short phrase works well.`;
  if (length > PASSWORD_MAX || Buffer.byteLength(password) > PASSWORD_MAX * 4) return `Use no more than ${PASSWORD_MAX} characters.`;
  if (!password.trim()) return "Your password cannot be only spaces.";
  return null;
}

export function parseRegistration(data: FormData): ParsedRegistration {
  const fullName = text(data.get("full_name")).trim().replace(/\s+/g, " ");
  const email = normalizeEmail(data.get("email"));
  const password = text(data.get("password"));
  const confirm = text(data.get("confirm_password"));
  if (!fullName) return { ok: false, message: "Enter your full name." };
  if (fullName.length > NAME_MAX) return { ok: false, message: `Use no more than ${NAME_MAX} characters for your name.` };
  if (!isValidEmail(email)) return { ok: false, message: "Enter a valid email address." };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, message: problem };
  if (password !== confirm) return { ok: false, message: "Passwords do not match." };
  return { ok: true, value: { fullName, email, password } };
}

/** Sign-in input is only shape-checked; policy is never revealed at sign-in. */
export function parseSignIn(input: Partial<Record<string, unknown>> | undefined) {
  const email = normalizeEmail(input?.email);
  const password = text(input?.password);
  if (!isValidEmail(email) || !password || password.length > PASSWORD_MAX * 4) return null;
  return { email, password };
}
