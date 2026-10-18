import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import { GoogleSignInButton } from "./auth-controls";
import { HorizonArt } from "./horizon-art";
import { LuminaLogo } from "./lumina-logo";

export function AuthShell({ children }: { children: ReactNode }) {
  return <div className="auth-page">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="auth-header"><Brand /><Link className="text-link" href="/">Back to home</Link></header>
    <main id="main" className="auth-main">
      <section className="auth-panel">{children}</section>
      <aside className="auth-art" aria-hidden="true"><HorizonArt /></aside>
    </main>
    <footer className="public-footer"><LuminaLogo variant="wordmark" /><p>For the people behind the journey.</p><span>Independent alumni community</span></footer>
  </div>;
}

export function AuthHeading({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return <div className="auth-heading"><p className="eyebrow"><span className="eyebrow-line" />{eyebrow}</p><h1>{title}</h1>{children && <p className="auth-lede">{children}</p>}</div>;
}

export function ContinueWithGoogle({ available }: { available: boolean }) {
  return <>
    <div className="auth-divider" role="separator"><span>or continue with</span></div>
    <GoogleSignInButton disabled={!available} />
  </>;
}
