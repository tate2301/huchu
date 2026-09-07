import { expect, type Page } from "@playwright/test";

import { loginFor, type PortalKey, type Tenant } from "./tenants";

/**
 * One sign-in, for every surface.
 *
 * Four specs each had their own copy of this. They had drifted: `retail-shots`
 * waited 2500ms for hydration and surfaced the refusal text, `crm-overlays`
 * waited 2000ms and did not — so a wrong password there timed out after 45
 * seconds on a silent `false` instead of saying "sign-in refused".
 *
 * The two forms differ in one way that matters and no other. The main app's
 * `/login` uses `#login-email` / `#login-password`
 * (`components/auth/login-form.tsx`); all four portals share
 * `components/auth/portal-login-form.tsx`, which uses `#portal-email` /
 * `#portal-password`. Everything else — the hydration wait, the cookie poll,
 * the redirect park — is identical and lives once, here.
 *
 * Which tenant a page belongs to is decided by the context's nomination header,
 * not by anything here. These functions take relative paths and the fixture
 * decides where they land. See `fixtures.ts`.
 */

/** How long to wait for a session cookie before giving up. */
const SIGN_IN_TIMEOUT_MS = 45_000;

/**
 * Clicking before React hydrates submits the form as a GET, which produces a
 * page of query parameters instead of a session. There is no event to wait on —
 * the button is in the DOM and clickable the whole time — so this is a sleep,
 * and it is deliberate.
 */
const HYDRATION_MS = Number(process.env.E2E_HYDRATION_MS ?? 2500);

type Fields = { email: string; password: string };

const MAIN_FIELDS: Fields = { email: "#login-email", password: "#login-password" };
const PORTAL_FIELDS: Fields = { email: "#portal-email", password: "#portal-password" };

async function submitLogin(
  page: Page,
  loginPath: string,
  fields: Fields,
  who: { label: string; email: string; password: string },
) {
  await page.goto(loginPath);
  await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
  await page.waitForTimeout(HYDRATION_MS);

  await page.fill(fields.email, who.email);
  await page.fill(fields.password, who.password);
  await page.click('button[type="submit"]');

  /*
    Wait for the cookie. Only if it never arrives, ask the page why.

    This used to read `getByRole("alert")` on *every* poll and throw if it held
    any text at all. That is wrong twice over. The login page has an alert
    region that is not always an error — on 2026-09-02 it carried the workspace
    brand, so ten sign-ins became "sign-in refused for Tafadzwa Mukono: Corelith"
    and one false positive in the `setup` project stopped 62 unrelated tests
    from running at all. And it made the *success* path depend on a locator that
    has nothing to do with success.

    A refusal is "no session token", full stop. The alert is a good explanation
    and a bad test, so it is now read once, after the fact, to turn a bare
    timeout into a sentence.
  */
  const signedIn = async () => {
    const cookies = await page.context().cookies();
    return cookies.some((cookie) => cookie.name.includes("session-token"));
  };

  try {
    await expect.poll(signedIn, { timeout: SIGN_IN_TIMEOUT_MS }).toBe(true);
  } catch {
    const reason = await page
      .getByRole("alert")
      .filter({ visible: true })
      .first()
      .textContent()
      .catch(() => null);

    throw new Error(
      `sign-in never minted a session for ${who.label} <${who.email}> at ${loginPath}` +
        (reason?.trim() ? `: ${reason.trim()}` : ` (no message on the page; it is now at ${page.url()})`),
    );
  }
}

/**
 * Sign into a tenant's main app.
 *
 *   await signIn(page, RETAIL, "manager")
 *
 * The tenant argument names *whose credentials to use*; the context decides
 * which host receives them. Passing a tenant the context is not nominated for
 * is how you test that sign-in is scoped — it should be refused.
 */
export async function signIn(page: Page, tenant: Tenant, who: string): Promise<void> {
  const login = loginFor(tenant, who);

  await submitLogin(page, "/login", MAIN_FIELDS, login);

  // `NEXTAUTH_URL` decides where the post-login redirect goes, and it names the
  // central host rather than the tenant — so the redirect is still in flight and
  // will abort the first real `goto`. Park somewhere of our own first.
  await page.goto("/", { waitUntil: "commit" }).catch(() => {});
  await page.waitForTimeout(1000);
}

/**
 * Sign into one of a tenant's portals, on that portal's own host.
 *
 * The context must be nominated for that portal host —
 * `test.use({ tenant: SCHOOL, portal: "student" })`.
 *
 * The portal hosts enforce who may enter: the till refuses a manager, and the
 * parent portal refuses a student. A spec that expects the refusal should call
 * `expectPortalRefuses` instead of catching the throw from here.
 */
export async function portalSignIn(
  page: Page,
  tenant: Tenant,
  portal: PortalKey,
  who: string,
): Promise<void> {
  const login = loginFor(tenant, who);

  await submitLogin(page, `/portal/${portal}/login`, PORTAL_FIELDS, login);

  await page.goto(`/portal/${portal}`, { waitUntil: "commit" }).catch(() => {});
  await page.waitForTimeout(1000);
}

/**
 * Assert that a portal turns somebody away — the other half of role gating, and
 * the half that silently rots when nobody tests it.
 */
export async function expectPortalRefuses(
  page: Page,
  tenant: Tenant,
  portal: PortalKey,
  who: string,
): Promise<void> {
  const login = loginFor(tenant, who);

  await page.goto(`/portal/${portal}/login`);
  // Time-boxed: the app holds an open SSE stream, so the network is never idle
  // and an unbounded wait here burns the whole test budget. Same fix as
  // `nav.ts` and `shots.ts`; this was the last unbounded one left.
  await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
  await page.waitForTimeout(HYDRATION_MS);
  await page.fill(PORTAL_FIELDS.email, login.email);
  await page.fill(PORTAL_FIELDS.password, login.password);
  await page.click('button[type="submit"]');

  await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 20_000 });

  const cookies = await page.context().cookies();
  expect(
    cookies.some((cookie) => cookie.name.includes("session-token")),
    `${login.label} (${login.role}) should not hold a session on the ${portal} portal`,
  ).toBe(false);
}

/** Drop the session without going through a sign-out button. */
export async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies();
}
