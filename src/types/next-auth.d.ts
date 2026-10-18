import type { DefaultSession } from "next-auth";
import type { LuminaUser } from "@/lib/lumina-users";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: LuminaUser["role"];
      accountStatus: LuminaUser["account_status"];
      alumniVerified: boolean;
    };
  }
}
