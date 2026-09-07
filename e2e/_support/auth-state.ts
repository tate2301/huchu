import { mkdirSync } from "node:fs";

import type { Tenant } from "./tenants";

/**
 * Where a signed-in session is kept between tests.
 *
 * Signing in costs 15–25 seconds: a page load, a hydration wait, a form
 * submission, a bcrypt verify and a cookie poll. Doing that once per test made
 * the gold suite take **2.6 hours for 17 tests** — the tests themselves ran in
 * 20–60 seconds and the rest was sign-in.
 *
 * Playwright's answer is `storageState`: sign in once, save the cookies, and
 * hand them to every context afterwards. `auth.setup.ts` writes these files and
 * every suite reads them.
 *
 * The saved state carries **two** cookies that matter, not one: the session
 * token, and `__huchu_preview_host`, which is what makes a single origin behave
 * as this tenant. That is why there is a file per tenant *and* per role rather
 * than one per role — the nomination is part of the session.
 */

export const AUTH_DIR = "e2e/.auth";

export function authFile(tenant: Tenant, who: string): string {
  return `${AUTH_DIR}/${tenant.slug}.${who}.json`;
}

export function ensureAuthDir(): void {
  mkdirSync(AUTH_DIR, { recursive: true });
}
