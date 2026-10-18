import "server-only";
import * as crypto from "node:crypto";

// Node 24.7+ ships Argon2 natively; @types/node 20 does not describe it yet.
type Argon2Parameters = { message: string | Buffer; nonce: Buffer; parallelism: number; tagLength: number; memory: number; passes: number };
type Argon2 = (algorithm: "argon2id", parameters: Argon2Parameters, callback: (error: Error | null, key: Buffer) => void) => void;
const nativeArgon2 = (crypto as unknown as { argon2?: Argon2 }).argon2;

// OWASP Password Storage Cheat Sheet Argon2id baseline: 19 MiB, 2 passes, 1 lane.
const PARAMETERS = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 } as const;
const SALT_BYTES = 16;
const ENCODED = /^\$argon2id\$v=19\$m=(\d{1,6}),t=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]{16,})\$([A-Za-z0-9+/]{16,})$/;

function derive(password: string, salt: Buffer, parameters: { memory: number; passes: number; parallelism: number; tagLength: number }) {
  if (!nativeArgon2) return Promise.reject(new Error("Argon2 requires Node.js 24.7 or later"));
  return new Promise<Buffer>((resolve, reject) => nativeArgon2("argon2id", { message: password, nonce: salt, ...parameters },
    (error, key) => error ? reject(error) : resolve(key)));
}

const encode = (value: Buffer) => value.toString("base64").replace(/=+$/, "");

/** Returns a self-describing PHC string; the plaintext is never stored. */
export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await derive(password, salt, PARAMETERS);
  return `$argon2id$v=19$m=${PARAMETERS.memory},t=${PARAMETERS.passes},p=${PARAMETERS.parallelism}$${encode(salt)}$${encode(key)}`;
}

let decoy: Promise<string> | undefined;

/**
 * Constant-time verification. Missing or unrecognised hashes (Google-only accounts,
 * synthetic non-login fixtures) still pay for one derivation so timing does not
 * reveal whether a password account exists, and they never verify.
 */
export async function verifyPassword(password: string, stored: string | null | undefined) {
  const match = stored ? ENCODED.exec(stored) : null;
  const [memory, passes, parallelism] = match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0];
  // Bound stored parameters so a tampered row cannot force excessive work.
  if (!match || memory < 8192 || memory > 65536 || passes < 1 || passes > 10 || parallelism < 1 || parallelism > 4) {
    decoy ??= hashPassword(crypto.randomBytes(24).toString("base64"));
    await verifyPassword(password, await decoy);
    return false;
  }
  const salt = Buffer.from(match[4], "base64");
  const expected = Buffer.from(match[5], "base64");
  const actual = await derive(password, salt, { memory, passes, parallelism, tagLength: expected.length });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
