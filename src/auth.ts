import "server-only";
import NextAuth from "next-auth";
import { createAuthConfig } from "@/lib/auth-config";
import { findLuminaUser, linkGoogleUser } from "@/lib/lumina-users";

export const { handlers, auth, signIn, signOut } = NextAuth(
  createAuthConfig({ findLuminaUser, linkGoogleUser }),
);
