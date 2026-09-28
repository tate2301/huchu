import { prisma } from "@/lib/prisma";

/**
 * Delete a test company, and actually delete it.
 *
 * ## Why this exists
 *
 * Twenty test files in this module tore down with
 * `prisma.company.delete(...).catch(() => undefined)`. The swallow was written
 * so a cleanup failure could not turn a green run red — and it hid the fact
 * that the delete **always failed**, because three relations restrict rather than
 * cascade:
 *
 *   - `User.companyId`. Any test that makes a portal account, a teacher or an
 *     office user leaves rows the company cannot be deleted out from under.
 *   - `TaxTemplateLine.taxCodeId`. Anything that calls `provisionSchool` gets
 *     the accounting scaffolding, and the cascade stops on the template line.
 *   - `Notification.companyId`. Anything that sends a notice leaves the
 *     in-app rows behind it.
 *
 * So every run of every one of those files left its tenants behind. The local
 * test database reached **394 companies**, and the second-order damage is what
 * makes it visible rather than merely untidy: `vitest.setup.ts` and
 * `scripts/clean-provision-test-tenants.ts` both record it —
 * `lib/inventory/shelf-price-integrity.test.ts` prices every ranged line in the
 * database in parallel, the fan-out exhausts the connection pool, and the suite
 * starts failing with *timeout exceeded when trying to connect*. An error about
 * the network, caused by test rows, on a file nobody touched.
 *
 * ## It does not catch
 *
 * Deliberately, and `lib/schools/import/import.test.ts` had already worked this
 * out for itself: a teardown that cannot clean up should say so on the run that
 * broke it, not on somebody's afternoon three weeks later. If this throws, a
 * new relation restricts and belongs in the unwind below.
 */
export async function deleteTestCompany(
  companyId: string | string[],
): Promise<void> {
  const ids = Array.isArray(companyId) ? companyId : [companyId];
  if (ids.length === 0) return;

  // Innermost first. Each of these is a relation that refuses while anything
  // still points at it.
  await prisma.taxTemplateLine.deleteMany({
    where: { template: { companyId: { in: ids } } },
  });
  await prisma.notificationRecipient.deleteMany({
    where: { notification: { companyId: { in: ids } } },
  });
  await prisma.notification.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.user.deleteMany({ where: { companyId: { in: ids } } });

  await prisma.company.deleteMany({ where: { id: { in: ids } } });
}
