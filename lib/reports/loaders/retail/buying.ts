import { prisma } from "@/lib/prisma";
import { result } from "@/lib/reports/loaders/shared";
import type { ListOption, ReportContext, ReportLoader, ReportParams, ReportRow } from "@/lib/reports/types";
import { billBalance, fillRate, lastDelivery, lateOrders, orderCounts, owed, spend12 } from "@/lib/retail/buying/figures";
import { supplierActivity } from "@/lib/retail/buying/supplier-activity";
import { supplierCategories, termsWord } from "@/lib/retail/buying/supplier-view";
import { contactsOf } from "@/lib/retail/buying/suppliers";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { phoneSearchText } from "@/lib/retail/people/words";
import { dayKey, formatCount, formatShortDay } from "@/lib/workspace/format";

/**
 * Suppliers (40-buying 4.1, `retail-suppliers`): every supplier of the
 * company, in memory (a shop has a handful). Each row's figures come from the
 * buying figures over the supplier's orders, deliveries and bills.
 */

async function loadSuppliers(ctx: ReportContext) {
  const now = new Date();
  const vendors = await prisma.vendor.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      contactName: true,
      phone: true,
      whatsapp: true,
      payTermsDays: true,
      stoppedAt: true,
      contacts: { where: { removedAt: null }, select: { name: true, phone: true } },
    },
  });
  const [categories, activity] = await Promise.all([
    supplierCategories(ctx.companyId),
    supplierActivity(
      ctx.companyId,
      vendors.map((vendor) => vendor.id),
    ),
  ]);
  const today = dayKey(now);
  return result(
    vendors.map((vendor): ReportRow => {
      const feed = activity.get(vendor.id)!;
      const fill = fillRate(feed.orders, feed.deliveries, now);
      const last = lastDelivery(feed.deliveries);
      const late = lateOrders(feed.orders, now);
      const terms = termsWord(vendor.payTermsDays);
      const category = categories.get(vendor.id);
      const overdue = feed.bills.filter((bill) => !bill.binned && bill.dueDate && dayKey(bill.dueDate) < today && billBalance(bill).greaterThan(0)).length;
      return {
        id: vendor.id,
        code: vendor.code,
        name: vendor.name,
        stopped: vendor.stoppedAt ? " · stopped" : null,
        state: vendor.stoppedAt ? "stopped" : "buying",
        rep: vendor.contactName,
        phone: vendor.phone,
        terms,
        openOrders: orderCounts(feed.orders).open,
        owed: Number(owed(feed.bills, feed.credits).toFixed(2)),
        overdue,
        lastDelivery: last ? dayKey(last) : null,
        fillRate: fill === null ? "No deliveries yet" : `${fill}%`,
        fillPct: fill,
        spend12: Number(spend12(feed.deliveries, now).spend.toFixed(2)),
        category: category?.top ?? null,
        // "|<id>|<id>|": the Category filter's options match on it.
        categories: category ? `|${[...category.ids].join("|")}|` : "",
        lateBadge: late > 0 ? `${formatCount(late)} late` : null,
        lateTone: late > 0 ? "bad" : null,
        cardMeta: [vendor.contactName, terms, last ? `last delivery ${formatShortDay(last)}` : null].filter(Boolean).join(" · "),
        search: [
          vendor.name,
          vendor.code,
          vendor.contactName,
          ...vendor.contacts.map((contact) => contact.name),
          phoneSearchText(vendor.phone?.replace(/\s/g, "")),
          phoneSearchText(vendor.whatsapp?.replace(/\s/g, "")),
          ...vendor.contacts.map((contact) => phoneSearchText(contact.phone?.replace(/\s/g, ""))),
        ]
          .filter(Boolean)
          .join(" | "),
      };
    }),
  );
}

/** The Category filter: the shop's live categories, each matching the suppliers with a product in it. */
async function supplierOptions(ctx: ReportContext): Promise<Record<string, ListOption[]>> {
  const categories = await prisma.retailCategory.findMany({
    where: { companyId: ctx.companyId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return {
    category: categories.map((category) => ({
      value: category.id,
      label: category.name,
      where: [{ column: "categories", op: "contains" as const, value: `|${category.id}|` }],
    })),
  };
}

/** A supplier's contacts (`retail-supplier-contacts`, the `supplier` parent): the rep first. */
async function loadContacts(ctx: ReportContext, params: ReportParams) {
  if (!params.supplier) return result([]);
  const vendor = await prisma.vendor.findFirst({ where: { id: params.supplier, companyId: ctx.companyId }, select: { id: true, name: true } });
  if (!vendor) return result([]);
  const contacts = await contactsOf(ctx.companyId, vendor.id);
  const canEdit = canRetailRoleDo(ctx.role, "retail.suppliers", "update");
  return result(
    contacts.map(
      (contact, index): ReportRow => ({
        id: contact.id,
        supplierId: vendor.id,
        supplier: vendor.name,
        order: index,
        name: contact.name,
        role: contact.role,
        phone: contact.phone,
        email: contact.email,
        sends: contact.sends,
        isRep: contact.isRep ? "yes" : "no",
        // Fills the row's link (its phone card) only for who may change the contact.
        editId: canEdit ? contact.id : null,
      }),
    ),
  );
}

export const BUYING_LOADERS: Record<string, ReportLoader> = {
  "retail-suppliers": { load: loadSuppliers, options: supplierOptions },
  "retail-supplier-contacts": { load: loadContacts },
};
