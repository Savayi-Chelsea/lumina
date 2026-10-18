import Image from "next/image";
export type AccountInfo = { name?: string | null; email?: string | null; image?: string | null; alumniVerified: boolean; accountStatus?: string };
export function AccountCard({ user }: { user: AccountInfo }) {
  const verified = user.alumniVerified && user.accountStatus !== "pending";
  return <section aria-label="Your account" className="card"><div className="profile-identity">{user.image && <Image src={user.image} alt="Profile photo" width={64} height={64} unoptimized referrerPolicy="no-referrer" className="avatar" />}<div><h2>{user.name || "Your Lumina account"}</h2>{user.email && <p className="muted">{user.email}</p>}</div></div><p>Alumni verification: <strong className="badge">{verified ? "Verified by Lumina" : "Not verified · Verification needed"}</strong></p><p className="muted">Signing in confirms your Lumina account. Kenya Airways alumni verification is handled separately by Lumina.</p></section>;
}
