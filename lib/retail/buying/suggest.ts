import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { coverWindowStart, netSoldByLine } from "@/lib/retail/stock/on-hand";
import { COVER_AIM, COVER_WINDOW_DAYS, stockLevel } from "@/lib/retail/stock/levels";
import { formatCount } from "@/lib/workspace/format";

import { costsToday, expectedFor, orderRecipients, channelOf } from "./orders";
import type { OrderChannel } from "./words";

/**
 * What to order from a supplier (40-buying W-30 "Suggested lines"): the
 * products they supply that are stocked at the site, live and selling.
 *
 * - **Low** is STK-01's own rule (`stockLevel` says Out or Low): the quantity
 *   is the line's Reorder quantity when set, else enough for 14 days of the
 *   last 30 days' rate plus the lead time, less what is on hand, rounded up
 *   to a whole case when the product has one, at least 1. Sub "Low: 18 left,
 *   sells 31 a day".
 * - **Usual** is not low and on at least two of this supplier's last three
 *   orders: the median of those quantities. Sub "Usual order".
 *
 * Low first, the least cover first; then usual ones by name. With
 * `productIds` the lines are exactly those products, and the supplier is the
 * one most of them name.
 */

export type SuggestInput = {
  productId: string;
  inventoryItemId: string;
  name: string;
  onHand: number;
  reorderAt: number | null;
  reorderQty: number | null;
  sold30: number;
  archived: boolean;
  /** The smallest case the product is sold in, when it has one. */
  caseSize: number | null;
  /** Quantities on this supplier's last three orders that had it (one each). */
  lastOrders: number[];
  cost: number;
  /** The product's VAT rate, percent. */
  vatRate: number;
};

export type SuggestedLine = {
  productId: string;
  inventoryItemId: string;
  name: string;
  sub: string | null;
  warn: boolean;
  quantity: number;
  cost: number;
  vatRate: number;
  kind: "low" | "usual" | "asked";
};

const roundUpTo = (n: number, step: number | null) => (step && step > 1 ? Math.ceil(n / step) * step : n);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.ceil((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** How much a low line asks for. */
export function lowQuantity(line: SuggestInput, leadTimeDays: number): number {
  if (line.reorderQty !== null && line.reorderQty > 0) return Math.max(1, Math.ceil(line.reorderQty));
  const perDay = line.sold30 / COVER_WINDOW_DAYS;
  const need = Math.ceil(perDay * (COVER_AIM + leadTimeDays) - line.onHand);
  return Math.max(1, roundUpTo(Math.max(need, 1), line.caseSize));
}

/** "Low: 18 left, sells 31 a day"; "Low: 3 left" for a line that has not sold lately. */
export function lowSub(line: Pick<SuggestInput, "onHand" | "sold30">): string {
  const perDay = Math.round(line.sold30 / COVER_WINDOW_DAYS);
  const left = `Low: ${formatCount(Math.max(0, line.onHand))} left`;
  return perDay > 0 ? `${left}, sells ${formatCount(perDay)} a day` : left;
}

const isLow = (line: SuggestInput) => {
  const level = stockLevel({ onHand: line.onHand, reorderAt: line.reorderAt, soldLast30: line.sold30, archived: line.archived });
  return level === "OUT" || level === "LOW";
};

/** Days the line lasts at its rate; nought when out, none when it does not sell. */
const coverOf = (line: SuggestInput) => (line.onHand <= 0 ? 0 : line.sold30 > 0 ? line.onHand / (line.sold30 / COVER_WINDOW_DAYS) : Number.POSITIVE_INFINITY);

/** The suggested lines, in their order. With `asked`, exactly those products (low and usual subs still said). */
export function planSuggestions(lines: SuggestInput[], leadTimeDays: number, asked: { quantity: number | null } | null = null): SuggestedLine[] {
  const low: SuggestInput[] = [];
  const usual: SuggestInput[] = [];
  const rest: SuggestInput[] = [];
  for (const line of lines) {
    if (isLow(line)) low.push(line);
    else if (line.lastOrders.length >= 2) usual.push(line);
    else rest.push(line);
  }
  low.sort((a, b) => coverOf(a) - coverOf(b) || a.name.localeCompare(b.name));
  usual.sort((a, b) => a.name.localeCompare(b.name));
  const out: SuggestedLine[] = [
    ...low.map((line) => ({ ...base(line), sub: lowSub(line), warn: true, quantity: lowQuantity(line, leadTimeDays), kind: "low" as const })),
    ...usual.map((line) => ({ ...base(line), sub: "Usual order", warn: false, quantity: median(line.lastOrders), kind: "usual" as const })),
  ];
  if (!asked) return out;
  rest.sort((a, b) => a.name.localeCompare(b.name));
  out.push(...rest.map((line) => ({ ...base(line), sub: null, warn: false, quantity: lowQuantity(line, leadTimeDays), kind: "asked" as const })));
  // One product asked for with a quantity (the product chart's "Order 24 by Monday"): that quantity.
  if (asked.quantity && out.length === 1) out[0] = { ...out[0]!, quantity: asked.quantity };
  return out;
}

function base(line: SuggestInput) {
  return { productId: line.productId, inventoryItemId: line.inventoryItemId, name: line.name, cost: line.cost, vatRate: line.vatRate };
}

/** The supplier most of these products name (ties: the first by name); null when none names one. */
export function presetSupplier(products: Array<{ supplierId: string | null; supplierName: string | null }>): string | null {
  const counts = new Map<string, { n: number; name: string }>();
  for (const product of products) {
    if (!product.supplierId) continue;
    const seen = counts.get(product.supplierId);
    counts.set(product.supplierId, { n: (seen?.n ?? 0) + 1, name: product.supplierName ?? "" });
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name));
  return ranked[0]?.[0] ?? null;
}

export type Suggestion = {
  supplier: {
    id: string;
    name: string;
    payTermsDays: number | null;
    leadTimeDays: number | null;
    minimumOrder: number | null;
    stopped: boolean;
  };
  site: { id: string; name: string };
  /** Today plus the lead time, `YYYY-MM-DD`. */
  expected: string;
  channel: OrderChannel;
  lines: SuggestedLine[];
};

/** The suggestions for a supplier (or, with `productIds` and no supplier, the one most of them name) at a site. */
export async function suggestFor(
  companyId: string,
  input: { supplierId: string | null; siteId: string; productIds: string[] | null; quantity?: number | null },
  now = new Date(),
): Promise<Suggestion | null> {
  const asked = input.productIds && input.productIds.length > 0 ? input.productIds : null;
  let supplierId = input.supplierId;
  if (!supplierId && asked) {
    const products = await prisma.product.findMany({
      where: { companyId, id: { in: asked } },
      select: { supplierId: true, supplier: { select: { name: true, stoppedAt: true } } },
    });
    supplierId = presetSupplier(products.filter((p) => !p.supplier?.stoppedAt).map((p) => ({ supplierId: p.supplierId, supplierName: p.supplier?.name ?? null })));
  }
  if (!supplierId) return null;
  const vendor = await prisma.vendor.findFirst({
    where: { id: supplierId, companyId },
    select: {
      id: true,
      name: true,
      payTermsDays: true,
      leadTimeDays: true,
      minimumOrder: true,
      stoppedAt: true,
      whatsapp: true,
      email: true,
      sendOrdersOnWhatsapp: true,
      contactName: true,
      contacts: { where: { removedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { name: true, phone: true, email: true, sends: true } },
    },
  });
  if (!vendor) return null;
  const site = await prisma.site.findFirst({ where: { id: input.siteId, companyId }, select: { id: true, name: true } });
  if (!site) return null;
  const lead = vendor.leadTimeDays ?? 0;

  const items = await prisma.inventoryItem.findMany({
    where: {
      siteId: input.siteId,
      site: { companyId },
      product: asked
        ? { is: { companyId, id: { in: asked } } }
        : { is: { companyId, supplierId: vendor.id, archivedAt: null, isActive: true } },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      currentStock: true,
      minStock: true,
      reorderQty: true,
      unitCost: true,
      productId: true,
      product: { select: { name: true, isActive: true, defaultTaxRate: true, packs: { where: { archivedAt: null }, orderBy: { packSize: "asc" }, select: { packSize: true } } } },
    },
  });
  const unique = items.filter((item, index) => item.productId && items.findIndex((other) => other.productId === item.productId) === index);
  const [sold, costs, recent] = await Promise.all([
    netSoldByLine(
      unique.map((item) => item.id),
      coverWindowStart(now.getTime()),
    ),
    costsToday(
      prisma,
      companyId,
      vendor.id,
      unique.map((item) => ({ inventoryItemId: item.id, productId: item.productId!, unitCost: item.unitCost })),
    ),
    prisma.retailPurchaseOrder.findMany({
      where: { companyId, vendorId: vendor.id, archivedAt: null, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { lines: { select: { quantity: true, inventoryItem: { select: { productId: true } } } } },
    }),
  ]);
  const lastOrders = new Map<string, number[]>();
  for (const order of recent) {
    const seen = new Set<string>();
    for (const line of order.lines) {
      const productId = line.inventoryItem?.productId;
      if (!productId || seen.has(productId)) continue;
      seen.add(productId);
      lastOrders.set(productId, [...(lastOrders.get(productId) ?? []), toNumberOrZero(line.quantity)]);
    }
  }
  const inputs: SuggestInput[] = unique.map((item) => ({
    productId: item.productId!,
    inventoryItemId: item.id,
    name: item.product!.name,
    onHand: toNumberOrZero(item.currentStock),
    reorderAt: item.minStock === null ? null : toNumberOrZero(item.minStock),
    reorderQty: item.reorderQty === null ? null : toNumberOrZero(item.reorderQty),
    sold30: sold.get(item.id) ?? 0,
    archived: !item.product!.isActive,
    caseSize: item.product!.packs.find((pack) => (pack.packSize ?? 0) > 1)?.packSize ?? null,
    lastOrders: lastOrders.get(item.productId!) ?? [],
    cost: toNumberOrZero(costs.get(item.productId!) ?? 0),
    vatRate: toNumberOrZero(item.product!.defaultTaxRate),
  }));
  return {
    supplier: {
      id: vendor.id,
      name: vendor.name,
      payTermsDays: vendor.payTermsDays,
      leadTimeDays: vendor.leadTimeDays,
      minimumOrder: vendor.minimumOrder === null ? null : toNumberOrZero(vendor.minimumOrder),
      stopped: vendor.stoppedAt !== null,
    },
    site,
    expected: expectedFor(vendor.leadTimeDays, now),
    channel: channelOf(orderRecipients(vendor)),
    lines: planSuggestions(inputs, lead, asked ? { quantity: input.quantity ?? null } : null),
  };
}
