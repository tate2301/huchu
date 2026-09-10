import { test as setup, expect } from "@playwright/test";

import { authFile, ensureAuthDir } from "./_support/auth-state";
import { signIn, portalSignIn } from "./_support/auth";
import {
  CRM,
  GOLD,
  ORIGIN,
  PAYROLL,
  PREVIEW_HOST_COOKIE,
  RETAIL,
  SCHOOL,
  tenantHost,
  type PortalKey,
  type Tenant,
} from "./_support/tenants";

/**
 * Sign in once per person, and save the session for every test that needs it.
 *
 * This file runs before the suites, as the `setup` project in
 * `playwright.config.ts`. Each entry below produces one `storageState` file
 * under `e2e/.auth/`, which the suites load instead of signing in themselves.
 *
 * ## Why this exists
 *
 * Because signing in per test does not scale. The gold suite took **2.6 hours
 * for 17 tests** when every test signed in; the tests ran in 20–60 seconds and
 * the remainder was authentication. Multiply by five verticals and roughly a
 * hundred route tests and the suite becomes something nobody runs, which makes
 * it worth nothing however good the assertions are.
 *
 * ## What is saved
 *
 * The session cookie **and** `__huchu_preview_host`. The nomination is what
 * makes one origin behave as a given tenant, so it belongs to the session as
 * much as the token does — which is why these files are per tenant *and* per
 * role, not per role alone.
 *
 * The files hold live credentials for the local e2e database. They are
 * gitignored, and they are worthless anywhere else: the tenants only exist in
 * `huchu_e2e` on localhost.
 */

const PEOPLE: Array<{ tenant: Tenant; who: string; portal?: PortalKey }> = [
  { tenant: RETAIL, who: "manager" },
  { tenant: RETAIL, who: "cashier", portal: "pos" },
  { tenant: PAYROLL, who: "admin" },
  { tenant: CRM, who: "owner" },
  { tenant: GOLD, who: "admin" },
  { tenant: GOLD, who: "clerk" },
  { tenant: SCHOOL, who: "head" },
  { tenant: SCHOOL, who: "student", portal: "student" },
  { tenant: SCHOOL, who: "parent", portal: "parent" },
  { tenant: SCHOOL, who: "teacher", portal: "teacher" },
];

ensureAuthDir();

for (const person of PEOPLE) {
  const label = `${person.tenant.slug}/${person.who}${person.portal ? ` (${person.portal})` : ""}`;

  setup(`sign in ${label}`, async ({ browser }) => {
    setup.setTimeout(180_000);

    const context = await browser.newContext({ baseURL: ORIGIN });
    // Nominate before signing in: the login form is branded per tenant, and the
    // credentials are only valid against the tenant the host resolves to.
    await context.addCookies([
      {
        name: PREVIEW_HOST_COOKIE,
        value: tenantHost(person.tenant),
        domain: new URL(ORIGIN).hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const page = await context.newPage();
    if (person.portal) {
      await portalSignIn(page, person.tenant, person.portal, person.who);
    } else {
      await signIn(page, person.tenant, person.who);
    }

    const cookies = await context.cookies();
    expect(
      cookies.some((cookie) => cookie.name.includes("session-token")),
      `${label} should hold a session after sign-in`,
    ).toBe(true);

    await context.storageState({ path: authFile(person.tenant, person.who) });
    await context.close();
  });
}
