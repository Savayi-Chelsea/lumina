import "server-only";
import NextAuth from "next-auth";
import { createAuthConfig } from "@/lib/auth-config";
import { findLuminaUser, findPasswordAccount, googleEmailConflict, linkGoogleUser } from "@/lib/lumina-users";

export const { handlers, auth, signIn, signOut } = NextAuth(
  createAuthConfig({ findLuminaUser, findPasswordAccount, googleEmailConflict, linkGoogleUser }),
);
