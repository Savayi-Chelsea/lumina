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
const failures = [];
const screenshots = [];
const snapshot = async () => {
  const result = {};
  for (const table of ["users", "profiles", "alumni_registry", "verification_assistance_requests", "profile_embeddings", "profile_skills", "skills", "mentorship_preferences", "work_experience"]) {
    result[table] = JSON.stringify((await pool.query(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows);
  }
  return result;
};
async function noOverflow(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label}: page must fit viewport`);
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
  await expect(page.getByRole("button",{ name: "Continue with Google" })).toHaveCount(1);
  for (const copy of ["Personal Gmail", "Google authentication succeeded", "Alumni verification is handled separately"]) await expect(page.locator("body")).not.toContainText(copy);
  await noOverflow(page,"desktop landing"); await screenshot(page,"landing-desktop");
  await page.getByRole("link",{ name: "The community", exact: true }).click();
  await expect(page).toHaveURL(/#reconnect$/);
  await page.setViewportSize({ width: 375, height: 812 }); await page.goto(base); await noOverflow(page,"mobile landing"); await screenshot(page,"landing-mobile");
  await page.goto(`${base}/sign-in?error=example`); await expect(page.getByRole("main").getByRole("alert")).toContainText("could not sign you in");
  console.log("PASS scrollable public landing, single CTA, error state and responsive layouts");

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
  const menu = page.getByRole("button",{ name: "Open account menu" });
  await menu.focus(); await page.keyboard.press("Enter"); await expect(menu).toHaveAttribute("aria-expanded","true");
  await expect(page.getByRole("link",{ name: "Account", exact: true })).toBeVisible();
  await expect(page.getByRole("button",{ name: "Sign out", exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(menu).toBeFocused();
  await menu.click(); await page.getByRole("heading",{ level: 1 }).click(); await expect(menu).toHaveAttribute("aria-expanded","false");
  await page.getByRole("button",{ name: "Meet this mentor: Amina Kariuki", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible(); await expect(page.getByRole("dialog")).toContainText("Fictional demonstration content");
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button",{ name: "Meet this mentor: Amina Kariuki", exact: true })).toBeFocused();
  console.log("PASS pending state, keyboard account disclosure, focus return and accessible preview dialog");

  await page.getByRole("link",{ name: "Network", exact: true }).click();
  await page.getByRole("searchbox",{ name: "Find a fictional profile" }).fill("Cabin");
  await expect(page.getByRole("article")).toHaveCount(1); await expect(page.getByRole("heading",{ name: "Terry Mutua" })).toBeVisible();
  await page.getByRole("searchbox").fill("no-such-profile"); await expect(page.getByRole("heading",{ name: "No previews found" })).toBeVisible();
  await page.getByRole("button",{ name: "Clear filters", exact: true }).click(); await expect(page.getByRole("article")).toHaveCount(6);
  await page.getByRole("button",{ name: "Finance", exact: true }).click(); await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("link",{ name: "Mentorship", exact: true }).click();
  await expect(page.getByRole("heading",{ name: "Your alumni journey starts with verification." })).toBeVisible();
  await expect(page.getByRole("button",{ name: "Find mentors", exact: true })).toHaveCount(0);
  await page.getByRole("link",{ name: "Events", exact: true }).click(); await page.getByRole("button",{ name: "Online", exact: true }).click(); await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByRole("link",{ name: "Opportunities", exact: true }).click(); await page.getByRole("button",{ name: "Volunteer", exact: true }).click(); await expect(page.getByRole("article")).toHaveCount(1);
  console.log("PASS local directory filtering, empty/reset state, mentorship, events and opportunities previews");

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
  await page.getByRole("link",{ name: "Mentorship", exact: true }).click();
  await page.getByRole("button",{ name: "Find mentors", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Describe");
  const query = page.getByRole("textbox",{ name: "What would you like mentorship with?" });
  await query.fill("a".repeat(501)); await expect(query).toHaveValue("a".repeat(500));
  await expect(page.getByText("500 / 500 characters",{ exact: true })).toBeVisible();
  await page.getByRole("button",{ name: /I want to move from IT support/ }).click();
  let mode = "loading";
  let releaseSearch;
  const release = new Promise(resolve => { releaseSearch = resolve; });
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
  await page.setViewportSize({ width: 375, height: 812 }); await noOverflow(page,"mobile live mentorship");
  await screenshot(page,"mentorship-results-mobile");
  await page.unroute("**/api/mentorship/search");
  await page.goto(base);
  console.log("PASS mentorship validation, character counter, prompts, loading, ranked cards, no-match, unavailable, malformed and retry states");
  for (const width of [320, 375, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 }); await noOverflow(page,`${width}px home`);
    for (const destination of ["Network","Mentorship","Events","Opportunities","Profile"]) await expect(page.getByRole("navigation",{ name: "Alumni navigation" }).getByRole("link",{ name: destination, exact: true })).toHaveCount(1);
  }
  await page.setViewportSize({ width: 375, height: 812 }); await screenshot(page,"home-mobile");
  await page.getByRole("link",{ name: "Network", exact: true }).click(); await noOverflow(page,"mobile directory");
  await screenshot(page,"network-mobile");
  console.log("PASS real profile save/progress, verified status and 320–1440px home layouts");

  await pool.query("UPDATE public.users SET role='admin' WHERE id=$1 AND google_subject=$2",[fixtureId,subject]);
  await page.goto(`${base}/admin/verification`); await expect(page.getByRole("heading",{ name: "Verification assistance", exact: true })).toBeVisible();
  await noOverflow(page,"mobile admin exceptions");
  await page.goto(`${base}/`); await page.getByRole("button",{ name: "Open account menu" }).click();
  await page.getByRole("button",{ name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading",{ level: 1 })).toContainText("Reconnect");
  assert.deepEqual(failures,[],"No browser runtime errors");
  await writeFile(`${output}/browser-report.json`,JSON.stringify({ passed: true, screenshots, runtimeErrors: failures },null,2));
  console.log("PASS admin exceptions remain accessible only to admins; actual sign out returns to landing");
} finally {
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null) { const stopped = once(server,"exit"); server.kill(); await stopped; }
  try {
    if (fixtureId) await pool.query("DELETE FROM public.users WHERE id=$1 AND google_subject=$2",[fixtureId,subject]);
    if (originalData) assert.deepEqual(await snapshot(), originalData, "All existing data must remain unchanged");
    console.log("PASS browser fixture removed; existing data preserved");
  } finally { await pool.end(); }
}
