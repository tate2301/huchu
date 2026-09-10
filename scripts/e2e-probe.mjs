/**
 * Open pages as a real signed-in user and print what is actually on them.
 *
 *   node scripts/e2e-probe.mjs e2e/.auth/stmarys.head.json schools/goals,schools/staff
 *   node scripts/e2e-probe.mjs none home/pricing,home/faq
 *
 * Arguments: a `storageState` file from `e2e/.auth/` (or `none` for a signed-out
 * context), then one comma-separated list of paths. Leading slashes optional —
 * omit them under Git Bash on Windows, which rewrites a leading `/` into a
 * drive path before node ever sees it.
 *
 * For each path it prints where the request landed, the document title and the
 * first few headings, the opening of the main content, and any console errors.
 *
 * ## Why this exists
 *
 * Two full days of this exercise were lost to guessing at pages nobody had
 * opened. `retail-void` took seven wrong diagnoses; three assertions were
 * written against vocabulary the product does not use; a `Route.expect` was
 * copied from a truncated log line and matched a word in the sidebar. Every one
 * of those was ended in under a minute by loading the page and reading it, and
 * the note in `docs/testing/e2e-status.md` is blunt about the lesson: **stop
 * guessing at step three and look at the screen.**
 *
 * So this is the tool for step three, and it is deliberately not a test. It
 * asserts nothing and fixes nothing. It is what you run *before* writing an
 * assertion, so the assertion describes the product that exists.
 *
 * ## It is also the fastest way to answer "why is this blocked"
 *
 * A path that lands on `/access-blocked` prints that as its destination, which
 * turns a guess about entitlement into a fact in one line. That is how the
 * three POS entitlement bugs were found: `/portal/pos/customers` printed
 * `->/access-blocked` for a cashier, and the console lines underneath named the
 * two APIs that 403'd on every other till screen.
 *
 * Reads only. It signs into nothing it was not given a session for, and it
 * writes nothing anywhere.
 */

import { chromium } from "@playwright/test";

const ORIGIN = process.env.E2E_BASE_URL ?? "http://acme.apps.pagka.local:300";

const [, , stateArg, list] = process.argv;

if (!stateArg || !list) {
  console.error("usage: node scripts/e2e-probe.mjs <storageState|none> <path,path,...>");
  process.exitCode = 1;
  process.exit();
}

const storageState = stateArg === "none" ? undefined : stateArg;
const routes = list.split(",").map((route) => `/${route.trim().replace(/^\/+/, "")}`);

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome" });
const context = await browser.newContext(
  storageState ? { storageState, baseURL: ORIGIN } : { baseURL: ORIGIN },
);
const page = await context.newPage();

const errors = [];
page.on("console", (message) => {
  if (message.type() !== "error") return;
  // The URL is in `location()`, not in the text — see the note in
  // `e2e/_support/assert.ts`. Without it a 404 says nothing about what 404'd.
  errors.push(`${message.text()} [${message.location()?.url ?? ""}]`);
});
page.on("pageerror", (error) => errors.push(`PAGEERROR ${error.message}`));

for (const route of routes) {
  errors.length = 0;
  let landed = "?";
  let text = "";

  try {
    await page.goto(route, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Time-boxed: the app holds an open SSE stream, so the network is never
    // idle and an unbounded wait never returns.
    await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});
    landed = new URL(page.url()).pathname;

    const headings = await page.evaluate(() =>
      [
        document.title,
        ...[...document.querySelectorAll("h1,h2")].slice(0, 4).map((node) => node.textContent.trim()),
      ]
        .filter(Boolean)
        .join(" | "),
    );
    const body = await page
      .locator("main")
      .first()
      .innerText({ timeout: 5_000 })
      .catch(() => page.locator("body").innerText());
    text = `${headings} :: ${body.replace(/\s+/g, " ").slice(0, 700)}`;
  } catch (error) {
    text = `THREW ${String(error).split("\n")[0]}`;
  }

  console.log("");
  console.log(`### ${route}${landed === route ? "" : `  ->${landed}`}`);
  console.log(text);
  if (errors.length > 0) {
    for (const error of [...new Set(errors)].slice(0, 6)) console.log(`  !! ${error}`);
  }
}

await browser.close();
