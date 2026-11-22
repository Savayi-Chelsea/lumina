import { engagement } from "@/lib/analytics";
import { BarChart, ColumnChart, StatTile } from "@/components/charts";

const percent = (value: number | null) => value === null ? "—" : `${Math.round(value * 100)}%`;

/** Insights › Community: aggregate engagement only; no individual is shown. */
export async function CommunityInsights() {
  const data = await engagement();
  const t = data.totals;
  return <>
    <h2 className="sr-only">Community</h2>
    <p>How alumni are connecting and mentoring each other. Figures are totals and averages; no individual is shown.</p>
    <div className="stat-grid">
      <StatTile label="Verified members" value={t.members.toLocaleString("en")} note={`${t.mentors} offering mentorship`} />
      <StatTile label="Connections" value={t.connections.toLocaleString("en")} note={t.members ? `${(t.connections * 2 / t.members).toFixed(1)} per member on average` : undefined} />
      <StatTile label="Mentorships" value={t.mentorships.toLocaleString("en")} note={`${percent(t.acceptance_rate)} of answered requests accepted`} />
      <StatTile label="Median reply time" value={t.median_reply_hours === null ? "—" : `${t.median_reply_hours} h`} note="From request to the mentor's answer" />
      <StatTile label="Session recaps" value={t.recaps.toLocaleString("en")} note={`${t.upcoming_sessions} sessions booked ahead`} />
      <StatTile label="Event places reserved" value={t.event_places.toLocaleString("en")} />
    </div>
    <div className="chart-grid">
      <ColumnChart title="New connections per month" description="Accepted connections, last 12 months" points={data.series.connections} unit="connections" />
      <ColumnChart title="Mentorship requests per month" description="Requests sent, last 12 months" points={data.series.requests} unit="requests" />
      <ColumnChart title="Session recaps published per month" description="Recaps approved by both people, last 12 months" points={data.series.recaps} unit="recaps" />
      <ColumnChart title="Sessions booked per month" description="Bookings made through Lumina, last 12 months" points={data.series.sessions} unit="sessions" />
    </div>
    <div className="chart-grid">
      <BarChart title="Members by former department" description="Verified, active alumni" unit="members"
        rows={data.departments.map(d => ({ label: d.department, value: d.members, note: `${d.mentors} mentors` }))} />
      <BarChart title="Mentorships by former department" description="Accepted mentorships with someone from that department" unit="mentorships"
        rows={[...data.departments].sort((a, b) => b.mentorships - a.mentorships).map(d => ({ label: d.department, value: d.mentorships }))} />
    </div>
  </>;
}
