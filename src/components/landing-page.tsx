import { Brand } from "./brand";
import { LuminaLogo } from "./lumina-logo";
import { GoogleSignInButton } from "./auth-controls";
import { HorizonArt } from "./horizon-art";
import { Icon, type IconName } from "./icon";

const values: { id: string; number: string; icon: IconName; title: string; description: string }[] = [
  { id: "reconnect", number: "01", icon: "people", title: "Familiar faces. Fresh conversations.", description: "Find the colleagues who made the long shifts lighter and the big moments unforgettable. Pick up where you left off." },
  { id: "mentors", number: "02", icon: "compass", title: "Experience worth passing on.", description: "A career in aviation teaches you things no classroom can. Discover people whose experience can inspire your next step." },
  { id: "possibilities", number: "03", icon: "briefcase", title: "Your next chapter has company.", description: "Explore new directions, exchange professional insight and stay close to a community that understands where you have been." },
];

export function LandingPage({ signIn = false, configured = true, error }: { signIn?: boolean; configured?: boolean; error?: string | string[] }) {
  return <div className="landing">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="public-header"><Brand /><nav aria-label="Explore Lumina"><a href="#reconnect">The community</a><a href="#mentors">Mentorship</a><a href="#our-story">Our story</a></nav><span className="header-note">Your journey continues.</span></header>
    <main id="main">
      <section className="landing-hero">
        <div className="landing-hero-copy"><p className="eyebrow"><span className="eyebrow-line" />ONE JOURNEY. A LIFETIME OF CONNECTIONS.</p>
          <h1>Reconnect with the people who shaped <em>your journey.</em></h1>
          <p className="hero-description">A new home for the Kenya Airways alumni community. For the friendships, the experience, and everything still ahead.</p>
          <div className="landing-cta"><GoogleSignInButton disabled={!configured} /></div>
          {(!configured || error === "unavailable") ? <p className="signin-feedback" role="alert">Google sign-in is temporarily unavailable. Please try again later.</p> : signIn && error ? <p className="signin-feedback" role="alert">We could not sign you in. Try again or contact Lumina support if the problem continues.</p> : null}
          <p className="hero-footnote">Built around our shared experience. Open to your next chapter.</p>
          <a className="scroll-cue" href="#reconnect"><span aria-hidden="true">↓</span>Discover what brings us together</a>
        </div><HorizonArt />
      </section>
      <section className="belonging-strip" aria-label="Every part of the journey"><span>A community for every chapter</span><p>Flight deck <b>·</b> Cabin <b>·</b> Engineering <b>·</b> Digital <b>·</b> Finance <b>·</b> Operations <b>·</b> And you.</p></section>
      <section className="landing-values section-wrap" aria-labelledby="connections-title"><div className="section-intro"><p className="eyebrow">CONNECTED BY MORE THAN A CAREER</p><h2 id="connections-title">The uniform was a chapter.<br /><em>The connections are for life.</em></h2><p>Across departments, destinations and generations, there is always something that brings us back together.</p></div>
        <div className="value-grid">{values.map(value => <article id={value.id} key={value.id} className="value-card"><div className="value-top"><Icon name={value.icon} width={28} height={28} /><span>{value.number}</span></div><h3>{value.title}</h3><p>{value.description}</p></article>)}</div>
      </section>
      <section id="our-story" className="community-story"><div className="story-visual" aria-hidden="true"><span className="story-ring ring-one" /><span className="story-ring ring-two" /><div className="story-type">People.<br />Purpose.<br /><em>Possibility.</em></div><span className="story-coordinate">CONNECTED, WHEREVER LIFE TAKES YOU.</span></div><div className="story-copy"><p className="eyebrow">A SHARED PAST. AN OPEN FUTURE.</p><h2>Some connections<br />never stop <em>taking you places.</em></h2><p>We have shared early starts, extraordinary destinations and moments that became stories. Lumina is a place to carry those connections forward.</p><p>Stay close to the community. Exchange ideas. Celebrate the next chapter of the people who were part of yours.</p><a className="text-link" href="#reconnect">Explore the community<Icon name="arrow" /></a></div></section>
      <section className="landing-closing section-wrap"><p className="eyebrow">STILL PART OF SOMETHING SPECIAL</p><h2>Your next chapter.<br /><em>Our shared horizon.</em></h2><p>The journey changes. The people stay with you.</p><a className="text-link" href="#main">Back to the beginning<Icon name="arrow" /></a></section>
    </main>
    <footer className="public-footer"><LuminaLogo variant="wordmark" /><p>For the people behind the journey.</p><span>Independent alumni community</span></footer>
  </div>;
}
