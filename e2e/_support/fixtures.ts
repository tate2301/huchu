import { test as base, type BrowserContext, type Page } from "@playwright/test";

import {
  ORIGIN,
  PREVIEW_HOST_COOKIE,
  tenantHost,
  type PortalKey,
  type Tenant,
} from "./tenants";
import { watchConsole, type ConsoleWatcher } from "./assert";
import { authFile } from "./auth-state";
import { recordApiCalls } from "./api-coverage";

/**
 * The test object every spec in this suite imports instead of `@playwright/test`.
 *
 * It does two things a bare `test` cannot.
 *
 * **It nominates the host**, so one origin can be five tenants and four
 * portals — see the long note in `tenants.ts` for why that is necessary here
 * and why it is not a bypass.
 *
 * It does so with the `__huchu_preview_host` cookie rather than the
 * `x-huchu-preview-host` header, even though `STAGING_PREVIEW.md` names the
 * header as the one for the e2e suite. The header is right for curl. In a
 * browser it is wrong: Playwright's `extraHTTPHeaders` is applied to *every*
 * request the context makes, cross-origin ones included, and a custom header on
 * a cross-origin request triggers a CORS preflight. The first run of this suite
 * failed on exactly that —
 *
 *   Access to font at 'https://fonts.gstatic.com/...' has been blocked by CORS
 *   policy: Request header field x-huchu-preview-host is not allowed by
 *   Access-Control-Allow-Headers in preflight response.
 *
 * — which is the harness breaking the page it is meant to be photographing. A
 * cookie is scoped to the origin by construction and cannot leak to Google.
 *
 * **It watches the console.** A spec that only navigates will happily pass over
 * a page that threw. Attaching the watcher as a fixture means it is attached
 * before the first `goto` in every test, which is the only time it can catch
 * anything.
 *
 * Usage:
 *
 *     import { test, expect } from "./_support/fixtures"
 *     import { RETAIL } from "./_support/tenants"
 *
 *     test.use({ tenant: RETAIL })
 *
 *     test("the shop opens", async ({ page, console_ }) => {
 *       await page.goto("/retail")
 *       console_.assertClean()
 *     })
 */

type Options = {
  /** Which tenant this file's tests belong to. Set with test.use(). */
  tenant: Tenant;
  /** Nominate a portal host instead of the tenant's main host. */
  portal: PortalKey | null;
  /**
   * Whose saved session to start from — a key from the tenant's `logins`.
   *
   * Set it and the test starts signed in, with no login round trip. Leave it
   * null for a test that must drive sign-in itself (the refusal tests, the
   * sign-out test), which then gets a clean context.
   */
  as: string | null;
};

type Fixtures = {
  console_: ConsoleWatcher;
  /** Open a second context on a different host — for portal-vs-admin cross-checks. */
  openOn: (tenant: Tenant, portal?: PortalKey | null) => Promise<Page>;
};

export const test = base.extend<Options & Fixtures>({
  tenant: [undefined as unknown as Tenant, { option: true }],
  portal: [null, { option: true }],
  as: [null, { option: true }],

  context: async ({ browser, tenant, portal, as, contextOptions }, use) => {
    if (!tenant) {
      throw new Error(
        "No tenant for this spec. Add test.use({ tenant: RETAIL }) — or another from _support/tenants.",
      );
    }

    /*
      With `as`, start from the session `auth.setup.ts` already established. The
      saved state carries both the session token and the host nomination, so
      there is nothing left to set up and nothing to sign in.

      This is the difference between a suite that runs in minutes and one that
      runs in hours: signing in costs 15-25s, and the gold suite spent 2.6 hours
      on 17 tests doing it once per test.
    */
    const context = as
      ? await browser.newContext({
          ...contextOptions,
          baseURL: ORIGIN,
          storageState: authFile(tenant, as),
        })
      : await browser.newContext({ ...contextOptions, baseURL: ORIGIN });

    if (!as) await nominate(context, tenant, portal);

    /*
      Record which API routes this run touches.

      Page coverage can be counted from the specs; API coverage cannot, because
      no spec names an endpoint — the pages call them. Watching every context
      is the only measure that is true, and it costs one appended line per
      request. `scripts/e2e-coverage.mjs --api` reads it back.
    */
    recordApiCalls(context);

    await use(context);
    await context.close();
  },

  console_: async ({ page }, use) => {
    await use(watchConsole(page));
  },

  openOn: async ({ browser, contextOptions }, use) => {
    const opened: BrowserContext[] = [];
    await use(async (tenant, portal = null) => {
      const context = await browser.newContext({ ...contextOptions, baseURL: ORIGIN });
      await nominate(context, tenant, portal);
      opened.push(context);
      return context.newPage();
    });
    for (const context of opened) await context.close();
  },
});

/**
 * Tell this context which host to be, by planting the cookie the proxy would
 * have set from `?__host=`. Doing it directly saves a navigation and a redirect
 * per context, and means the very first page a test loads is already the right
 * tenant — which matters, because the login form is branded per tenant and the
 * smoke test asserts on that.
 *
 * Exported because `context.clearCookies()` clears this one too. A test that
 * signs one person out to sign another in loses the host nomination in the
 * same breath and, from then on, is talking to the central host — which serves
 * pages but refuses the tenant's APIs. That looked exactly like a role-gating
 * bug in `cross-cutting.spec.ts` and was not. Clear cookies, then re-nominate.
 */
export async function nominate(
  context: BrowserContext,
  tenant: Tenant,
  portal: PortalKey | null,
): Promise<void> {
  /*
    ## Portals nominate the tenant host, not the portal host

    A portal host — `students.stmarys.…` — resolves correctly: on 2026-09-01 the
    proxy was observed reporting `tenantSlug=stmarys, portalPath=/portal/student`
    for exactly that nomination. But the rewrite that should turn `/login` into
    `/portal/student/login` does not happen under nomination, and every path on
    a nominated portal host serves the tenant's main sign-in form instead. The
    same is true of `pos.acme.…`, so it is not school-specific.

    The portal pages themselves are fine. Asked for directly on the *tenant*
    host, `/portal/student/login`, `/portal/parent/login` and
    `/portal/teacher/login` each render the portal form (`#portal-email`) with
    the right tenant branding. So that is the route taken here: nominate the
    tenant, drive the portal by its internal path.

    What this costs: the suite exercises portal UI, portal auth and portal role
    gating, but not the host-prefix rewrite. That rewrite deserves a test of its
    own once the interaction is understood — it may be an artefact of preview
    nomination rather than a production bug, and until somebody has looked, this
    comment is the honest description of the gap.

    `portal` still matters: it is what `portalSignIn` uses to pick the path.
  */
  void portal;
  const host = tenantHost(tenant);
  const url = new URL(ORIGIN);
  await context.addCookies([
    {
      name: PREVIEW_HOST_COOKIE,
      value: host,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

export { expect } from "@playwright/test";
