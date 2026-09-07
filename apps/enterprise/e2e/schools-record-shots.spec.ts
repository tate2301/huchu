import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * S-4.3 — a student as a record page.
 *
 * Driven by opening a real pupil from the class list rather than by visiting a
 * hard-coded id, so the shots prove the route a registrar actually takes.
 *
 * Two viewports matter here for a reason beyond habit: below 1024px
 * `RecordPageShell` folds its rail into a synthetic "Overview" tab and lands on
 * it, so the phone shot is testing different code from the desktop one.
 *
 * See `visual-pass.spec.ts` for the login setup this shares.
 */

const EMAIL = process.env.VISUAL_PASS_EMAIL ?? "head@chisipite-demo.test";
const PASSWORD = process.env.VISUAL_PASS_PASSWORD ?? "VisualPass123!";
const SHOTS = process.env.SHOT_DIR ?? "/tmp/shots";
const AUTH_STATE = path.join(os.tmpdir(), "visual-pass-auth.json");

test.use({
  launchOptions: {
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: ["--no-proxy-server"],
  },
  storageState: AUTH_STATE,
  serviceWorkers: "block",
});

test.skip(process.env.VISUAL_PASS !== "1", "See visual-pass.spec.ts for setup.");
test.describe.configure({ timeout: 180_000 });

test.beforeAll(async ({ browser }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  if (fs.existsSync(AUTH_STATE)) {
    const probe = await browser.newContext({ storageState: AUTH_STATE });
    const session = await probe.request.get("/api/auth/session");
    const body = await session.json().catch(() => ({}));
    await probe.close();
    if (body?.user) return;
  }
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.goto("/login");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/callback/credentials"), {
      timeout: 30_000,
    }),
    page.click('button[type="submit"]'),
  ]);
  expect(response.status()).toBeLessThan(400);
  await context.storageState({ path: AUTH_STATE });
  await context.close();
});

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("student record page", async ({ page }) => {
      // Find a real pupil through the API rather than guessing an id, so the
      // spec keeps working when the demo tenant is reseeded. Prefer one with
      // guardians: a record page whose every relationship tab is empty proves
      // the tabs render but not that they show anything.
      const list = await page.request.get("/api/v2/schools/students?limit=25");
      expect(list.status()).toBeLessThan(400);
      const body = await list.json();
      const candidates: { id: string; studentNo: string }[] = body?.data ?? [];
      expect(candidates.length, "the demo tenant has no students to open").toBeGreaterThan(0);

      let student = candidates[0];
      for (const candidate of candidates) {
        const detail = await page.request.get(`/api/v2/schools/students/${candidate.id}`);
        const record = await detail.json().catch(() => null);
        if ((record?.guardianLinks?.length ?? 0) > 0) {
          student = candidate;
          break;
        }
      }

      await expect(async () => {
        await page.goto(`/schools/students/${student.id}`);
        // The pupil's student number, which the shell renders as the identity
        // strip's `reference`. It appears nowhere in the loading branch — that
        // is two Skeletons with no text — so this cannot photograph a spinner.
        await expect(page.getByText(student.studentNo).first()).toBeVisible({
          timeout: 20_000,
        });
      }).toPass({ timeout: 120_000 });

      // The property list is the thing S-4.3 replaced a hand-rolled InfoRow
      // with. If this is missing, the shell rendered without its attributes.
      await expect(page.getByText("Student number").first()).toBeVisible();

      // S-4.4 — the school's own fields sit in the same list as the built-in
      // ones. They are past the "N more properties" fold, which is the whole
      // reason that control exists, so it has to be opened first.
      const more = page.getByRole("button", { name: /more propert/ });
      if (await more.count()) {
        await more.first().click();
        await expect(page.getByText(/Transport · Bus route|Bus route/).first()).toBeVisible({
          timeout: 10_000,
        });
        await page.screenshot({
          path: `${SHOTS}/record-student-custom-fields-${viewport.name}.png`,
          fullPage: true,
        });
      }

      await page.screenshot({
        path: `${SHOTS}/record-student-${viewport.name}.png`,
        fullPage: true,
      });

      // Relationship tabs. Guardians is the landing tab on desktop; below
      // 1024px the shell inserts "Overview" ahead of it and lands there
      // instead, so assert on the tab existing rather than on it being active.
      const guardians = page.getByRole("tab", { name: /Guardians/ });
      await expect(guardians).toBeVisible();
      await guardians.click();
      await page.screenshot({
        path: `${SHOTS}/record-student-guardians-${viewport.name}.png`,
        fullPage: true,
      });

      // S-4.2 — Notes and Files, reached through the module-neutral routes. Before
      // the re-key a student could not be the subject of either, so an empty tab
      // here would mean the routes are refusing the school again.
      const notes = page.getByRole("tab", { name: /Notes/ });
      if (await notes.count()) {
        await notes.first().click();
        await expect(page.getByRole("button", { name: /Add note/ })).toBeVisible({
          timeout: 10_000,
        });
        await page.screenshot({
          path: `${SHOTS}/record-student-notes-${viewport.name}.png`,
          fullPage: true,
        });
      }

      const filesTab = page.getByRole("tab", { name: /Files/ });
      if (await filesTab.count()) {
        await filesTab.first().click();
        await page.screenshot({
          path: `${SHOTS}/record-student-files-${viewport.name}.png`,
          fullPage: true,
        });
      }

      const enrolments = page.getByRole("tab", { name: /Enrolments/ });
      if (await enrolments.count()) {
        await enrolments.click();
        await page.screenshot({
          path: `${SHOTS}/record-student-enrolments-${viewport.name}.png`,
          fullPage: true,
        });
      }
    });

    test("guardian record page", async ({ page }) => {
      // A guardian with children, for the same reason as the student: a record
      // page whose only relationship tab is empty proves the tab renders and
      // nothing else.
      const list = await page.request.get("/api/v2/schools/guardians?limit=25");
      expect(list.status()).toBeLessThan(400);
      const body = await list.json();
      const candidates: { id: string; guardianNo: string }[] = body?.data ?? [];
      expect(candidates.length, "the demo tenant has no guardians to open").toBeGreaterThan(0);

      let guardian = candidates[0];
      for (const candidate of candidates) {
        const detail = await page.request.get(`/api/v2/schools/guardians/${candidate.id}`);
        const record = await detail.json().catch(() => null);
        if ((record?.studentLinks?.length ?? 0) > 0) {
          guardian = candidate;
          break;
        }
      }

      await expect(async () => {
        await page.goto(`/schools/guardians/${guardian.id}`);
        // The guardian number, rendered as the identity strip's reference. Absent
        // from the loading branch, which is two Skeletons with no text.
        await expect(page.getByText(guardian.guardianNo).first()).toBeVisible({
          timeout: 20_000,
        });
      }).toPass({ timeout: 120_000 });

      await expect(page.getByRole("tab", { name: /Children/ })).toBeVisible();
      await page.screenshot({
        path: `${SHOTS}/record-guardian-${viewport.name}.png`,
        fullPage: true,
      });
    });

    test("teacher record page", async ({ page }) => {
      const list = await page.request.get("/api/v2/schools/teachers/profiles?limit=25");
      expect(list.status()).toBeLessThan(400);
      const body = await list.json();
      const candidates: { id: string; employeeCode: string }[] = body?.data ?? [];
      expect(candidates.length, "the demo tenant has no teachers to open").toBeGreaterThan(0);

      // Prefer one with something timetabled, so the Teaches tab has content.
      let teacher = candidates[0];
      for (const candidate of candidates) {
        const detail = await page.request.get(`/api/v2/schools/teachers/${candidate.id}`);
        const record = await detail.json().catch(() => null);
        if ((record?.assignments?.length ?? 0) > 0) {
          teacher = candidate;
          break;
        }
      }

      await expect(async () => {
        await page.goto(`/schools/teachers/${teacher.id}`);
        // The staff number, rendered as the identity strip's reference.
        await expect(page.getByText(teacher.employeeCode).first()).toBeVisible({
          timeout: 20_000,
        });
      }).toPass({ timeout: 120_000 });

      await expect(page.getByRole("tab", { name: /Teaches/ })).toBeVisible();
      await page.screenshot({
        path: `${SHOTS}/record-teacher-${viewport.name}.png`,
        fullPage: true,
      });
    });

    test("class record page", async ({ page }) => {
      const list = await page.request.get("/api/v2/schools/classes?limit=25");
      expect(list.status()).toBeLessThan(400);
      const body = await list.json();
      const candidates: { id: string; code: string; name: string }[] = body?.data ?? [];
      expect(candidates.length, "the demo tenant has no classes to open").toBeGreaterThan(0);

      // Prefer one with pupils on the roll, so the landing tab has content.
      let klass = candidates[0];
      for (const candidate of candidates) {
        const roll = await page.request.get(
          `/api/v2/schools/students?classId=${candidate.id}&limit=1`,
        );
        const rollBody = await roll.json().catch(() => null);
        if ((rollBody?.data?.length ?? 0) > 0) {
          klass = candidate;
          break;
        }
      }

      await expect(async () => {
        await page.goto(`/schools/classes/${klass.id}`);
        // The class code, rendered as the identity strip's reference.
        await expect(page.getByText(klass.code).first()).toBeVisible({ timeout: 20_000 });
      }).toPass({ timeout: 120_000 });

      // A class is a thing, not a person: the mark is a tile, not initials.
      await expect(page.getByRole("tab", { name: /Roll/ })).toBeVisible();
      await page.screenshot({
        path: `${SHOTS}/record-class-${viewport.name}.png`,
        fullPage: true,
      });
    });

    test("subject record page", async ({ page }) => {
      const list = await page.request.get("/api/v2/schools/subjects?limit=50");
      expect(list.status()).toBeLessThan(400);
      const body = await list.json();
      const candidates: { id: string; code: string; name: string }[] = body?.data ?? [];
      expect(candidates.length, "the demo tenant has no subjects to open").toBeGreaterThan(0);

      // Prefer one that is actually timetabled, so the landing tab has rows —
      // the Classes tab is the whole reason the detail include gained
      // `classSubjects` instead of keeping `_count`.
      let subject = candidates[0];
      for (const candidate of candidates) {
        const detail = await page.request.get(`/api/v2/schools/subjects/${candidate.id}`);
        const record = await detail.json().catch(() => null);
        if ((record?.classSubjects?.length ?? 0) > 0) {
          subject = candidate;
          break;
        }
      }

      // Reached by clicking the row rather than by typing the URL. The page
      // existed before the list linked to it, which is the same as not
      // existing — so the click is the thing worth photographing.
      await expect(async () => {
        await page.goto("/schools/subjects");
        await expect(
          page.getByRole("link", { name: subject.code, exact: true }).first(),
        ).toBeVisible({ timeout: 20_000 });
      }).toPass({ timeout: 120_000 });
      await page.screenshot({
        path: `${SHOTS}/subjects-list-${viewport.name}.png`,
        fullPage: true,
      });
      await page.getByRole("link", { name: subject.code, exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`/schools/subjects/${subject.id}$`));

      // `exact: true` for the same reason as the hostel: a subject code like
      // MATH is a substring of "Mathematics", so a loose match would find the
      // title (and the app bar's hidden copy of it) rather than the reference.
      await expect(page.getByText(subject.code, { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });

      await expect(page.getByRole("tab", { name: /Classes/ })).toBeVisible();
      // The rail's answer to "which classes take this with nobody teaching it",
      // which is what the page exists for.
      await expect(page.getByText("Without a teacher").first()).toBeVisible();
      await page.screenshot({
        path: `${SHOTS}/record-subject-${viewport.name}.png`,
        fullPage: true,
      });
    });

    test("hostel record page", async ({ page }) => {
      const list = await page.request.get("/api/v2/schools/boarding/hostels?limit=25");
      expect(list.status()).toBeLessThan(400);
      const body = await list.json();
      const candidates: { id: string; code: string; name: string }[] = body?.data ?? [];
      test.skip(candidates.length === 0, "the demo tenant has no hostels");

      const hostel = candidates[0];
      await expect(async () => {
        await page.goto(`/schools/boarding/${hostel.id}`);
        // `exact: true` is load-bearing. getByText does CASE-INSENSITIVE
        // SUBSTRING matching, so "NIGHTINGALE" also matches the app bar's
        // <h1>Nightingale House</h1> — and `.first()` then picked that h1, which
        // is hidden at desktop width, so the assertion failed on a page that was
        // rendering perfectly. The other record types pass without this only
        // because their references (S1002, T001, F1) are not substrings of their
        // names; this one was luck, not correctness.
        await expect(page.getByText(hostel.code, { exact: true }).first()).toBeVisible({
          timeout: 20_000,
        });
      }).toPass({ timeout: 120_000 });

      await expect(page.getByRole("tab", { name: /Boarders/ })).toBeVisible();
      await page.screenshot({
        path: `${SHOTS}/record-hostel-${viewport.name}.png`,
        fullPage: true,
      });
    });
  });
}
