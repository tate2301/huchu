// Visual acceptance: every screen's /design/<slug> fixture route at 1440, 390 and 1440 dark, against the canvas references (2x).
// npm i -D @playwright/test pixelmatch pngjs sharp && BASE_URL=http://localhost:3000 npx playwright test design/tests
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';

const ROOT = path.resolve(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec/screens.json'), 'utf8'));
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const FREEZE = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

for (const s of spec.screens) {
  for (const side of ['desktop', 'phone', 'dark'] as const) {
    const v = s[side];
    test(`${s.slug} · ${side}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.width < 600 ? 844 : 900 }, deviceScaleFactor: v.scale, colorScheme: side === 'dark' ? 'dark' : 'light' });
      const page = await ctx.newPage();
      await page.goto(BASE + s.fixture_route, { waitUntil: 'networkidle' });
      if (side === 'dark') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await page.addStyleTag({ content: FREEZE });
      await page.evaluate(() => document.fonts.ready);
      const shot = await page.screenshot({ fullPage: true });
      await ctx.close();

      const ref = sharp(path.join(ROOT, v.reference)).ensureAlpha();
      const { width: rw, height: rh } = (await ref.metadata()) as { width: number; height: number };
      const got = sharp(shot).ensureAlpha();
      const { width: gw, height: gh } = (await got.metadata()) as { width: number; height: number };
      expect(gw, 'width').toBe(rw);
      expect(Math.abs(gh - rh) / v.scale, 'page height within 8px of the reference').toBeLessThanOrEqual(8);

      const h = Math.min(gh, rh);
      const a = await ref.extract({ left: 0, top: 0, width: rw, height: h }).raw().toBuffer();
      const b = await got.extract({ left: 0, top: 0, width: rw, height: h }).raw().toBuffer();
      const diff = Buffer.alloc(rw * h * 4);
      const share = pixelmatch(a, b, diff, rw, h, { threshold: 0.1 }) / (rw * h);
      if (share > 0.01) {
        const out = path.join(ROOT, 'tests/diff');
        fs.mkdirSync(out, { recursive: true });
        await sharp(diff, { raw: { width: rw, height: h, channels: 4 } }).png().toFile(path.join(out, `${s.slug}-${side}.png`));
      }
      expect(share, `${(share * 100).toFixed(2)}% of pixels differ (diff in tests/diff)`).toBeLessThanOrEqual(0.01);
    });
  }
}
