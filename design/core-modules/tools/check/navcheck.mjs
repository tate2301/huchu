// Every link in a module's panel must keep you in that module: the panel you clicked in is the panel
// you land in. Starts at each page given, follows every link in its panel, and lists each that lands
// under a different panel (or none).
//
//   node design/core-modules/tools/check/navcheck.mjs --state <state.json> <origin> /books /reports /crm/deals ...
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../../../package.json"))("@playwright/test");
const argv = process.argv.slice(2);
const at = argv.indexOf("--state");
const state = at >= 0 ? argv.splice(at, 2)[1] : undefined;
const [origin, ...starts] = argv;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE || "/opt/pw-browsers/chromium",
  args: ["--host-resolver-rules=MAP *.pagka.local 127.0.0.1"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(state ? { storageState: state } : {}) });
const page = await ctx.newPage();
const panelOf = () => page.evaluate(() => document.querySelector("aside[aria-label] nav[aria-label]")?.getAttribute("aria-label") ?? null);
const visit = async (url) => {
  // The panel is drawn by the shell before the page's data: wait for it, not for the network.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 }).catch(() => {});
  await page.waitForSelector("aside[aria-label] nav[aria-label] a[href]", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(300);
};
const bad = [];
let checked = 0;
for (const start of starts) {
  await visit(origin + start);
  const panel = await panelOf();
  const links = await page.evaluate(() =>
    [...document.querySelectorAll("aside[aria-label] nav[aria-label] a[href]")]
      .map((a) => ({ text: (a.textContent || "").replace(/\s+/g, " ").trim(), href: a.getAttribute("href") }))
      .filter((l) => l.href && l.href.startsWith("/")),
  );
  for (const link of links) {
    await visit(origin + link.href);
    checked++;
    const landed = await panelOf();
    if (landed !== panel) {
      const line = `${panel} › ${link.text} (${link.href}) → lands in ${landed ?? "no panel"} at ${new URL(page.url()).pathname}`;
      bad.push(line);
      console.log("  " + line);
    }
  }
}
console.log(`${checked} panel links followed; ${bad.length} leave their panel`);
await browser.close();
