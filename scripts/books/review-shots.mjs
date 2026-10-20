/**
 * Each built Books screen beside its reference (design/books/reference), at
 * 1440, 390 and 1440 dark, in the local test workspace (scripts/books/world-seed.ts).
 *
 *   BASE_URL=http://localhost:3000 BOOKS_EMAIL=james@books-world.test BOOKS_PASSWORD=… \
 *     node scripts/books/review-shots.mjs bills=/books/bills bill=/books/bills/<id> …
 *
 * Each argument is `<slug>=<path>`; the slug is the board's without `bk-`.
 * Writes design/books/review/<slug>-<width>[-dark].png (reference left, the
 * app right) and prints, per shot, any sideways scroll at 390 and any text
 * overflowing its box: the two things that fail a screen outright.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const refs = path.join(root, "design/books/reference");
const out = path.join(root, "design/books/review");
const base = process.env.BASE_URL ?? "http://localhost:3000";
const tenant = process.env.BOOKS_TENANT ?? "books-world";
const email = process.env.BOOKS_EMAIL;
const password = process.env.BOOKS_PASSWORD;
if (!email || !password) throw new Error("Set BOOKS_EMAIL and BOOKS_PASSWORD (the test workspace's, from the seed's credentials file).");

const targets = process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("=");
  return { slug: arg.slice(0, at), path: arg.slice(at + 1) };
});
if (targets.length === 0) throw new Error("Name at least one <slug>=<path>.");

fs.mkdirSync(out, { recursive: true });
// The installed Google Chrome: no browser download needed (PW_CHANNEL=chromium for Playwright's own).
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });

async function signedIn(viewport, colorScheme) {
  const context = await browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${base}/login?__tenant=${tenant}`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  return { context, page };
}

const shots = [
  { width: 1440, height: 900, dark: false },
  { width: 390, height: 844, dark: false },
  { width: 1440, height: 900, dark: true },
];

for (const shot of shots) {
  const { context, page } = await signedIn({ width: shot.width, height: shot.height }, shot.dark ? "dark" : "light");
  // The app reads its theme from this key before the first paint (lib/theme/products.ts).
  if (shot.dark) await page.evaluate(() => localStorage.setItem("huchu.appearance", "dark")).catch(() => undefined);
  for (const target of targets) {
    // localhost is the admin portal's host in development: every address names the workspace.
    const url = `${base}${target.path}${target.path.includes("?") ? "&" : "?"}__tenant=${tenant}`;
    // A Books page never goes network-idle (the live channel and the notification poll stay open):
    // wait for the load, then for its loading bands to go.
    await page.goto(url, { waitUntil: "load", timeout: 180_000 }).catch(() => undefined);
    await page.waitForFunction(() => !document.querySelector(".k-load"), null, { timeout: 120_000 }).catch(() => undefined);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('[data-region="main"] :is(button, a, th, td, h1, h2, h3, [data-band])')]
        .filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== "ellipsis" && getComputedStyle(e).overflowX === "visible")
        .map((e) => (e.textContent ?? "").trim().slice(0, 40)),
    );
    const name = `${target.slug}-${shot.width}${shot.dark ? "-dark" : ""}.png`;
    // The shell scrolls inside a 100dvh frame; let the page run its full height for the shot.
    await page.addStyleTag({ content: ".shell-frame{height:auto!important;overflow:visible!important}main.content-shell{overflow:visible!important;flex:1 1 auto!important;min-width:0!important;width:100%!important;max-width:100%!important;height:auto!important}.ck.kit-main{height:auto!important;overflow:visible!important}" });
    const app = await page.screenshot({ fullPage: true });
    const reference = path.join(refs, `bk-${name}`);
    if (fs.existsSync(reference)) {
      const a = await sharp(reference).resize({ width: shot.width }).toBuffer();
      const am = await sharp(a).metadata();
      const bm = await sharp(app).metadata();
      await sharp({ create: { width: am.width + bm.width + 40, height: Math.max(am.height, bm.height), channels: 3, background: "#ffffff" } })
        .composite([
          { input: a, left: 0, top: 0 },
          { input: app, left: am.width + 40, top: 0 },
        ])
        .png()
        .toFile(path.join(out, name));
    } else {
      fs.writeFileSync(path.join(out, name), app);
    }
    const faults = [shot.width < 600 && sideways > 0 ? `scrolls sideways by ${sideways}px` : null, overflow.length ? `overflows: ${overflow.join(" | ")}` : null].filter(Boolean);
    console.log(`${name}: ${faults.length ? faults.join("; ") : "ok"}`);
  }
  await context.close();
}
await browser.close();
