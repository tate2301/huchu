// Review set: each built screen beside its reference, at 1440, 390 and 1440 dark, saved to design/review/.
// Fails only on sideways page scroll at 390 or text overflowing its box. The owner reviews the images.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec/screens.json'), 'utf8'));
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.join(ROOT, 'review');

for (const s of spec.screens) {
  for (const ref of s.references as string[]) {
    const m = ref.match(/-(\d+)(-dark)?\.png$/)!;
    const width = Number(m[1]); const dark = !!m[2];
    test(`${s.slug} · ${width}${dark ? ' · dark' : ''}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light' });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/design/books/${s.slug}${dark ? '?theme=dark' : ''}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const overflow = await page.evaluate(() => [...document.querySelectorAll('button, a, th, td, h1, h2, h3, [data-band]')]
        .filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis' && getComputedStyle(e).overflowX === 'visible')
        .map((e) => (e.textContent ?? '').trim().slice(0, 40)));
      const shot = await page.screenshot({ fullPage: true });
      await ctx.close();
      fs.mkdirSync(OUT, { recursive: true });
      const a = await sharp(path.join(ROOT, ref)).metadata(); const b = await sharp(shot).metadata();
      await sharp({ create: { width: a.width! + b.width! + 40, height: Math.max(a.height!, b.height!), channels: 3, background: '#ffffff' } })
        .composite([{ input: path.join(ROOT, ref), left: 0, top: 0 }, { input: shot, left: a.width! + 40, top: 0 }])
        .png().toFile(path.join(OUT, path.basename(ref)));
      if (width < 600) expect(sideways, 'no sideways page scroll at 390').toBeLessThanOrEqual(0);
      expect(overflow, 'text overflowing its box').toEqual([]);
    });
  }
}
