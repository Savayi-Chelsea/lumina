import Link from "next/link";
export function DiscoveryGate({ title = "Complete verification to explore alumni.", area = "The Network and alumni profiles are" }: { title?: string; area?: string }) {
 return <section className="card mentorship-gate"><p className="eyebrow">YOUR COMMUNITY AWAITS</p><h1>{title}</h1><p>{area} available to active, verified alumni and active administrators.</p><Link href="/verify" className="button">Verify alumni details</Link></section>;
}
