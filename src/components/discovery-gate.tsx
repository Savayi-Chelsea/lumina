import Link from "next/link";
export function DiscoveryGate() {
 return <section className="card mentorship-gate"><p className="eyebrow">YOUR COMMUNITY AWAITS</p><h1>Complete verification to explore alumni.</h1><p>The Network and alumni profiles are available to active, verified alumni and active administrators.</p><Link href="/verify" className="button">Verify alumni details</Link></section>;
}
