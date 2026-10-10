import { prisma } from "@/lib/prisma";
import { toNumberOrZero } from "@/lib/money";
import { formatCount } from "@/lib/workspace/format";

import {
  boughtPerMonth,
  fillRate,
  lastDelivery,
  lateOrders,
  monthsSince,
  onTime,
  orderCounts,
  owed,
  owedNote,
  spend12,
  unitsShortThisYear,
} from "./figures";
import { supplierActivity } from "./supplier-activity";
import { contactsOf, leadWords, maskBank, paysWord, type ContactView } from "./suppliers";

/**
 * A supplier as its record reads it (40-buying 4.2, `SupplierView`): its
 * details, chips, KPIs, the chart's months and its tabs' counts, with what
 * the viewer may do.
 */

export type SupplierRange = "3m" | "12m" | "all";

export type SupplierViewer = {
  update: boolean;
  delete: boolean;
  order: boolean;
  bill: boolean;
  pay: boolean;
  return: boolean;
};

export type SupplierView = {
  id: string;
  code: string | null;
  name: string;
  isActive: boolean;
  stoppedAt: string | null;
  stoppedBy: string | null;
  rep: { id: string; name: string } | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  sendOrdersOnWhatsapp: boolean;
  pays: { days: number | null; label: string };
  deliversOn: string | null;
  leadTimeDays: number | null;
  leadTime: string | null;
  minimumOrder: number | null;
  vatNumber: string | null;
  bpNumber: string | null;
  bank: { masked: string | null; full?: string | null };
  address: string | null;
  topCategory: string | null;
  chips: { pays: string; category: string | null; late: number };
  kpis: {
    spend12: number;
    spendPrev12: number;
    spendDelta: { text: string; tone: "ok" | "bad" | "plain" };
    orders: number;
    openOrders: number;
    onTimePct: number | null;
    onTimePrevPct: number | null;
    onTimeDelta: { text: string; tone: "ok" | "bad" | "plain" } | null;
    fillRatePct: number | null;
    unitsShortThisYear: number;
    owed: number;
    nextDue: string;
    lastDelivery: string | null;
  };
  chart: { months: Array<{ month: string; value: number }> };
  counts: { orders: number; deliveries: number; bills: number; payments: number; returns: number; contacts: number };
  contacts: ContactView[];
  can: SupplierViewer;
  now: string;
};

/**
 * The category each supplier is known by — the top-level category most of
 * its products are in — and every category its products are in (the list's
 * Category filter: a parent matches its children's products too).
 */
export async function supplierCategories(companyId: string): Promise<Map<string, { top: string | null; ids: Set<string> }>> {
  const products = await prisma.product.findMany({
    where: { companyId, supplierId: { not: null }, archivedAt: null },
    select: {
      supplierId: true,
      retailCategory: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } },
    },
  });
  const tallies = new Map<string, { counts: Map<string, number>; ids: Set<string> }>();
  for (const product of products) {
    const category = product.retailCategory;
    if (!category || !product.supplierId) continue;
    const entry = tallies.get(product.supplierId) ?? { counts: new Map(), ids: new Set<string>() };
    const top = category.parent ?? category;
    entry.counts.set(top.name, (entry.counts.get(top.name) ?? 0) + 1);
    entry.ids.add(category.id);
    if (category.parent) entry.ids.add(category.parent.id);
    tallies.set(product.supplierId, entry);
  }
  const result = new Map<string, { top: string | null; ids: Set<string> }>();
  for (const [vendorId, entry] of tallies) {
    // Most products first; a tie goes to the name first in the alphabet, so it never flickers.
    const top = [...entry.counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    result.set(vendorId, { top, ids: entry.ids });
  }
  return result;
}

/** "30 days from delivery", "On delivery": the rail's Pays. */
export const paysRail = (days: number | null) => (days === null ? "On delivery" : `${paysWord(days)} from delivery`);

/** The strip's chip: "Pays 30 days", "Pays on delivery". */
export const paysChip = (days: number | null) => (days === null ? "Pays on delivery" : `Pays ${paysWord(days)}`);

/** The list's Terms: "30 days", "Cash" (on delivery). */
export const termsWord = (days: number | null) => (days === null ? "Cash" : paysWord(days));

/** The lookup's sub terms: "on delivery", "30 days". */
export const termsSub = (days: number | null) => (days === null ? "on delivery" : paysWord(days));

const num = (value: Parameters<typeof toNumberOrZero>[0]) => toNumberOrZero(value);

export async function loadSupplierView(
  companyId: string,
  id: string,
  can: SupplierViewer,
  range: SupplierRange = "all",
  now = new Date(),
): Promise<SupplierView | null> {
  const vendor = await prisma.vendor.findFirst({
    where: { id, companyId },
    include: { stoppedBy: { select: { name: true } } },
  });
  if (!vendor) return null;
  const [contacts, categories, activityById] = await Promise.all([
    contactsOf(companyId, vendor.id),
    supplierCategories(companyId),
    supplierActivity(companyId, [vendor.id]),
  ]);
  const activity = activityById.get(vendor.id)!;
  const topCategory = categories.get(vendor.id)?.top ?? null;
  const rep = contacts.find((contact) => contact.isRep) ?? null;
  const spend = spend12(activity.deliveries, now);
  const counts = orderCounts(activity.orders);
  const time = onTime(activity.orders, now);
  const owedNow = owed(activity.bills, activity.credits);
  const months = range === "3m" ? 3 : range === "12m" ? 12 : monthsSince(activity.deliveries, now);
  const last = lastDelivery(activity.deliveries);

  return {
    id: vendor.id,
    code: vendor.code,
    name: vendor.name,
    isActive: vendor.isActive,
    stoppedAt: vendor.stoppedAt?.toISOString() ?? null,
    stoppedBy: vendor.stoppedBy?.name ?? null,
    rep: rep ? { id: rep.id, name: rep.name } : null,
    phone: vendor.phone,
    whatsapp: vendor.whatsapp,
    email: vendor.email,
    sendOrdersOnWhatsapp: vendor.sendOrdersOnWhatsapp,
    pays: { days: vendor.payTermsDays, label: paysWord(vendor.payTermsDays) },
    deliversOn: vendor.deliversOn,
    leadTimeDays: vendor.leadTimeDays,
    leadTime: leadWords(vendor.leadTimeDays),
    minimumOrder: vendor.minimumOrder === null ? null : num(vendor.minimumOrder),
    vatNumber: vendor.vatNumber,
    bpNumber: vendor.taxNumber,
    // The account in full only for those who may change it.
    bank: can.update ? { masked: maskBank(vendor.bankDetails), full: vendor.bankDetails } : { masked: maskBank(vendor.bankDetails) },
    address: vendor.address,
    topCategory,
    chips: { pays: paysChip(vendor.payTermsDays), category: topCategory, late: lateOrders(activity.orders, now) },
    kpis: {
      spend12: num(spend.spend),
      spendPrev12: num(spend.before),
      spendDelta: spend.delta,
      orders: counts.orders,
      openOrders: counts.open,
      onTimePct: time.pct,
      onTimePrevPct: time.before,
      onTimeDelta: time.delta,
      fillRatePct: fillRate(activity.orders, activity.deliveries, now),
      unitsShortThisYear: unitsShortThisYear(activity.orders, now),
      owed: num(owedNow),
      nextDue: owedNote(activity.bills),
      lastDelivery: last?.toISOString() ?? null,
    },
    chart: { months: boughtPerMonth(activity.deliveries, now, months).map((m) => ({ month: m.month, value: num(m.value) })) },
    counts: {
      orders: counts.orders,
      deliveries: activity.deliveries.length,
      bills: activity.bills.length,
      payments: activity.credits.payments.length,
      returns: activity.credits.returns.length,
      contacts: contacts.length,
    },
    contacts,
    can,
    now: now.toISOString(),
  };
}

/** "12 units short this year", "1 unit short this year". */
export const shortWords = (units: number) => `${formatCount(units)} ${units === 1 ? "unit" : "units"} short this year`;
