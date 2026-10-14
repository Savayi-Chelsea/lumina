import "server-only";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { LuminaUser } from "@/lib/lumina-users";

type UserStore = {
  linkGoogleUser(subject: string, email: string): Promise<LuminaUser>;
  findLuminaUser(id: string): Promise<LuminaUser | null>;
};

function googleImage(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".googleusercontent.com") ? url.href : null;
  } catch { return null; }
}

export function createAuthConfig(store: UserStore): NextAuthConfig {
  return {
    providers: [Google],
    // Auth.js owns encrypted, HttpOnly cookies; all session validation runs on the server.
    session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
    pages: { signIn: "/sign-in", error: "/sign-in" },
    logger: {
      error(error) { console.error("Authentication failed", error.name); },
      warn(code) { console.warn("Authentication warning", code); },
      debug() {},
    },
    callbacks: {
      signIn({ account, profile }) {
        // Google account control and email verification are separate from alumni eligibility.
        return account?.provider === "google" && profile?.email_verified === true
          && typeof profile.sub === "string" && profile.sub === account.providerAccountId
          && typeof profile.email === "string" && profile.email.length > 0 && profile.email.length <= 255;
      },
      async jwt({ token, account, profile }) {
        try {
          if (account) {
            if (account.provider !== "google" || profile?.email_verified !== true
              || typeof profile.sub !== "string" || profile.sub !== account.providerAccountId
              || typeof profile.email !== "string" || !profile.email || profile.email.length > 255) return null;
            const user = await store.linkGoogleUser(profile.sub, profile.email);
            token.luminaUserId = user.id;
            token.sub = user.id;
            token.name = typeof profile.name === "string" ? profile.name : null;
            token.email = profile.email;
            token.picture = googleImage(profile.picture);
          }
          if (typeof token.luminaUserId !== "string") return null;
          // Ignore client session updates. Roles, status and verification come only from PostgreSQL.
          const user = await store.findLuminaUser(token.luminaUserId);
          if (!user || user.account_status === "suspended") return null;
          token.luminaRole = user.role;
          token.luminaStatus = user.account_status;
          token.alumniVerified = user.alumni_verified;
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
