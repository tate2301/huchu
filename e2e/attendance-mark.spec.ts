import { test, expect } from "./_support/fixtures";
import { PAYROLL } from "./_support/tenants";
import { visitSettled } from "./_support/nav";
import { companyIdFor, db } from "./_support/db";
import { shooter, VIEWPORT } from "./_support/shots";

/**
 * Marking a register on a tenant with no sites.
 *
 * This is the case the whole `Attendance.siteId` change exists for, and it cannot
 * be proved anywhere else: the DB tests show a siteless row is storable, and the
 * unit tests show the status enum behaves — but whether a supervisor can actually
 * complete the flow depends on the modal, the crew query that used to be gated on
 * a site, the optional-site payload, and the register refreshing afterwards.
 *
 *   npx playwright test e2e/attendance-mark.spec.ts
 *
 * No hosts-file entry and no `E2E_BASE_URL` override are needed any more: the
 * harness nominates `payroll-demo` with the `__huchu_preview_host` cookie over
 * the one origin, and `auth.setup.ts` has already signed Rudo Chirwa in.
 *
 * The demo tenant is a payroll bureau: no sites at all, one company-wide crew.
 * Before this branch it could not reach the screen, and then could reach it but
 * not use it.
 *
 * It is also the only spec anywhere in `e2e/` that *writes* attendance — nothing
 * else POSTs `/api/people/attendance`, and nothing else opens this modal. The
 * sweeps next door (`finance-suite`) only prove the page renders.
 */

/*
  This file used to build its own context, and both hand-rolled pieces were bugs.

  It set `executablePath: "/opt/pw-browsers/chromium"` — an absolute Linux path,
  unconditional — so the spec could only ever run inside the one container it
  was written in. Everywhere else it failed before the first navigation with
  "Failed to launch chromium because executable doesn't exist at
  /opt/pw-browsers/chromium", which reads as a broken install rather than a
  hard-coded path. `playwright.config.ts` now owns the browser choice
  (`E2E_BROWSER_CHANNEL`), so there is nothing left here to get wrong.

  It also planted the `__huchu_preview_host` cookie itself and signed in by
  hand. (That cookie is not in `git show HEAD:` — it was added to this file in
  an earlier uncommitted pass, so the version this replaced is the working tree
  one, not the committed one. Said explicitly because an adversarial review of
  this migration diffed against HEAD and read the sentence above as invented.)
  It ran against a `BASE` that defaulted to `payroll-demo` but which
  `E2E_BASE_URL` — set for the whole suite — overrode to **acme**. So it signed
  in at the bottle store with the payroll bureau's credentials, was refused, and
  surfaced the refusal 45 seconds later as `expect(...).toBe(true)` on a cookie
  poll: a sentence about a session, not about a tenant. `test.use({ tenant })`
  is what says which tenant this is, once, before anything navigates.
*/
test.use({ tenant: PAYROLL, as: "admin", viewport: VIEWPORT.desktop });

test("marks a crew with no site, and the register shows it", async ({ page }) => {
  const companyId = await companyIdFor(PAYROLL.slug, PAYROLL.seed);
  test.setTimeout(240_000);

  const shot = shooter(PAYROLL.vertical, "attendance-mark");

  await visitSettled(page, "/people/attendance");

  /*
    Wait for the screen to be usable before asserting anything is *absent*.

    `toHaveCount(0)` is satisfied by a page that has not rendered yet, so it has
    to come after something that proves it has. The old spec bought that with a
    six-second sleep; the Mark attendance button is the same guarantee and says
    what it is waiting for.
  */
  const markButton = page.getByRole("button", { name: /Mark attendance/i });
  await markButton.waitFor({ state: "visible", timeout: 30_000 });

  // No Site field at all, because the tenant has no sites. A required dropdown
  // with nothing in it is what made this screen a dead end.
  await expect(page.getByLabel("Site")).toHaveCount(0);

  await markButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  /*
    One fixed day, cleared before it is used.

    This picked a random day in November or December and called that
    "repeatable". It is not: fifty-four candidates and a
    `[date, shift, employeeId]` unique key means the birthday paradox catches
    up inside a dozen runs, and it did — `POST /api/people/attendance` came
    back **409 Attendance already recorded** with three employee ids, because
    an earlier run had drawn the same date.

    Randomness was standing in for cleanup. A spec that writes should own what
    it writes: this one now takes a single day far outside anything the seed
    touches and deletes that day first, so the hundredth run starts exactly
    where the first did.
  */
  const day = "2026-12-29";
  const shift = "SHIFT-1";
  await db.attendance.deleteMany({
    where: { date: new Date(`${day}T00:00:00.000Z`), shift, employee: { companyId } },
  });

  await dialog.getByLabel("Date").fill(day);
  await dialog.getByLabel("Shift").fill(shift);

  // Pick the crew. It is listed at all only because the crew query stopped being
  // gated on a site.
  await dialog.getByText(/Search crew/i).first().click();
  const crewOption = page.getByRole("option").first();
  await crewOption.waitFor({ state: "visible", timeout: 15000 });
  const crewName = (await crewOption.innerText()).split("\n")[0];
  await crewOption.click();

  // Crew members appear, defaulting to Present.
  await expect(dialog.getByRole("button", { name: "Present" }).first()).toBeVisible({
    timeout: 15000,
  });
  await shot(page, "mark-modal-desktop");

  const post = page.waitForResponse(
    (response) =>
      response.url().includes("/api/people/attendance") &&
      response.request().method() === "POST",
    { timeout: 30000 },
  );
  await dialog.getByRole("button", { name: /Record attendance/i }).click();
  const response = await post;
  const body = await response.json().catch(() => null);
  console.log("[mark]", response.status(), JSON.stringify(body).slice(0, 400), "crew:", crewName);
  expect(response.status(), `POST failed: ${JSON.stringify(body)}`).toBeLessThan(300);

  // The dialog closes and the register below is the confirmation — which is why
  // this screen no longer redirects to the reports page on submit.
  await expect(dialog).toBeHidden({ timeout: 15000 });
  await expect(page.getByRole("table")).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("cell", { name: "Whole company" }).first()).toBeVisible();

  await shot(page, "register-desktop");
  console.log(`[shots] attendance mark -> ${shot.dir}`);
});
