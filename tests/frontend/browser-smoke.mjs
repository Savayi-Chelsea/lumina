// Real-browser presentation checks against production Next.js and a disposable local account.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(url?.hostname || process.env.POSTGRES_HOST || "localhost")
  && (url ? url.pathname.slice(1) : process.env.POSTGRES_DB) === "lumina", "Browser checks require local lumina database");
const pool = new Pool(url ? { connectionString: process.env.DATABASE_URL, max: 1 } : {
  host: process.env.POSTGRES_HOST || "localhost", port: Number(process.env.POSTGRES_PORT || "5432"),
  user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB, max: 1,
});
const output = "artifacts/frontend";
const subject = `browser-${randomUUID()}`;
let server, browser, fixtureId, originalData;
const passwordEmail = `${subject}@password.example.test`;
const failures = [];
const screenshots = [];
const networkUsers = [];
let networkSkillId;
const snapshot = async () => {
  const result = {};
  for (const table of ["users", "profiles", "alumni_registry", "verification_assistance_requests", "profile_embeddings", "profile_skills", "skills", "mentorship_preferences", "work_experience"]) {
    result[table] = JSON.stringify((await pool.query(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows);
  }
  return result;
};
async function noOverflow(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label}: page must fit viewport`);
  const clipped = await page.locator('.card, .alumni-card, .live-mentor-card, dialog[open]').evaluateAll(elements => elements.filter(element => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1);
  }).map(element => element.className));
  assert.deepEqual(clipped, [], `${label}: cards and dialogs must fit without clipping`);
}
async function screenshot(page, name) {
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  screenshots.push(`${output}/${name}.png`);
}

try {
  originalData = await snapshot();
  await mkdir(output, { recursive: true });
  const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe,"listening");
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const secret = randomBytes(32).toString("base64");
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    windowsHide: true, stdio: "ignore",
    env: { ...process.env, AUTH_SECRET: secret, AUTH_URL: base, APP_ORIGIN: base, AUTH_GOOGLE_ID: "browser-fixture", AUTH_GOOGLE_SECRET: "browser-fixture" },
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Production browser server exited");
    try { ready = (await fetch(`${base}/sign-in`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, "Production server must be ready");
  const executablePath = process.env.LUMINA_BROWSER || [
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "D:/Programs/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(path => existsSync(path));
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", error => failures.push(error.message));
  await page.goto(base); await expect(page.getByRole("heading", { level: 1 })).toContainText("Reconnect with the people");
  await expect(page.getByRole("link",{ name: "Join Lumina" })).toHaveAttribute("href","/sign-up");
  await expect(page.getByRole("main").getByRole("link",{ name: "Sign in", exact: true })).toHaveAttribute("href","/sign-in");
  for (const copy of ["Personal Gmail", "Google authentication succeeded", "Alumni verification is handled separately"]) await expect(page.locator("body")).not.toContainText(copy);
  await noOverflow(page,"desktop landing"); await screenshot(page,"landing-desktop");
  await page.getByRole("link",{ name: "The community", exact: true }).click();
  await expect(page).toHaveURL(/#reconnect$/);
  await page.setViewportSize({ width: 375, height: 812 }); await page.goto(base); await noOverflow(page,"mobile landing"); await screenshot(page,"landing-mobile");
  await page.goto(`${base}/sign-in?error=example`); await expect(page.getByRole("main").getByRole("alert")).toContainText("could not sign you in");
  console.log("PASS scrollable public landing, join/sign-in CTAs, error state and responsive layouts");

  {
    // Real email/password journey through the production server and Auth.js credentials provider.
    const authContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const auth = await authContext.newPage();
    auth.on("pageerror", error => failures.push(error.message));
    const passphrase = "harbour lights at dawn";
    await auth.goto(`${base}/sign-in`);
    const fields = ["Email address", "Password"]; for (const label of fields) await expect(auth.getByLabel(label, { exact: true })).toBeVisible();
    const signInBox = await auth.getByRole("button", { name: "Sign in", exact: true }).boundingBox();
    const googleBox = await auth.getByRole("button", { name: "Continue with Google" }).boundingBox();
    assert.ok(signInBox.y < googleBox.y, "Email/password sign-in appears above Google");
    await screenshot(auth, "auth-sign-in-desktop");
    await auth.getByRole("link", { name: "Create an account" }).click(); await expect(auth).toHaveURL(/\/sign-up$/);
    await auth.getByLabel("Full name").fill("Browser Password User");
    await auth.getByLabel("Email address").fill(passwordEmail.toUpperCase());
    await auth.getByLabel("Password", { exact: true }).fill(passphrase);
    await auth.getByLabel("Confirm password").fill("a different passphrase");
    await auth.getByRole("button", { name: "Create account" }).click();
    await expect(auth.getByRole("main").getByRole("alert")).toContainText("Passwords do not match"); await expect(auth.getByRole("button", { name: "Create account" })).toBeEnabled();
    await expect(auth.getByLabel("Email address")).toHaveValue(passwordEmail.toUpperCase());
    await auth.getByLabel("Password", { exact: true }).fill(passphrase); await auth.getByLabel("Confirm password").fill(passphrase);
    await auth.getByRole("button", { name: "Create account" }).click();
    await expect(auth).toHaveURL(/\/verify$/);
    const created = (await pool.query("SELECT u.account_status, u.alumni_verified, u.password_hash, p.full_name, p.profile_completed FROM public.users u JOIN public.profiles p ON p.user_id=u.id WHERE u.email=$1", [passwordEmail])).rows[0];
    assert.equal(created.account_status, "pending"); assert.equal(created.alumni_verified, false); assert.equal(created.profile_completed, false);
    assert.match(created.password_hash, /^\$argon2id\$/); assert.ok(!created.password_hash.includes(passphrase), "Password never stored in plaintext");
    assert.equal(created.full_name, "Browser Password User");
    const cookie = (await authContext.cookies()).find(c => c.name === "authjs.session-token");
    assert.ok(cookie?.httpOnly, "Password sessions use the HttpOnly Auth.js cookie");
    await authContext.clearCookies();
    await auth.goto(`${base}/sign-up`);
    await auth.getByLabel("Full name").fill("Duplicate Person"); await auth.getByLabel("Email address").fill(passwordEmail);
    await auth.getByLabel("Password", { exact: true }).fill(passphrase); await auth.getByLabel("Confirm password").fill(passphrase);
    await auth.getByRole("button", { name: "Create account" }).click();
    await expect(auth.getByRole("main").getByRole("alert")).toContainText("already exists");
    await auth.goto(`${base}/sign-in`);
    await auth.getByLabel("Email address").fill(passwordEmail); await auth.getByLabel("Password", { exact: true }).fill("not the right passphrase");
    await auth.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(auth.getByRole("main").getByRole("alert")).toHaveText("Email or password is incorrect."); await expect(auth.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
    await auth.getByLabel("Password", { exact: true }).fill("not the right passphrase");
    await auth.getByLabel("Email address").fill("nobody-" + passwordEmail);
    await auth.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(auth.getByRole("main").getByRole("alert")).toHaveText("Email or password is incorrect."); await expect(auth.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
    await auth.getByLabel("Email address").fill(passwordEmail); await auth.getByLabel("Password", { exact: true }).fill(passphrase);
    await auth.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(auth).toHaveURL(/\/verify$/);
    await authContext.clearCookies();
    const limitedEmail = "limited-" + passwordEmail;
    await auth.goto(`${base}/sign-in`);
    for (let attempt = 0; attempt < 5; attempt++) {
      await auth.getByLabel("Email address").fill(limitedEmail); await auth.getByLabel("Password", { exact: true }).fill("wrong passphrase " + attempt);
      await auth.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(auth.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
    }
    await expect(auth.getByRole("main").getByRole("alert")).toContainText("Too many sign-in attempts");
    await auth.goto(`${base}/sign-in?error=account-exists`);
    await expect(auth.getByRole("main").getByRole("alert")).toContainText("already has a Lumina password account");
    await auth.goto(`${base}/forgot-password`);
    await expect(auth.getByRole("heading", { level: 2 })).toContainText("not available yet");
    await expect(auth.locator("body")).not.toContainText(/email (has been|was) sent|check your inbox/i);
    await authContext.close();
    console.log("PASS email/password registration, duplicate rejection, generic failures, rate limiting, sign-in and honest reset page");
  }

  fixtureId = (await pool.query(`INSERT INTO public.users(email,google_subject,account_status)
    VALUES($1,$2,'pending') RETURNING id`,[`${subject}@example.test`,subject])).rows[0].id;
  const token = await encode({ secret, salt: "authjs.session-token", maxAge: 600, token: { luminaUserId: fixtureId, name: "Demo Browser User", email: `${subject}@example.test` } });
  await context.addCookies([{ name: "authjs.session-token", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(base);
  await expect(page.getByRole("heading",{ name: "Demo Browser User", exact: true })).toBeVisible();
  await expect(page.getByRole("link",{ name: "Verify alumni details", exact: true })).toBeVisible();
  await expect(page.getByText("Verified by Lumina",{ exact: true })).toHaveCount(0);
  await expect(page.getByRole("progressbar",{ name: "Profile details completed" })).toHaveAttribute("value","0");
  await noOverflow(page,"desktop home"); await screenshot(page,"home-pending-desktop");
  for (const [width,height] of [[320,700],[375,812],[768,1024],[1024,768],[1440,900]]) {
    await page.setViewportSize({ width,height }); await page.goto(`${base}/verify`);
    await expect(page.getByRole('textbox', { name: 'Synthetic staff number', exact: true })).toBeVisible();
    await noOverflow(page, `${width}px pending verification`); await screenshot(page, `verification-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(base);
  const menu = page.getByRole("button",{ name: "Open account menu" });
  await menu.focus(); await page.keyboard.press("Enter"); await expect(menu).toHaveAttribute("aria-expanded","true");
  await expect(page.getByRole("link",{ name: "Account", exact: true })).toBeVisible();
  await expect(page.getByRole("button",{ name: "Sign out", exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(menu).toBeFocused();
  await menu.click(); await page.getByRole("heading",{ level: 1 }).click(); await expect(menu).toHaveAttribute("aria-expanded","false");
  const preview = page.getByRole("button", { name: /^Explore event:/ }).first();
  await preview.click();
  await expect(page.getByRole("dialog").filter({ visible: true })).toContainText("Fictional demonstration content");
  await page.keyboard.press("Escape"); await expect(preview).toBeFocused();
  console.log("PASS pending state, keyboard account disclosure and accessible preview dialog");

  await page.getByRole("link",{ name: "Network", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Complete verification to explore alumni." })).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await page.getByRole("link",{ name: "Mentorship", exact: true }).click();
  await expect(page.getByRole("heading",{ name: "Your alumni journey starts with verification." })).toBeVisible();
  await expect(page.getByRole("button",{ name: "Find mentors", exact: true })).toHaveCount(0);
  await page.getByRole("link",{ name: "Events", exact: true }).click(); await page.getByRole("button",{ name: "Online", exact: true }).click(); await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByRole("link",{ name: "Opportunities", exact: true }).click(); await page.getByRole("button",{ name: "Volunteer", exact: true }).click(); await expect(page.getByRole("article")).toHaveCount(1);
  console.log("PASS pending Network/mentorship gates, events and opportunities previews");

  await page.getByRole("link",{ name: "Profile", exact: true }).click();
  await expect(page.getByRole("heading",{ level: 1 })).toHaveText("Your story, in your words.");
  await page.getByRole("textbox",{ name: "Full name (required)", exact: true }).fill("Demo Browser User");
  await page.getByRole("textbox",{ name: "Headline", exact: true }).fill("A new professional chapter");
  await page.getByRole("button",{ name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");
  await page.getByRole("link",{ name: "Home", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value","2");
  await expect(page.getByText("Verified by Lumina",{ exact: true })).toHaveCount(0);
  // Set only our disposable account to verified; production verification is exercised by HTTP/auth tests.
  await pool.query("UPDATE public.users SET account_status='active',alumni_verified=true WHERE id=$1 AND google_subject=$2",[fixtureId,subject]);
  await page.reload(); await expect(page.getByText("Verified by Lumina",{ exact: true })).toBeVisible();
  await screenshot(page,"home-verified-desktop");
  if (process.env.LUMINA_TEST_SYNTHETIC_DIRECTORY === '1') {
    const emails = Array.from({ length: 50 }, (_, index) => `alum-${String(index + 1).padStart(3,'0')}@synthetic.lumina.local`);
    const seeded = (await pool.query("SELECT p.id FROM public.profiles p JOIN public.users u ON u.id=p.user_id WHERE u.email=ANY($1::text[]) AND u.password_hash='synthetic_not_for_login' AND u.google_subject IS NULL AND u.account_status='active' AND u.alumni_verified=true AND u.role='alumni' AND length(btrim(p.full_name))>0", [emails])).rows;
    assert.equal(seeded.length, 50, 'All 50 established synthetic profiles must be discoverable');
    const visible = new Set();
    await page.goto(`${base}/network`);
    while (true) {
      await expect(page.locator('.network-page')).toBeVisible();
      for (const href of await page.locator('.alumni-card a[aria-label^="View profile:"]').evaluateAll(links => links.map(link => link.getAttribute('href')))) visible.add(href.split('/alumni/')[1].split('?')[0]);
      const next = page.getByRole('link', { name: 'Next page', exact: true });
      if (!await next.count()) break;
      const target = await next.getAttribute('href'); await next.click(); await expect(page).toHaveURL(`${base}${target}`);
    }
    for (const profile of seeded) assert.ok(visible.has(profile.id), 'Every seeded profile appears in real paginated Network');
    await page.goto(`${base}/network`); await expect(page.locator('.network-page')).toBeVisible();
    await screenshot(page, 'network-established-synthetic');
    console.log('PASS all 50 exact seeded alumni appear in real paginated Network');
  }
  // Disposable PostgreSQL directory data. No production records or fixture previews are used.
  networkSkillId = (await pool.query("INSERT INTO public.skills(name) VALUES($1) RETURNING id", [`BrowserSkill-${subject}`])).rows[0].id;
  for (let i = 0; i < 13; i++) {
    const user = (await pool.query("INSERT INTO public.users(email,google_subject,account_status,alumni_verified) VALUES($1,$2,'active',true) RETURNING id", [`${subject}-${i}@example.test`, `${subject}-${i}`])).rows[0].id;
    networkUsers.push(user);
    const profile = (await pool.query("INSERT INTO public.profiles(user_id,full_name,headline,former_kq_role,former_kq_department,current_job_title,current_organization,industry,location,biography) VALUES($1,$2,'Cloud careers and shared experience','Systems Engineer','Browser Demo Department','Cloud Architect','Example Studio','Browser Demo Industry','Browser Demo City',$3) RETURNING id", [user, `Browser Alumnus ${String(i).padStart(2,'0')}`, 'A professional journey. '.repeat(20)])).rows[0].id;
    if (i === 0) {
      await pool.query("INSERT INTO public.profile_skills(profile_id,skill_id) VALUES($1,$2)", [profile,networkSkillId]);
      await pool.query("INSERT INTO public.work_experience(profile_id,organization,job_title,is_current) VALUES($1,'Example Studio','Cloud Architect',true)", [profile]);
    }
  }
  const photoUrl = 'https://lh3.googleusercontent.com/lumina-browser-photo';
  await context.route(photoUrl, route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCFkAAAAASUVORK5CYII=', 'base64') }));
  await pool.query('UPDATE public.users SET google_image_url=$2 WHERE id=$1', [networkUsers[0],photoUrl]);
  await page.goto(`${base}/network?department=Browser+Demo+Department`);
  await expect(page.getByRole('article')).toHaveCount(12);
  await expect(page.locator('.alumni-card .alumni-avatar img')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('13 alumni found');
  await page.getByRole('link', { name: 'Next page', exact: true }).click();
  await expect(page).toHaveURL(/page=2/); await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('link', { name: 'Previous page', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search alumni', exact: true }).fill('Browser Alumnus 00');
  await page.getByLabel('Current industry', { exact: true }).selectOption('Browser Demo Industry');
  await page.getByLabel('Skill', { exact: true }).selectOption(`BrowserSkill-${subject}`);
  await page.getByLabel('Location', { exact: true }).selectOption('Browser Demo City');
  await page.getByRole('button', { name: 'Find alumni', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  const filteredUrl = page.url();
  await page.reload(); await expect(page.getByRole('searchbox')).toHaveValue('Browser Alumnus 00');
  await page.getByRole('link', { name: 'View profile: Browser Alumnus 00', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Browser Alumnus 00');
  await expect(page.locator('.mentor-profile .alumni-avatar img')).toHaveAttribute('src', photoUrl);
  await context.unroute(photoUrl);
  await context.route(photoUrl, route => route.abort());
  await page.reload(); await expect(page.locator('.mentor-profile .alumni-avatar')).toHaveText('BA');
  await pool.query('UPDATE public.users SET google_image_url=NULL WHERE id=$1', [networkUsers[0]]);
  await context.unroute(photoUrl);

  await expect(page.getByRole('heading', { name: 'Work experience', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Network', exact: true }).click();
  await expect(page).toHaveURL(filteredUrl);
  await page.getByRole('searchbox').fill('no-such-alumnus'); await page.getByRole('button', { name: 'Find alumni', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No alumni found', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters', exact: true }).first().click();
  console.log('PASS real Network search, all four filters, URL state, pagination, profile and return navigation');

  await page.getByRole("link",{ name: "Mentorship", exact: true }).click();
  await page.getByRole("button",{ name: "Find mentors", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Describe");
  const query = page.getByRole("textbox",{ name: "What would you like mentorship with?" });
  await query.fill("a".repeat(501)); await expect(query).toHaveValue("a".repeat(500));
  await expect(page.getByText("500 / 500 characters",{ exact: true })).toBeVisible();
  await page.getByRole("button",{ name: /I want to move from IT support/ }).click();
  let mode = "loading";
  let releaseSearch;
  let release = new Promise(resolve => { releaseSearch = resolve; });
  const exampleMentor = { profileId: "11111111-1111-1111-1111-111111111111", name: "Test Cloud Mentor", headline: "Cloud engineering", formerRole: "Systems Administrator", department: "ICT / Digital", currentPosition: "Cloud Engineer", organization: "Example organization", skills: ["AWS", "Docker"], matchRelevance: .73, availableForMentorship: true, synthetic: true };
  await page.route("**/api/mentorship/search",async route => {
    if (mode === "loading") await release;
    await route.fulfill({ status: mode === "unavailable" ? 503 : 200, contentType: "application/json", body: JSON.stringify(mode === "empty" ? { results: [] } : mode === "malformed" ? { results: [{ source_hash: "secret-internal-value" }] } : { results: [exampleMentor,{ ...exampleMentor, profileId: "22222222-2222-2222-2222-222222222222", name: "Test Second Mentor", matchRelevance: .65 }] }) });
  });
  await page.getByRole("button",{ name: "Find mentors", exact: true }).click();
  await expect(page.getByRole("button",{ name: "Finding mentors…", exact: true })).toBeDisabled();
  await expect(page.getByText("Finding experience that fits your next step.")).toBeVisible();
  releaseSearch();
  await expect(page.getByRole("heading",{ name: "2 mentors to discover", exact: true })).toBeVisible();
  await expect(page.getByRole("article").first()).toContainText("Test Cloud Mentor");
  await expect(page.getByText("0.730",{ exact: true })).toBeVisible();
  await expect(page.getByText("Match relevance reflects",{ exact: false })).toContainText("not a probability");
  await screenshot(page,"mentorship-results-desktop");
  mode = "empty"; await page.getByRole("button",{ name: "Find mentors", exact: true }).click();
  await expect(page.getByRole("heading",{ name: "No mentors matched this request yet.", exact: true })).toBeVisible();
  mode = "unavailable"; await page.getByRole("button",{ name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading",{ name: "Mentor discovery is taking a pause.", exact: true })).toBeVisible();
  mode = "malformed"; await page.getByRole("button",{ name: "Retry search", exact: true }).click();
  await expect(page.getByRole("heading",{ name: "Mentor discovery is taking a pause.", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("secret-internal-value");
  mode = "success"; await page.getByRole("button",{ name: "Retry search", exact: true }).click();
  await expect(page.getByRole("heading",{ name: "2 mentors to discover", exact: true })).toBeVisible();
  for (const [width,height] of [[320,700],[375,812],[768,1024],[1024,768],[1440,900]]) {
    await page.setViewportSize({ width,height }); await noOverflow(page, `${width}px mentorship results`);
    await expect(page.getByRole('textbox', { name: 'What would you like mentorship with?' })).toBeVisible();
    await expect(page.getByRole('article').first()).toBeVisible();
    await screenshot(page, `mentorship-${width}`);
    mode = 'loading'; release = new Promise(resolve => { releaseSearch = resolve; });
    await page.getByRole('button', { name: 'Find mentors', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Finding mentors\u2026', exact: true })).toBeDisabled();
    await noOverflow(page, `${width}px mentorship loading`); releaseSearch();
    await expect(page.getByRole('heading', { name: '2 mentors to discover', exact: true })).toBeVisible();
    mode = 'empty'; await page.getByRole('button', { name: 'Find mentors', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No mentors matched this request yet.', exact: true })).toBeVisible();
    await noOverflow(page, `${width}px mentorship empty`);
    mode = 'unavailable'; await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Mentor discovery is taking a pause.', exact: true })).toBeVisible();
    await noOverflow(page, `${width}px mentorship unavailable`);
    mode = 'success'; await page.getByRole('button', { name: 'Retry search', exact: true }).click();
    await expect(page.getByRole('heading', { name: '2 mentors to discover', exact: true })).toBeVisible();

  }
  await page.setViewportSize({ width: 375, height: 812 }); await noOverflow(page,"mobile live mentorship");
  await screenshot(page,"mentorship-results-mobile");
  await page.unroute("**/api/mentorship/search");
  await page.goto(base);
  console.log("PASS mentorship validation, character counter, prompts, loading, ranked cards, no-match, unavailable, malformed and retry states");

  for (const [width,height] of [[320,700],[375,812],[768,1024],[1024,768],[1440,900]]) {
    await page.setViewportSize({ width,height });
    for (const route of ['/', '/network?department=Browser+Demo+Department', '/profile', '/verify', '/mentorship', '/events', '/opportunities', '/account']) {
      await page.goto(`${base}${route}`);
      await expect(page.locator('.workspace h1').first()).toBeVisible();
      if (route.startsWith('/network')) await expect(page.locator('.network-page')).toBeVisible();
      await noOverflow(page, `${width}px ${route}`);
      const logo = page.locator('.app-header img[alt="Lumina"]');
      await expect(logo).toBeVisible();
      assert.ok(await logo.evaluate(img => img.complete && img.naturalWidth > 0));
      const box = await logo.boundingBox(); assert.ok(box.width >= 125 && Math.abs(box.width / box.height - 594/127) < .05);
      if (route.startsWith('/network')) {
        const nav = page.getByRole('navigation', { name: 'Alumni navigation' });
        if (width <= 1100) {
          const toggle = page.getByRole('button', { name: 'Menu', exact: true });
          await toggle.focus(); await page.keyboard.press('Enter'); await expect(nav).toBeVisible();
          const navBounds = await nav.boundingBox(); assert.ok(navBounds.x >= 0 && navBounds.x + navBounds.width <= width + 1, 'Navigation fits viewport');
          await screenshot(page, `navigation-${width}`);
          await page.keyboard.press('Escape'); await expect(toggle).toBeFocused(); await expect(nav).toBeHidden();
          await toggle.click(); await nav.getByRole('link', { name: 'Network', exact: true }).click(); await expect(nav).toBeHidden();
          await expect(page.locator('.network-page')).toBeVisible();
        } else await expect(nav).toBeVisible();
        await page.getByRole('link', { name: 'View profile: Browser Alumnus 00', exact: true }).click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Browser Alumnus 00');
        await noOverflow(page, `${width}px full alumni profile`); await screenshot(page, `alumni-profile-${width}`);
        await page.getByRole('link', { name: 'Back to Network', exact: true }).click();
        await expect(page.locator('.network-page')).toBeVisible();
        await noOverflow(page, `${width}px Network loaded`);
        const account = page.getByRole('button', { name: 'Open account menu', exact: true });
        await account.click(); const accountBounds = await page.locator('.account-popover').boundingBox();
        assert.ok(accountBounds.x >= 0 && accountBounds.x + accountBounds.width <= width + 1);
        await page.keyboard.press('Escape'); await expect(account).toBeFocused();
      }
      if (route === '/events') {
        const preview = page.getByRole('button', { name: /^Explore event:/ }).first(); await preview.click();
        const dialog = page.locator('dialog[open]'); await expect(dialog).toBeVisible();
        const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.height <= height);
        await screenshot(page, `dialog-${width}`); await page.keyboard.press('Escape'); await expect(preview).toBeFocused();
      }
      if (route === '/' || route.startsWith('/network') || route === '/profile') await screenshot(page, `${route === '/' ? 'home' : route.split('?')[0].slice(1)}-${width}`);
    }
    await context.clearCookies();
    await page.goto(base); await noOverflow(page, `${width}px landing`); await screenshot(page, `landing-${width}`);
    for (const route of ['sign-in', 'sign-up', 'forgot-password']) {
      await page.goto(`${base}/${route}`); await noOverflow(page, `${width}px ${route}`);
      for (const input of await page.locator('.auth-form input:not([type=hidden])').all()) { const box = await input.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.height >= 44, `${width}px ${route} inputs fit and are touch-sized`); }
      await screenshot(page, `auth-${route}-${width}`);
    }
    await context.addCookies([{ name: 'authjs.session-token', value: token, url: base, httpOnly: true, sameSite: 'Lax' }]);
  }
  console.log('PASS logo, mobile/tablet navigation, forms, cards, dialogs and layouts at all five target viewports');
  for (const width of [430,600,900,1280,1920]) {
    await page.setViewportSize({ width,height: 1000 });
    for (const route of ['/', '/network?department=Browser+Demo+Department', '/mentorship']) {
      await page.goto(`${base}${route}`); await expect(page.locator('.workspace h1')).toBeVisible();
      if (route.startsWith('/network')) await expect(page.locator('.network-page')).toBeVisible();
      await noOverflow(page, `${width}px additional responsive boundary ${route}`);
    }
  }


  await pool.query("UPDATE public.users SET role='admin' WHERE id=$1 AND google_subject=$2",[fixtureId,subject]);
  await page.goto(`${base}/admin/verification`); await expect(page.getByRole("heading",{ name: "Verification assistance", exact: true })).toBeVisible();
  for (const [width,height] of [[320,700],[375,812],[768,1024],[1024,768],[1440,900]]) {
    await page.setViewportSize({ width,height }); await noOverflow(page, `${width}px admin exceptions`);
    const adminMenu = page.getByRole('button', { name: 'Admin menu', exact: true });
    if (width <= 1100) { await adminMenu.click(); await expect(page.getByRole('navigation', { name: 'Administration', exact: true })).toBeVisible(); await page.keyboard.press('Escape'); await expect(adminMenu).toBeFocused(); }
    await screenshot(page, `admin-${width}`);
    for (const route of ['/admin','/admin/users','/admin/events','/admin/opportunities']) {
      await page.goto(`${base}${route}`); await expect(page.locator('.workspace h1')).toBeVisible(); await noOverflow(page, `${width}px ${route}`);
    }
    await page.goto(`${base}/admin/verification`);
  }
  await page.goto(`${base}/`); await page.getByRole("button",{ name: "Open account menu" }).click();
  await page.getByRole("button",{ name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading",{ level: 1 })).toContainText("Reconnect");
  assert.deepEqual(failures,[],"No browser runtime errors");
  await writeFile(`${output}/browser-report.json`,JSON.stringify({ passed: true, establishedSyntheticProfilesChecked: process.env.LUMINA_TEST_SYNTHETIC_DIRECTORY === '1' ? 50 : 0, viewports: [[320,700],[375,812],[768,1024],[1024,768],[1440,900]], additionalWidths: [430,600,900,1280,1920], network: 'Real PostgreSQL search, department/industry/skill/location filters, 12-profile pagination, profile return state', screenshots, runtimeErrors: failures },null,2));
  console.log("PASS admin exceptions remain accessible only to admins; actual sign out returns to landing");
} finally {
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null) { const stopped = once(server,"exit"); server.kill(); await stopped; }
  try {
    for (const id of networkUsers) await pool.query("DELETE FROM public.users WHERE id=$1 AND google_subject LIKE $2", [id, `${subject}-%`]);
    if (networkSkillId) await pool.query("DELETE FROM public.skills WHERE id=$1", [networkSkillId]);
    if (fixtureId) await pool.query("DELETE FROM public.users WHERE id=$1 AND google_subject=$2",[fixtureId,subject]);
    await pool.query("DELETE FROM public.users WHERE email=$1 AND google_subject IS NULL", [passwordEmail]);
    if (originalData) assert.deepEqual(await snapshot(), originalData, "All existing data must remain unchanged");
    console.log("PASS browser fixture removed; existing data preserved");
  } finally { await pool.end(); }
}
