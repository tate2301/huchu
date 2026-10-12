// Screenshot helper for the handover: session(email, password?, w?, h?) -> {browser, ctx, page, shot(name)}.
// Needs playwright (npx playwright, or a global install). Shots go to SMOKE_OUT (default ./.handover-shots/).
const { chromium } = require('playwright');
const BASE = process.env.SMOKE_BASE || 'http://hurudza-creative.apps.localtest.me:3000';
const OUT = process.env.SMOKE_OUT || require('path').join(process.cwd(), '.handover-shots/');
async function session(email, password = 'RetailDemo123!', w = 1440, h = 1000) {
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP *.localtest.me 127.0.0.1'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('button[type="submit"]');
  for (let i = 0; i < 90; i++) {
    const cookies = await ctx.cookies();
    if (cookies.some((c) => /session-token/.test(c.name))) break;
    await page.waitForTimeout(1000);
  }
  return { browser, ctx, page, shot: (name) => page.screenshot({ path: OUT + name + '.png', fullPage: false }) };
}
module.exports = { session, OUT, BASE };
