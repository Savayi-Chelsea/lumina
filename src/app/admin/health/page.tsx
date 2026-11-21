import { requireAdmin } from "@/lib/session";
import { systemHealth } from "@/lib/system-health";
import { HealthBadge } from "@/components/health-badge";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  await requireAdmin();
  const health = await systemHealth();
  return <>
    <p className="eyebrow">Administration / System health</p>
    <h1>System health</h1>
    <p>Live checks of every service Lumina depends on. <HealthBadge state={health.overall} /> <span className="small muted">Checked {new Date(health.checked_at).toLocaleTimeString("en-GB", { timeZone: "Africa/Nairobi" })} (Nairobi). Reload to check again.</span></p>
    <ul className="health-list">{health.checks.map(check => <li key={check.name} className="card health-card">
      <div className="health-head"><h2>{check.name}</h2><HealthBadge state={check.state} /></div>
      <p><strong>{check.summary}</strong></p><p className="small muted">{check.detail}</p>
    </li>)}</ul>
  </>;
}
