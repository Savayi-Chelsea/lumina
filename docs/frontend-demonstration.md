# Lumina frontend demonstration

The public home and `/sign-in` share an editorial landing page with one Google
sign-in action. Signed-in home uses the server session and saved profile; no
authentication, registry, assistance-resolution or database schema rules change.

## Presentation system

`src/app/globals.css` defines the brand palette, typography, spacing scale, surface
colors, radii, focus treatment, transitions and shadows. Decorative scenes are
code-native and have no external image dependency or airline artwork.

`LuminaLogo` supports `full`, `wordmark` and `compact` variants, plus an `inverse`
appearance. It uses a temporary text treatment because no final logo was supplied.
To integrate approved local artwork, pass the `assets` map with each variant's
`src`, `width` and `height`, or configure its default in that one component. Example:

```tsx
<LuminaLogo variant="wordmark" assets={{
  wordmark: { src: "/brand/lumina-wordmark.svg", width: 160, height: 44 },
}} />
```

## Real state and demonstration previews

- Name/avatar: authenticated Google information, with saved profile name preferred
  in the personal home content.
- Profile detail progress: populated fields out of the eleven existing profile
  fields. This is separate from, and does not redefine, `profile_completed`.
- Verification label: verified only when the session reports both an active
  account and alumni verification. Pending alumni keep a working `/verify` link.
- Account disclosure: Account, Your profile, Sign out and an admin-only entry.
- Alumni, home mentor previews, spotlight, events and opportunities: curated fictional fixtures
  in `src/lib/demo-community.ts`, never presented as live users, semantic matches,
  scheduled events, employer partnerships or real vacancies.
- Directory name/department/city search and filter chips work locally on the
  fixtures. `/mentorship` now provides live semantic discovery; see
  `mentorship-discovery.md` for its access rule, service setup and demonstration.
- Preview buttons open accessible native dialogs. They do not send connection,
  mentorship, registration or application requests.
- Community activity is an explicit coming-soon state, with no fake posts or
  counts. No feed posting, messaging or other social backend was introduced.

Admin exception handling stays operational and server-authorized. The new header
is shared across alumni and admin pages; administrators get a compact secondary
navigation row for their existing routes.

## Checks and screenshots

After the production build:

```powershell
npm.cmd run test:auth:http
npm.cmd run test:frontend:browser
```

The browser check uses installed Chrome/Edge when available, or Playwright's
Chromium. `LUMINA_BROWSER` can specify another installed Chromium executable.
It uses a disposable local Google-linked account, checks actual profile saves,
menus, dialogs, filtering, empty states, sign-out and viewport overflow, and
compares all existing application data after cleanup. OAuth exchange itself is
external and is covered separately by the existing authentication policy tests.

Desktop/mobile screenshots and `browser-report.json` are written under
`artifacts/frontend/` (gitignored). Fixtures are private to the test and are deleted
afterward. No persistent demonstration account is created.
