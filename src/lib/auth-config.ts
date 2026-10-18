import "server-only";
import type { NextAuthConfig } from "next-auth";
import { googleProfileImage } from "@/lib/profile-image";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { LuminaUser, PasswordAccount } from "@/lib/lumina-users";
import { parseSignIn } from "@/lib/credentials-input";
import { verifyPassword } from "@/lib/passwords";
import { signInThrottle, type SignInThrottle } from "@/lib/sign-in-throttle";

type UserStore = {
  linkGoogleUser(subject: string, email: string, image?: string | null): Promise<LuminaUser>;
  findLuminaUser(id: string): Promise<LuminaUser | null>;
  findPasswordAccount(email: string): Promise<PasswordAccount | null>;
  googleEmailConflict(subject: string, email: string): Promise<boolean>;
};

export const ACCOUNT_EXISTS_URL = "/sign-in?error=account-exists";

/** Returns the Lumina user id for valid credentials, otherwise null with no reason. */
export async function authorizePassword(store: Pick<UserStore, "findPasswordAccount">, input: Partial<Record<string, unknown>> | undefined, throttle: SignInThrottle) {
  const credentials = parseSignIn(input);
  if (!credentials || throttle.isLimited(credentials.email)) return null;
  const account = await store.findPasswordAccount(credentials.email);
  const valid = await verifyPassword(credentials.password, account?.password_hash);
  // Suspended accounts get the same generic failure as a wrong password.
  if (!account || !valid || account.account_status === "suspended") {
    throttle.recordFailure(credentials.email);
    return null;
  }
  throttle.reset(credentials.email);
  return { id: account.id, name: account.full_name, email: credentials.email };
}

export function createAuthConfig(store: UserStore, throttle: SignInThrottle = signInThrottle()): NextAuthConfig {
  return {
    providers: [
      Google,
      Credentials({
        credentials: { email: {}, password: {} },
        authorize: (input) => authorizePassword(store, input, throttle),
      }),
    ],
    // Auth.js owns encrypted, HttpOnly cookies; all session validation runs on the server.
    session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
    pages: { signIn: "/sign-in", error: "/sign-in" },
    logger: {
      error(error) { console.error("Authentication failed", error.name); },
      warn(code) { console.warn("Authentication warning", code); },
      debug() {},
    },
    callbacks: {
      async signIn({ account, profile, user }) {
        if (account?.provider === "credentials") return typeof user?.id === "string";
        // Google account control and email verification are separate from alumni eligibility.
        const google = account?.provider === "google" && profile?.email_verified === true
          && typeof profile.sub === "string" && profile.sub === account.providerAccountId
          && typeof profile.email === "string" && profile.email.length > 0 && profile.email.length <= 255;
        if (!google) return false;
        try {
          // Never link by email: an existing password account must keep signing in with its password.
          return await store.googleEmailConflict(profile.sub as string, profile.email as string) ? ACCOUNT_EXISTS_URL : true;
        } catch (error) {
          console.error("Lumina sign-in unavailable", error instanceof Error ? error.name : "UnknownError");
          return false;
        }
      },
      async jwt({ token, account, profile, user }) {
        try {
          if (account?.provider === "google") {
            if (profile?.email_verified !== true
              || typeof profile.sub !== "string" || profile.sub !== account.providerAccountId
              || typeof profile.email !== "string" || !profile.email || profile.email.length > 255) return null;
            const linked = await store.linkGoogleUser(profile.sub, profile.email, googleProfileImage(profile.picture));
            token.luminaUserId = linked.id;
            token.sub = linked.id;
            token.name = typeof profile.name === "string" ? profile.name : null;
            token.email = profile.email;
            token.picture = googleProfileImage(profile.picture);
          } else if (account?.provider === "credentials") {
            if (typeof user?.id !== "string") return null;
            token.luminaUserId = user.id;
            token.sub = user.id;
            token.name = user.name ?? null;
            token.email = user.email ?? null;
            token.picture = null;
          } else if (account) return null;
          if (typeof token.luminaUserId !== "string") return null;
          // Ignore client session updates. Roles, status and verification come only from PostgreSQL.
          const current = await store.findLuminaUser(token.luminaUserId);
          if (!current || current.account_status === "suspended") return null;
          token.luminaRole = current.role;
          token.luminaStatus = current.account_status;
          token.alumniVerified = current.alumni_verified;
          return token;
        } catch (error) {
          console.error("Lumina session unavailable", error instanceof Error ? error.name : "UnknownError");
          return null;
        }
      },
      session({ session, token }) {
        // Explicit allowlist: never serialize OAuth access, refresh or ID tokens.
        return {
          expires: session.expires,
          user: {
            id: token.luminaUserId as string,
            name: token.name,
            email: token.email,
            image: token.picture,
            role: token.luminaRole as LuminaUser["role"],
            accountStatus: token.luminaStatus as LuminaUser["account_status"],
            alumniVerified: token.alumniVerified === true,
          },
        };
      },
    },
  };
}
