// Parity: each /design/<slug> fixture route against the kit's own HTML for that screen
// (html/<slug>.html), both rendered here, in the same browser, at 1440, 390 and 1440 dark.
//
// visual.spec.ts compares with the reference PNGs, which were rendered on another machine: the
// kit's own HTML differs from them by 0.2% to 1.7% here, before any app code is involved, because
// the text rasterises differently. This test takes the machine out, so what it measures is the
// app's markup and styles against the kit's. Same thresholds: 1% of pixels, 8px of height.
//
//   BASE_URL=http://localhost:3000 npx playwright test -c design/core-modules/tests parity
//
// Only screens whose fixture route exists (app/design/<slug>/page.tsx) are compared;
// `spec/screens.json` lists them all.
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';

const ROOT = path.resolve(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec/screens.json'), 'utf8'));
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const FREEZE = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
const APP_DESIGN = path.resolve(ROOT, '../../app/design');
const BUILT = new Set(
  spec.screens
    .map((s: { slug: string }) => s.slug)
    .filter((slug: string) => fs.existsSync(path.join(APP_DESIGN, slug, 'page.tsx'))),
);

async function shoot(page: Page, url: string, dark: boolean) {
  await page.goto(url, { waitUntil: 'networkidle' });
  if (dark) await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.addStyleTag({ content: FREEZE });
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ fullPage: true });
}

for (const s of spec.screens) {
  if (!BUILT.has(s.slug)) continue;
  for (const side of ['desktop', 'phone', 'dark'] as const) {
    const v = s[side];
    test(`parity ${s.slug} · ${side}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.width < 600 ? 844 : 900 }, deviceScaleFactor: v.scale });
      const page = await ctx.newPage();
      const kit = await shoot(page, `file://${path.join(ROOT, 'html', `${s.slug}.html`)}`, side === 'dark');
      const app = await shoot(page, BASE + s.fixture_route, side === 'dark');
      await ctx.close();

      const a = sharp(kit).ensureAlpha();
      const b = sharp(app).ensureAlpha();
      const { width: kw, height: kh } = (await a.metadata()) as { width: number; height: number };
      const { width: aw, height: ah } = (await b.metadata()) as { width: number; height: number };
      expect(aw, 'width').toBe(kw);
      expect(Math.abs(ah - kh) / v.scale, 'page height within 8px of the kit').toBeLessThanOrEqual(8);
      const h = Math.min(kh, ah);
      const ra = await a.extract({ left: 0, top: 0, width: kw, height: h }).raw().toBuffer();
      const rb = await b.extract({ left: 0, top: 0, width: kw, height: h }).raw().toBuffer();
      const diff = Buffer.alloc(kw * h * 4);
      const share = pixelmatch(ra, rb, diff, kw, h, { threshold: 0.1 }) / (kw * h);
      if (share > 0.01) {
        const out = path.join(ROOT, 'tests/diff');
        fs.mkdirSync(out, { recursive: true });
        await sharp(diff, { raw: { width: kw, height: h, channels: 4 } }).png().toFile(path.join(out, `parity-${s.slug}-${side}.png`));
      }
      expect(share, `${(share * 100).toFixed(2)}% of pixels differ from the kit (diff in tests/diff)`).toBeLessThanOrEqual(0.01);
    });
  }
}
