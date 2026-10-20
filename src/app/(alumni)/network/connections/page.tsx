import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { myNetwork, suggestions } from "@/lib/social";
import { DiscoveryGate } from "@/components/discovery-gate";
import { MemberRow, NetworkTabs } from "@/components/member-row";
import { answerConnection, connect, disconnect, startConversation } from "../../social-actions";

export const dynamic = "force-dynamic";

const describe = (person: { headline: string | null; current_job_title: string | null; current_organization: string | null }) =>
  person.headline || [person.current_job_title, person.current_organization].filter(Boolean).join(" · ") || null;

export default async function ConnectionsPage() {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate />;
  const [network, people] = await Promise.all([myNetwork(session.user.id), suggestions(session.user.id, 8)]);
  const here = "/network/connections";
  return <div className="network-page">
    <section className="network-intro"><p className="eyebrow">YOUR PEOPLE</p><h1>My network</h1><p>Invitations, connections and colleagues you may know.</p></section>
    <NetworkTabs current="connections" invitations={network.incoming.length} />
    <div className="connections-layout">
      <div>
        <section className="card li-section"><h2>Invitations ({network.incoming.length})</h2>
          {network.incoming.length ? <ul className="member-list">{network.incoming.map(person => <MemberRow key={person.connection_id} profileId={person.profile_id} name={person.full_name} detail={describe(person)} image={person.image} from="connections">
            <form action={answerConnection}><input type="hidden" name="connection_id" value={person.connection_id} /><input type="hidden" name="return_to" value={here} /><button className="secondary" name="decision" value="ignore">Ignore</button></form>
            <form action={answerConnection}><input type="hidden" name="connection_id" value={person.connection_id} /><input type="hidden" name="return_to" value={here} /><button name="decision" value="accept">Accept</button></form>
          </MemberRow>)}</ul> : <p className="muted">No pending invitations.</p>}
        </section>
        <section className="card li-section"><h2>Connections ({network.connections.length})</h2>
          {network.connections.length ? <ul className="member-list">{network.connections.map(person => <MemberRow key={person.connection_id} profileId={person.profile_id} name={person.full_name} detail={describe(person)} image={person.image} from="connections">
            <form action={startConversation}><input type="hidden" name="profile_id" value={person.profile_id} /><input type="hidden" name="return_to" value={here} /><button className="secondary">Message</button></form>
            <form action={disconnect}><input type="hidden" name="connection_id" value={person.connection_id} /><input type="hidden" name="return_to" value={here} /><button className="text-button" aria-label={`Remove connection with ${person.full_name}`}>Remove</button></form>
          </MemberRow>)}</ul> : <p className="muted">You haven&apos;t connected with anyone yet. Start with the suggestions here or search the directory.</p>}
        </section>
        {network.outgoing.length > 0 && <section className="card li-section"><h2>Sent invitations ({network.outgoing.length})</h2>
          <ul className="member-list">{network.outgoing.map(person => <MemberRow key={person.connection_id} profileId={person.profile_id} name={person.full_name} detail={describe(person)} image={person.image} from="connections">
            <form action={disconnect}><input type="hidden" name="connection_id" value={person.connection_id} /><input type="hidden" name="return_to" value={here} /><button className="secondary">Withdraw</button></form>
          </MemberRow>)}</ul></section>}
      </div>
      <aside className="card li-section"><h2>People you may know</h2>
        {people.length ? <ul className="member-list">{people.map(person => <MemberRow key={person.profile_id} profileId={person.profile_id} name={person.full_name} image={person.image} from="connections"
          detail={person.same_department ? "Same former department" : person.shared_skills ? `${person.shared_skills} shared ${person.shared_skills === 1 ? "skill" : "skills"}` : describe(person)}>
          <form action={connect}><input type="hidden" name="profile_id" value={person.profile_id} /><input type="hidden" name="return_to" value={here} /><button className="secondary">Connect</button></form>
        </MemberRow>)}</ul> : <p className="muted">No suggestions right now.</p>}
      </aside>
    </div>
  </div>;
}
