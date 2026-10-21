// What each role sees. The server checks are tested in the app's own test framework from spec/permissions.json
// (every role x action, allowed and refused, plus the plan gate). This file checks the interface matches.
// Fixture routes take ?as=<role>&plan=core|screens|advanced.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec/permissions.json'), 'utf8'));
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const voidRow = P.actions.find((a: any) => a.key === 'void_revise');

for (const role of P.roles.filter((r: string) => r !== 'bursar' && r !== 'rep')) {
  test(`invoice · ${role} · void shown only when allowed`, async ({ page }) => {
    await page.goto(`${BASE}/design/books/invoice?as=${role}&plan=advanced`, { waitUntil: 'networkidle' });
    // Void sits in the record's More menu. Mark menu items with data-action (void, revise, delete).
    const item = page.locator('[data-action="void"]');
    if (voidRow[role] === 'Y') expect(await item.count(), 'void offered').toBeGreaterThan(0);
    else await expect(item).toHaveCount(0);
  });
}

test('advanced level on the $10 plan shows the upgrade, not the page', async ({ page }) => {
  await page.goto(`${BASE}/design/books/tax?as=owner&plan=screens`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: /move to the \$99 plan/i })).toBeVisible();
});

test('no Books screens: /books offers the add-on', async ({ page }) => {
  await page.goto(`${BASE}/design/books/money?as=owner&plan=core`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: /add books, \$10 a month/i })).toBeVisible();
});
