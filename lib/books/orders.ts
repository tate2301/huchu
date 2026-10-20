import type { Prisma, PrismaClient, RetailPurchaseOrderStatus } from "@prisma/client";
import { z } from "zod";

import { count, dayOf, money, shortDay, storedDay } from "./format";
import { periodRange, PERIODS } from "./period";

/**
 * Books → Bills & spending → Purchase orders (BkOrders): the shop's orders and
 * Books' own in one table (D11), by state. An order is a commitment and never
 * posts; what is on order is what was ordered and not yet received, with VAT.
 * Reads only: the moves are the core's (`lib/books/core/purchase-orders.ts`).
 */

export const ORDER_VIEWS = ["draft", "to-approve", "sent", "part-received", "received", "closed", "cancelled"] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];

export const ORDER_TAB_LABEL: Record<OrderView, string> = {
  draft: "Draft",
  "to-approve": "To approve",
  sent: "Sent",
  "part-received": "Part received",
  received: "Received",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const ORDER_STATUS: Record<OrderView, RetailPurchaseOrderStatus> = {
  draft: "DRAFT",
  "to-approve": "TO_APPROVE",
  sent: "SENT",
  "part-received": "PARTIAL",
  received: "RECEIVED",
  closed: "CLOSED",
  cancelled: "CANCELLED",
};

export const ORDERS_PAGE_SIZE = 50;

export const orderQuerySchema = z.object({
  view: z.enum(ORDER_VIEWS).catch("sent"),
  q: z.string().trim().max(100).catch(""),
  supplier: z.string().uuid().nullable().catch(null),
  /** Whose: the shop's orders, or Books' own. */
  source: z.enum(["retail", "books"]).nullable().catch(null),
  period: z.enum(PERIODS).catch("any"),
  sort: z.enum(["newest", "oldest"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type OrderQuery = z.infer<typeof orderQuerySchema>;

export function readOrderQuery(params: URLSearchParams): OrderQuery {
  return orderQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    supplier: params.get("supplier") || null,
    source: params.get("source") || null,
    period: params.get("period") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type OrderRow = {
  id: string;
  number: string;
  supplier: { id: string; name: string };
  /** The shop it is for, else the requisition behind it, else its note. */
  forWhat: string | null;
  expected: string | null;
  /** Of what was ordered, how much has come in, 0 to 100. */
  received: number;
  amount: number;
  status: RetailPurchaseOrderStatus;
  retail: boolean;
  createdById: string | null;
};

export type OrdersView = {
  finding: { fact: string; rest: string | null };
  rows: OrderRow[];
  range: { from: number; to: number; of: number };
  counts: Record<OrderView, number>;
  onOrder: number;
  currency: string;
  suppliers: Array<{ id: string; name: string }>;
  query: OrderQuery;
};

type Db = Pick<PrismaClient, "retailPurchaseOrder">;

type Line = { quantity: Prisma.Decimal | number; receivedQuantity: Prisma.Decimal | number; unitCost: Prisma.Decimal | number; lineTotal: Prisma.Decimal | number; vatRate: Prisma.Decimal | number };

const round = (n: number) => Math.round(n * 100) / 100;

/** What an order comes to with VAT. */
export function orderTotal(lines: Line[]): number {
  return round(lines.reduce((sum, line) => sum + Number(line.lineTotal) * (1 + Number(line.vatRate) / 100), 0));
}

/** What is still to come in, with VAT: ordered less received, at cost. */
export function stillToCome(lines: Line[]): number {
  return round(lines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) - Number(line.receivedQuantity)) * Number(line.unitCost) * (1 + Number(line.vatRate) / 100), 0));
}

/** Of what was ordered, the share received, by quantity. */
export function receivedShare(lines: Line[]): number {
  const ordered = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
  if (ordered <= 0) return 0;
  return Math.min(100, Math.round((lines.reduce((sum, line) => sum + Math.min(Number(line.receivedQuantity), Number(line.quantity)), 0) / ordered) * 100));
}

/** "US$4,962.00 is on order and not yet received." / "PO-0035, US$2,960.00, waits for approval." */
export function ordersFinding(onOrder: number, waiting: Array<{ number: string; amount: number; what: string | null }>, currency = "USD"): { fact: string; rest: string | null } {
  const fact = onOrder > 0.005 ? `${money(onOrder, currency)} is on order and not yet received.` : "Nothing is on order.";
  if (waiting.length === 0) return { fact, rest: null };
  if (waiting.length === 1) {
    const [one] = waiting;
    return { fact, rest: `${one.number}, ${money(one.amount, currency)}${one.what ? ` of ${one.what.toLowerCase()}` : ""}, waits for approval.` };
  }
  return { fact, rest: `${count(waiting.length, "order")} wait for approval, ${money(waiting.reduce((sum, row) => sum + row.amount, 0), currency)} in all.` };
}

export function orderWhere(companyId: string, query: OrderQuery, today = dayOf(new Date())): Prisma.RetailPurchaseOrderWhereInput {
  const where: Prisma.RetailPurchaseOrderWhereInput = { companyId, archivedAt: null, status: ORDER_STATUS[query.view] };
  const range = periodRange(query.period, today);
  if (range) where.createdAt = range;
  if (query.supplier) where.vendorId = query.supplier;
  if (query.source === "books") where.siteId = null;
  if (query.source === "retail") where.siteId = { not: null };
  if (query.q) {
    const q = { contains: query.q, mode: "insensitive" as const };
    where.OR = [{ poNo: q }, { vendor: { name: q } }, { noteToSupplier: q }, { lines: { some: { itemName: q } } }];
  }
  return where;
}

const rowSelect = {
  id: true,
  poNo: true,
  status: true,
  siteId: true,
  expectedDate: true,
  noteToSupplier: true,
  createdById: true,
  vendor: { select: { id: true, name: true } },
  site: { select: { name: true } },
  requisitions: { select: { purpose: true }, take: 1 },
  lines: { select: { quantity: true, receivedQuantity: true, unitCost: true, lineTotal: true, vatRate: true, itemName: true } },
} satisfies Prisma.RetailPurchaseOrderSelect;

type RowRecord = Prisma.RetailPurchaseOrderGetPayload<{ select: typeof rowSelect }>;

export function toOrderRow(record: RowRecord): OrderRow {
  return {
    id: record.id,
    number: record.poNo,
    supplier: record.vendor,
    forWhat: record.site?.name ?? record.requisitions[0]?.purpose ?? record.noteToSupplier ?? null,
    expected: record.expectedDate ? shortDay(storedDay(record.expectedDate)) : null,
    received: receivedShare(record.lines),
    amount: orderTotal(record.lines),
    status: record.status,
    retail: Boolean(record.siteId),
    createdById: record.createdById,
  };
}

export async function readOrders(db: Db, companyId: string, query: OrderQuery, base = "USD"): Promise<OrdersView> {
  const where = orderWhere(companyId, query);
  const live = { companyId, archivedAt: null };
  const [records, matching, grouped, open, waiting, vendors] = await Promise.all([
    db.retailPurchaseOrder.findMany({ where, select: rowSelect, orderBy: [{ createdAt: query.sort === "oldest" ? "asc" : "desc" }], skip: (query.page - 1) * ORDERS_PAGE_SIZE, take: ORDERS_PAGE_SIZE }),
    db.retailPurchaseOrder.count({ where }),
    db.retailPurchaseOrder.groupBy({ by: ["status"], where: live, _count: true }),
    db.retailPurchaseOrder.findMany({ where: { ...live, status: { in: ["SENT", "PARTIAL"] } }, select: { lines: { select: { quantity: true, receivedQuantity: true, unitCost: true, lineTotal: true, vatRate: true } } } }),
    db.retailPurchaseOrder.findMany({ where: { ...live, status: "TO_APPROVE" }, select: { poNo: true, lines: { select: { quantity: true, receivedQuantity: true, unitCost: true, lineTotal: true, vatRate: true, itemName: true } } } }),
    db.retailPurchaseOrder.findMany({ where: live, select: { vendor: { select: { id: true, name: true } } }, distinct: ["vendorId"] }),
  ]);
  const byStatus = new Map(grouped.map((row) => [row.status, row._count]));
  const counts = Object.fromEntries(ORDER_VIEWS.map((view) => [view, byStatus.get(ORDER_STATUS[view]) ?? 0])) as Record<OrderView, number>;
  const onOrder = round(open.reduce((sum, order) => sum + stillToCome(order.lines), 0));
  const rows = records.map(toOrderRow);
  const from = matching === 0 ? 0 : (query.page - 1) * ORDERS_PAGE_SIZE + 1;
  return {
    finding: ordersFinding(onOrder, waiting.map((order) => ({ number: order.poNo, amount: orderTotal(order.lines), what: order.lines.length === 1 ? order.lines[0].itemName : null })), base),
    rows,
    range: { from, to: from === 0 ? 0 : from + rows.length - 1, of: matching },
    counts,
    onOrder,
    currency: base,
    suppliers: vendors.map((row) => row.vendor).sort((a, b) => a.name.localeCompare(b.name)),
    query,
  };
}

/** The list as its page reads it, with what this person may do (`GET /api/books/purchase-orders`). */
export type OrdersPage = OrdersView & { can: { create: boolean; approve: boolean }; me: string };

/** The list as filtered, every page, for Export. */
export async function ordersCsv(db: Db, companyId: string, query: OrderQuery): Promise<string> {
  const records = await db.retailPurchaseOrder.findMany({ where: orderWhere(companyId, query), select: rowSelect, orderBy: [{ createdAt: "desc" }], take: 10_000 });
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [["Order", "Supplier", "For", "Expected", "Received", "Amount"].join(",")];
  for (const record of records) {
    const row = toOrderRow(record);
    lines.push([row.number, row.supplier.name, row.forWhat ?? "", row.expected ?? "", `${row.received}%`, row.amount.toFixed(2)].map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}
