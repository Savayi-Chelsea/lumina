import Image from "next/image";

export type AccountInfo = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  alumniVerified: boolean;
};

export function AccountCard({ user }: { user: AccountInfo }) {
  return (
    <section aria-label="Your account" className="space-y-4 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
      <div className="flex items-center gap-4">
        {user.image && (
          <Image src={user.image} alt="Google profile photo" width={64} height={64}
            unoptimized referrerPolicy="no-referrer" className="rounded-full" />
        )}
        <div>
          <h2 className="text-xl font-semibold">{user.name || "Your Google account"}</h2>
          {user.email && <p className="text-zinc-600 dark:text-zinc-400">{user.email}</p>}
        </div>
      </div>
      <p>Alumni verification: <strong>{user.alumniVerified ? "Verified by Lumina" : "Not verified"}</strong></p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Google sign-in confirms your Google account. Kenya Airways alumni verification is handled separately by Lumina.
      </p>
    </section>
  );
}
