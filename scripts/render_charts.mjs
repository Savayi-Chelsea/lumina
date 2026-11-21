// Renders evaluation/figures/*.svg to 2x PNG for Word or PDF, using the Playwright
// Chromium the end-to-end tests already install (npx playwright install chromium).
//   node scripts/render_charts.mjs
import { readdir, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const dir = "evaluation/figures";
const files = (await readdir(dir)).filter(name => name.endsWith(".svg")).sort();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const name of files) {
    const svg = await readFile(`${dir}/${name}`, "utf8");
    const [, width, height] = svg.match(/width="(\d+)" height="(\d+)"/);
    await page.setViewportSize({ width: Number(width), height: Number(height) });
    await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
    await page.locator("svg").screenshot({ path: `${dir}/${name.replace(/\.svg$/, ".png")}` });
    console.log(`wrote ${dir}/${name.replace(/\.svg$/, ".png")}`);
  }
} finally { await browser.close(); }
