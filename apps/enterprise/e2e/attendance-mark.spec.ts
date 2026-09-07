import { expect, test } from "@playwright/test";

/**
 * Marking a register on a tenant with no sites.
 *
 * This is the case the whole `Attendance.siteId` change exists for, and it cannot
 * be proved anywhere else: the DB tests show a siteless row is storable, and the
 * unit tests show the status enum behaves — but whether a supervisor can actually
 * complete the flow depends on the modal, the crew query that used to be gated on
 * a site, the optional-site payload, and the register refreshing afterwards.
 *
 *   echo '127.0.0.1 payroll-demo.apps.pagka.local' >> /etc/hosts
 *   E2E_BASE_URL=http://payroll-demo.apps.pagka.local:3000 \
 *     npx playwright test e2e/attendance-mark.spec.ts
 *
 * The demo tenant is a payroll bureau: no sites at all, one company-wide crew.
 * Before this branch it could not reach the screen, and then could reach it but
 * not use it.
 */

const OUT = process.env.SHOT_DIR ?? "/tmp/shots";
const BASE = process.env.E2E_BASE_URL ?? "http://payroll-demo.apps.pagka.local:3000";

test.use({
  baseURL: BASE,
  launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  viewport: { width: 1440, height: 900 },
});

test("marks a crew with no site, and the register shows it", async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  await page.fill("#login-email", "rudo.chirwa@payroll-demo.test");
  await page.fill("#login-password", "Password123!");
  await page.click('button[type="submit"]');
  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies();
        return cookies.some((cookie) => cookie.name.includes("session-token"));
      },
      { timeout: 45000 },
    )
    .toBe(true);

  await page.goto("/", { waitUntil: "commit" }).catch(() => {});
  await page.waitForTimeout(1000);
  try {
    await page.goto("/people/attendance");
  } catch {
    await page.waitForTimeout(1000);
    await page.goto("/people/attendance");
  }
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(6000);

  // No Site field at all, because the tenant has no sites. A required dropdown
  // with nothing in it is what made this screen a dead end.
  await expect(page.getByLabel("Site")).toHaveCount(0);

  await page.getByRole("button", { name: /Mark attendance/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // A date nothing has been marked for, so the run is repeatable against the
  // `[date, shift, employeeId]` unique key.
  const day = `2026-1${Math.floor(Math.random() * 2) + 1}-${String(
    Math.floor(Math.random() * 27) + 1,
  ).padStart(2, "0")}`;
  await dialog.getByLabel("Date").fill(day);
  await dialog.getByLabel("Shift").fill("SHIFT-1");

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
  await page.screenshot({ path: `${OUT}/attendance-mark-modal-desktop.png` });

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

  await page.screenshot({ path: `${OUT}/attendance-register-desktop.png` });
});
