import type { PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "customer" | "salesInvoice" | "salesReceipt" | "salesQuotation" | "crmClient" | "retailSale" | "retailVoucher" | "retailLayby" | "retailPointsEntry">;

export type CustomerDeleteOutcome =
  | { ok: true; mode: "deleted" | "archived"; name: string }
  | { ok: false; status: 404 | 409; why: string; /** Archiving is allowed where deleting is not. */ canArchive: boolean };

/** "4 invoices and 2 payments", from what still points at the customer. */
export function referencesLine(counts: Array<[number, string, string]>): string {
  const parts = counts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Delete a customer, or archive one. A customer nothing points at is deleted
 * for good. One that invoices, payments, quotes, sales, vouchers, laybys or
 * points are written to is refused, with what holds it, and may be archived:
 * it leaves every list and form and its records stay whole.
 */
export async function removeCustomer(db: Db, companyId: string, id: string, mode: "delete" | "archive", now = new Date()): Promise<CustomerDeleteOutcome> {
  const customer = await db.customer.findFirst({ where: { id, companyId }, select: { id: true, name: true } });
  if (!customer) return { ok: false, status: 404, why: "There is no such customer in this workspace", canArchive: false };
  if (mode === "archive") {
    await db.customer.update({ where: { id }, data: { isActive: false, archivedAt: now } });
    return { ok: true, mode: "archived", name: customer.name };
  }
  const [invoices, receipts, quotes, clients, sales, vouchers, laybys, points] = await Promise.all([
    db.salesInvoice.count({ where: { companyId, customerId: id } }),
    db.salesReceipt.count({ where: { companyId, customerId: id } }),
    db.salesQuotation.count({ where: { companyId, customerId: id } }),
    db.crmClient.count({ where: { customerId: id } }),
    db.retailSale.count({ where: { customerId: id } }),
    db.retailVoucher.count({ where: { customerId: id } }),
    db.retailLayby.count({ where: { customerId: id } }),
    db.retailPointsEntry.count({ where: { customerId: id } }),
  ]);
  const held = referencesLine([
    [invoices, "invoice", "invoices"],
    [receipts, "payment", "payments"],
    [quotes, "quote", "quotes"],
    [clients, "CRM record", "CRM records"],
    [sales, "shop sale", "shop sales"],
    [vouchers, "voucher", "vouchers"],
    [laybys, "layby", "laybys"],
    [points, "points entry", "points entries"],
  ]);
  if (held) return { ok: false, status: 409, why: `${customer.name} has ${held}. A customer with records can be archived, not deleted.`, canArchive: true };
  await db.customer.delete({ where: { id } });
  return { ok: true, mode: "deleted", name: customer.name };
}
