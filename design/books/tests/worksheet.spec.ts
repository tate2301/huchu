// Worksheet and layout acceptance for Books. Fixture routes: /design/books/<slug> (development only).
// npm i -D @playwright/test sharp && BASE_URL=http://localhost:3000 npx playwright test design/tests
import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec/screens.json'), 'utf8'));
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PHONE = (s: any) => /^p-|^x-crm-cost$/.test(s.slug);
const url = (s: any, q = '') => `${BASE}/design/books/${s.slug}${q}`;
// The accountant's path is dense: 32px rows. The owner's path: 40px.
const rowHeight = (s: any) => (s.tier === 'advanced' ? 32 : 40);
const box = async (page: Page, band: string) => page.locator(`[data-band="${band}"]`).first().boundingBox();

for (const s of spec.screens.filter((s: any) => s.worksheet && !PHONE(s))) {
  test(`${s.slug} · bands`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url(s), { waitUntil: 'networkidle' });
    for (const [band, h] of [['appbar', 48], ['head', 34], ['row', rowHeight(s)]] as const) {
      const b = await box(page, band);
      expect(b, `${band} present`).not.toBeNull();
      expect(Math.round(b!.height), `${band} height`).toBe(h);
    }
  });

  test(`${s.slug} · keys and paging`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url(s), { waitUntil: 'networkidle' });
    const rows = page.locator('[data-band="row"]');
    const before = await rows.count();
    await page.mouse.wheel(0, 20000);
    await page.waitForTimeout(400);
    expect(await rows.count(), 'no infinite scroll').toBe(before);
    if (before > 1) {
      await rows.first().click({ position: { x: 4, y: 4 } });
      await page.keyboard.press('j');
      await expect(rows.nth(1)).toBeFocused();
      await page.keyboard.press('k');
      await expect(rows.first()).toBeFocused();
    }
  });
}

// Edge to edge (owner, 19 Oct 2026): nothing in the main region is inset or centred.
for (const s of spec.screens.filter((s: any) => !PHONE(s))) {
  test(`${s.slug} · edge to edge`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url(s), { waitUntil: 'networkidle' });
    const main = page.locator('[data-region="main"]').first();
    await expect(main, 'mark the main region with data-region="main"').toBeVisible();
    const off = await main.evaluate((m) => {
      const r = m.getBoundingClientRect();
      const kids = [...m.querySelectorAll(':scope > *, :scope > * > *')].filter((e) => {
        const b = e.getBoundingClientRect();
        if (e.closest('[role=dialog], dialog')) return false;
        return b.height > 24 && getComputedStyle(e).position !== 'fixed' && getComputedStyle(e).position !== 'absolute';
      });
      // A block that starts inside main must start at its left edge and end at its right edge, unless it sits in a column grid.
      return kids.filter((e) => {
        const b = e.getBoundingClientRect();
        const parent = e.parentElement!;
        const grid = ['grid', 'flex'].includes(getComputedStyle(parent).display) && getComputedStyle(parent).flexDirection !== 'column' && parent !== m;
        if (grid) return false;
        return Math.abs(b.left - r.left) > 1 || Math.abs(b.right - r.right) > 1;
      }).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`.slice(0, 60));
    });
    expect(off, 'blocks inset or centred inside main').toEqual([]);
  });
}

// One world: the Money fixture shows the world's totals exactly.
test('money · world totals', async ({ page }) => {
  const w = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec/world.json'), 'utf8'));
  const money = (n: number) => '$' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/design/books/money`, { waitUntil: 'networkidle' });
  const text = (await page.locator('body').innerText()).replace(/\s+/g, '');
  for (const n of [w.totals.owedToYou, w.totals.overdue, w.totals.cameInThisMonth, w.totals.wentOutThisMonth, w.totals.youOwe, w.totals.cashTotalUSD]) {
    expect(text, `shows ${money(n)}`).toContain(money(n));
  }
});

// One line per row, icons where people scan, and no explaining (owner, 19 to 20 Oct 2026).
for (const s of spec.screens.filter((s: any) => !PHONE(s))) {
  test(`${s.slug} · one line, icons, no notes`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url(s), { waitUntil: 'networkidle' });
    const tall = await page.locator('[data-band="row"]').evaluateAll((rows) => rows.filter((r) => r.getBoundingClientRect().height > 41).length);
    expect(tall, 'rows taller than their band').toBe(0);
    const bare = await page.locator('nav [aria-current="page"], [data-panel] a, header h1').evaluateAll((els) => els.filter((e) => !e.querySelector('svg')).map((e) => (e.textContent ?? '').trim().slice(0, 30)));
    expect(bare, 'panel rows and titles without an icon').toEqual([]);
    const notes = await page.locator('[data-note]').evaluateAll((els) => els.filter((e) => !['warn', 'bad'].includes(e.getAttribute('data-note') ?? '') || !e.querySelector('button, a')).map((e) => (e.textContent ?? '').trim().slice(0, 40)));
    expect(notes, 'explanatory notes, or warnings without an action').toEqual([]);
  });
}
