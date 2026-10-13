// Sign in to a local workspace and save the browser state for designcheck.
//
//   DC_EMAIL=… DC_PASSWORD=… node design/core-modules/tools/check/signin.mjs <slug> <out.json>
//
// Local seeded accounts only (scripts/seed-staging-tenant.ts sets one). Never a real person's login.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../../../package.json"))("@playwright/test");
const [slug, out] = process.argv.slice(2);
const origin = `http://${slug}.apps.pagka.local:${process.env.PORT || 3100}`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE || "/opt/pw-browsers/chromium",
  args: ["--host-resolver-rules=MAP *.pagka.local 127.0.0.1"],
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: "*.pagka.local,localhost,127.0.0.1" } } : {}),
});
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${origin}/login`, { timeout: 180000 });
await page.fill("#login-email", process.env.DC_EMAIL);
await page.fill("#login-password", process.env.DC_PASSWORD);
await page.click('button[type="submit"]');
for (let i = 0; i < 90 && !(await context.cookies()).some((c) => c.name.includes("session-token")); i++) await page.waitForTimeout(1000);
await page.waitForTimeout(2000);
await context.storageState({ path: out });
console.log("signed in:", page.url());
await browser.close();
