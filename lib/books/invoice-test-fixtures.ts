/**
 * A workspace with books for the Reverse and Delete tests: its accounts and
 * posting rules seeded, an owner, a manager and a customer; issued invoices
 * posted as Books posts them, and payments recorded as Receivables records
 * them. Test-only.
 */
import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { recordSalesReceipt } from "@/lib/accounting/payments";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";

import { postIssuedInvoice } from "./issue-invoice";

export type BooksFixture = { companyId: string; ownerId: string; managerId: string; customerId: string; stamp: string };

export async function makeBooksFixture(name: string): Promise<BooksFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const companyId = (await prisma.company.create({ data: { name: `${name} ${stamp}`, slug: `books-${stamp}` }, select: { id: true } })).id;
  const ownerId = (await prisma.user.create({ data: { email: `owner-${stamp}@books.test`, name: "James Nyabadza", role: "SUPERADMIN", companyId }, select: { id: true } })).id;
  const managerId = (await prisma.user.create({ data: { email: `manager-${stamp}@books.test`, name: "Tendai Moyo", role: "MANAGER", companyId }, select: { id: true } })).id;
  await runAccountingSeedPack({ companyId, mode: "APPLY" });
  const customerId = (await prisma.customer.create({ data: { companyId, name: "Borrowdale Brooke Clinic" }, select: { id: true } })).id;
  return { companyId, ownerId, managerId, customerId, stamp };
}

let n = 0;

/** An invoice of two lines at 15% VAT: 10 m² at $50 and 4 at $25, $690.00 in all. Issued and posted unless `draft`. */
export async function issueTestInvoice(fixture: BooksFixture, options: { draft?: boolean } = {}) {
  n += 1;
  const invoice = await prisma.salesInvoice.create({
    data: {
      companyId: fixture.companyId,
      customerId: fixture.customerId,
      invoiceNumber: `INV-T${fixture.stamp.slice(-6)}-${n}`,
      invoiceDate: new Date(),
      status: options.draft ? "DRAFT" : "ISSUED",
      subTotal: 600,
      taxTotal: 90,
      total: 690,
      createdById: fixture.ownerId,
      issuedById: options.draft ? undefined : fixture.ownerId,
      issuedAt: options.draft ? undefined : new Date(),
      lines: {
        create: [
          { description: "Vinyl sheet", quantity: 10, unitPrice: 50, taxRate: 15, taxAmount: 75, lineTotal: 575 },
          { description: "Coved skirting", quantity: 4, unitPrice: 25, taxRate: 15, taxAmount: 15, lineTotal: 115 },
        ],
      },
    },
    include: { lines: { orderBy: { createdAt: "asc" } } },
  });
  if (!options.draft) await postIssuedInvoice(fixture.companyId, invoice, fixture.ownerId);
  return invoice;
}

export function payTestInvoice(fixture: BooksFixture, invoiceId: string, amount: number) {
  return recordSalesReceipt({ companyId: fixture.companyId, userId: fixture.ownerId, invoiceId, receivedAt: new Date(), amount, method: "BANK_TRANSFER" });
}

/** The trial balance: each account's debits less credits over posted entries, by code, leaving out the zeros. */
export async function trialBalance(companyId: string): Promise<Record<string, number>> {
  const lines = await prisma.journalLine.findMany({
    where: { entry: { companyId, status: "POSTED" } },
    select: { debit: true, credit: true, account: { select: { code: true } } },
  });
  const sums: Record<string, number> = {};
  for (const line of lines) sums[line.account.code] = (sums[line.account.code] ?? 0) + line.debit - line.credit;
  return Object.fromEntries(
    Object.entries(sums)
      .map(([code, sum]) => [code, Math.round(sum * 100) / 100] as const)
      .filter(([, sum]) => Math.abs(sum) > 0.004)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export async function destroyBooksFixture(fixture: BooksFixture | undefined) {
  if (!fixture) return;
  const { companyId } = fixture;
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfEntryId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.paymentLedgerEntry.deleteMany({ where: { companyId } });
  await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
  await prisma.crmLeadDocument.deleteMany({ where: { companyId } });
  await prisma.salesReceipt.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.vaneItem.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
}
