import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * The parent portal, screen by screen.
 *
 * Signed in as a *guardian*. The household is resolved from the caller's own
 * `SchoolGuardian` link (`loadParentHousehold`), never from a parameter, so a
 * staff account would see the "no children" state and every screen would be
 * that. `as: "parent"` is what the separate storage-state file used to be.
 *
 * Phone first — this is a mobile shell with bottom tabs, drawn for the device a
 * parent actually carries.
 *
 * ## What the harness covers, and what it does not
 *
 * `marketing-shots.spec.ts` shoots `/portal/parent` alone, at 390x844;
 * `smoke-school.spec.ts` covers the sign-in; `school-portal-gaps-suite.spec.ts`
 * covers messages. The other six screens are only here — and so is the only
 * place the portal's empty-state copy is asserted at all: "What you still owe |
 * not shown on your account", "School news | not sent you anything". Those
 * patterns are why nothing had to be dropped to move tenant: each one already
 * accepted the empty state as a pass, which is what St Mary's mostly has.
 */

test.describe.configure({ timeout: 180_000 });
test.use({
  tenant: SCHOOL,
  as: "parent",
  // See the note in teacher-portal-shots.spec.ts: the offline service worker
  // sits in front of `/api/v2` once it installs, and whether it has finished
  // installing decides whether a run passes.
  serviceWorkers: "block",
});

/** Each screen names something only the *loaded* screen renders. */
const SCREENS = [
  { slug: "home", path: "/portal/parent", ready: /How often at school|linked any children/i },
  { slug: "fees", path: "/portal/parent/fees", ready: /What you still owe|not shown on your account/i },
  {
    slug: "attendance",
    path: "/portal/parent/attendance",
    ready: /at school|Day by day|No registers|Nothing has been recorded/i,
  },
  { slug: "marks", path: "/portal/parent/marks", ready: /out of|score|have not been released|not been shared|subjects?/i },
  {
    slug: "notices",
    path: "/portal/parent/notices",
    ready: /School news|not sent you anything/i,
  },
  { slug: "profile", path: "/portal/parent/profile", ready: /guardian|child|profile/i },
  { slug: "help", path: "/portal/parent/help", ready: /child|question|switch/i },
];

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const screen of SCREENS) {
      test(`${screen.slug}`, async ({ page }) => {
        const shot = shooter("schools", `parent-portal-${viewport.name}`);

        await expect(async () => {
          await page.goto(screen.path, { waitUntil: "domcontentloaded" });
          await expect(page.getByText(screen.ready).first()).toBeVisible({
            timeout: 20_000,
          });
        }).toPass({ timeout: 150_000, intervals: [2_000] });
        await shot(page, screen.slug);
      });
    }
  });
}
