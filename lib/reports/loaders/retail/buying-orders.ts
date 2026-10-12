import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { BUYING_REPORTS } from "@/lib/reports/definitions/retail/buying";
import { loaderParams, periodInstants, runList } from "@/lib/reports/list-query";
import { num, result, TAKE } from "@/lib/reports/loaders/shared";
import type { ListPageResult, ReportContext, ReportLoader, ReportOption, ReportParams, ReportRow, ResolvedListQuery } from "@/lib/reports/types";
import { lateness, type OrderState } from "@/lib/retail/buying/figures";
import { channelOf, dayStart, orderRecipients } from "@/lib/retail/buying/orders";
import { CHANNEL_WORDS, firstWord, orderBadge } from "@/lib/retail/buying/words";
import { dayKey, DEFAULT_TIME_ZONE, formatCount, formatDay, formatShortDay, formatTime } from "@/lib/workspace/format";

/**
 * Orders (40-buying 4.1, `retail-orders`): every order not in the bin, paged
 * in the database. Each row's figures (ordered, delivered, value with VAT,
 * still to come with VAT) are summed from its lines in SQL, so the Σ row and
 * "Most still to come" cover every filtered order, not a page. A grouped
 * list and Reports' face run through the in-memory engine over the loaded
 * rows. Its record's Lines and Messages tabs are small and read in memory.
 */

const LIST = BUYING_REPORTS.find((source) => source.key === "retail-orders")!.list!;

const TAB_STATES: Record<string, string[] | null> = {
  open: ["SENT", "PARTIAL"],
  drafts: ["DRAFT"],
  received: ["RECEIVED", "CLOSED", "CANCELLED"],
  all: null,
};

type Filters = { supplier?: string; site?: string; raised?: string; supplierId?: string; late?: string; q?: string };

/** One order and its line sums. Money with VAT, line by line to the cent, as `orderTotals` does. */
const ORDERS = Prisma.sql`
  SELECT po.id, po."poNo" AS "poNo", po.status::text AS status, po."vendorId" AS "supplierId", v.name AS supplier,
         po."siteId" AS "siteId", s.name AS site, po."createdAt" AS "raisedAt",
         po."firstExpectedDate" AS "firstExpectedDate", po."expectedDate" AS "expectedDate",
         coalesce(l.ordered, 0) AS ordered, coalesce(l.received, 0) AS received,
         coalesce(l.value, 0) AS value,
         CASE WHEN po.status::text IN ('DRAFT', 'SENT', 'PARTIAL') THEN coalesce(l.still_units, 0) ELSE 0 END AS "stillUnits",
         CASE WHEN po.status::text IN ('DRAFT', 'SENT', 'PARTIAL') THEN coalesce(l.still_value, 0) ELSE 0 END AS "stillValue",
         coalesce(l.delivered_value, 0) AS "deliveredValue", coalesce(l.lines_owed, 0) AS "linesOwed"
  FROM "RetailPurchaseOrder" po
  JOIN "Vendor" v ON v.id = po."vendorId"
  JOIN "Site" s ON s.id = po."siteId"
  LEFT JOIN LATERAL (
    SELECT sum(x.quantity) AS ordered, sum(x."receivedQuantity") AS received,
           sum(round(x.quantity * x."unitCost", 2) + round(round(x.quantity * x."unitCost", 2) * x."vatRate" / 100, 2)) AS value,
           sum(x.left_units) AS still_units,
           sum(round(x.left_units * x."unitCost", 2) + round(round(x.left_units * x."unitCost", 2) * x."vatRate" / 100, 2)) AS still_value,
           sum(round(x."receivedQuantity" * x."unitCost", 2) + round(round(x."receivedQuantity" * x."unitCost", 2) * x."vatRate" / 100, 2)) AS delivered_value,
           count(*) FILTER (WHERE x.left_units > 0) AS lines_owed
    FROM (
      SELECT pl.*, CASE WHEN pl."closedShortAt" IS NOT NULL THEN 0
                        ELSE greatest(pl.quantity - CASE WHEN po.status::text = 'DRAFT' THEN 0 ELSE pl."receivedQuantity" END, 0) END AS left_units
      FROM "RetailPurchaseOrderLine" pl WHERE pl."purchaseOrderId" = po.id
    ) x
  ) l ON true`;

function whereFor(companyId: string, filters: Filters, tab: string | null, now: Date): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`o."companyId" = ${companyId}`, Prisma.sql`o."archivedAt" IS NULL`];
  const states = tab ? TAB_STATES[tab] : null;
  if (states) parts.push(Prisma.sql`o.status::text IN (${Prisma.join(states)})`);
  if (filters.supplier && filters.supplier !== "any") parts.push(Prisma.sql`o."vendorId" = ${filters.supplier}`);
  if (filters.supplierId) parts.push(Prisma.sql`o."vendorId" = ${filters.supplierId}`);
  if (filters.site && filters.site !== "any") parts.push(Prisma.sql`o."siteId" = ${filters.site}`);
  if (filters.late === "late" || filters.late === "not-late") {
    // Late counts from the day first expected, never from a promise a reminder moved it to.
    const late = Prisma.sql`(o.status::text IN ('SENT', 'PARTIAL') AND o."firstExpectedDate" < ${dayStart(dayKey(now, DEFAULT_TIME_ZONE))}
      AND EXISTS (SELECT 1 FROM "RetailPurchaseOrderLine" ol
                  WHERE ol."purchaseOrderId" = o.id AND ol."closedShortAt" IS NULL AND ol.quantity > ol."receivedQuantity"))`;
    parts.push(filters.late === "late" ? late : Prisma.sql`NOT ${late}`);
  }
  const range = filters.raised ? periodInstants(filters.raised, now, DEFAULT_TIME_ZONE) : undefined;
  if (range?.gte) parts.push(Prisma.sql`o."createdAt" >= ${range.gte}`);
  if (range?.lt) parts.push(Prisma.sql`o."createdAt" < ${range.lt}`);
  const q = filters.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    parts.push(Prisma.sql`(o."poNo" ILIKE ${like} OR EXISTS (SELECT 1 FROM "Vendor" vv WHERE vv.id = o."vendorId" AND vv.name ILIKE ${like}))`);
  }
  return Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}`;
}

function orderFor(sort: string): Prisma.Sql {
  switch (sort) {
    case "raised":
    case "raisedAt:desc":
      return Prisma.sql`ORDER BY r."raisedAt" DESC, r."poNo" DESC`;
    case "still":
    case "stillToCome:desc":
      return Prisma.sql`ORDER BY r."stillValue" DESC, r."poNo" ASC`;
    case "number":
    case "poNo:asc":
      return Prisma.sql`ORDER BY r."poNo" ASC`;
    case "poNo:desc":
      return Prisma.sql`ORDER BY r."poNo" DESC`;
    default:
      return Prisma.sql`ORDER BY r."firstExpectedDate" ASC NULLS LAST, r."expectedDate" ASC NULLS LAST, r."poNo" ASC`;
  }
}

type OrderRow = {
  id: string;
  poNo: string;
  status: OrderState;
  supplierId: string;
  supplier: string;
  siteId: string;
  site: string;
  raisedAt: Date;
  firstExpectedDate: Date | null;
  expectedDate: Date | null;
  ordered: Prisma.Decimal;
  received: Prisma.Decimal;
  value: Prisma.Decimal;
  stillUnits: Prisma.Decimal;
  stillValue: Prisma.Decimal;
  deliveredValue: Prisma.Decimal;
  linesOwed: bigint | number;
  /** "on WhatsApp", "by email", "by hand": how a send would reach the supplier. */
  sendWords: string;
};

async function selectRows(where: Prisma.Sql, order: Prisma.Sql, limit: number, offset = 0): Promise<OrderRow[]> {
  const rows = await prisma.$queryRaw<Omit<OrderRow, "sendWords">[]>`
    SELECT r.* FROM (${ORDERS} WHERE po.id IN (SELECT o.id FROM "RetailPurchaseOrder" o ${where})) r
    ${order}
    LIMIT ${limit} OFFSET ${offset}`;
  // How each supplier takes orders ("on WhatsApp"), for the bulk send's ask: one read for the page's suppliers.
  const vendors = await prisma.vendor.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.supplierId))] } },
    select: {
      id: true,
      name: true,
      whatsapp: true,
      email: true,
      sendOrdersOnWhatsapp: true,
      contactName: true,
      contacts: { where: { removedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { name: true, phone: true, email: true, sends: true } },
    },
  });
  const how = new Map(vendors.map((vendor) => [vendor.id, CHANNEL_WORDS[channelOf(orderRecipients(vendor))]]));
  return rows.map((row) => ({ ...row, sendWords: how.get(row.supplierId) ?? CHANNEL_WORDS.BY_HAND }));
}

export function toOrderRow(row: OrderRow, now: Date): ReportRow {
  const ordered = num(row.ordered) ?? 0;
  const received = num(row.received) ?? 0;
  const stillUnits = num(row.stillUnits) ?? 0;
  const late = lateness(
    { state: row.status, firstExpectedDate: row.firstExpectedDate, lines: stillUnits > 0 ? [{ quantity: stillUnits, unitCost: 0, vatRate: 0 }] : [] },
    now,
  );
  const badge = orderBadge(row.status, late.late ? late.days : null);
  const expected = row.firstExpectedDate ?? row.expectedDate;
  const deliveredWords = `${formatCount(received)} of ${formatCount(ordered)}`;
  const stillValue = num(row.stillValue) ?? 0;
  return {
    id: row.id,
    poNo: row.poNo,
    supplier: row.supplier,
    supplierId: row.supplierId,
    supplierShort: firstWord(row.supplier),
    site: row.site,
    siteId: row.siteId,
    status: row.status,
    state: badge.label,
    tone: badge.tone,
    raised: dayKey(row.raisedAt, DEFAULT_TIME_ZONE),
    raisedAt: row.raisedAt.toISOString(),
    expected: expected ? dayKey(expected, DEFAULT_TIME_ZONE) : null,
    delivered: deliveredWords,
    deliveredWords,
    deliveredPct: ordered > 0 ? Math.round((received / ordered) * 100) : 0,
    ordered,
    received,
    value: num(row.value) ?? 0,
    stillToCome: stillValue,
    // The pill when something came, or the order is late; plain money for an order nothing has come against.
    stillPill: stillValue > 0 && (row.status === "PARTIAL" || late.late) ? "warn" : null,
    stillUnits,
    deliveredValue: num(row.deliveredValue) ?? 0,
    linesOwed: Number(row.linesOwed),
    closable: row.status === "PARTIAL" || (row.status === "SENT" && late.late) ? "yes" : "no",
    sendWords: row.sendWords,
    title: `${row.poNo} · ${row.supplier}`,
    cardMeta: `${deliveredWords}${expected ? ` · expected ${formatShortDay(expected)}` : ""}`,
  };
}

function filtersOf(params: ReportParams): Filters {
  return { supplier: params.supplier, site: params.site, raised: params.raised, supplierId: params.supplierId, late: params.late };
}

async function loadOrders(ctx: ReportContext, params: ReportParams) {
  const now = new Date();
  const rows = await selectRows(whereFor(ctx.companyId, filtersOf(params), null, now), orderFor("expected"), TAKE);
  return result(rows.map((row) => toOrderRow(row, now)));
}

/** The tabs' sizes, over every order the parent scopes to (search and filters do not narrow a tab). */
async function tabCounts(ctx: ReportContext, supplierId: string | undefined): Promise<Record<string, number>> {
  const counts = await prisma.retailPurchaseOrder.groupBy({
    by: ["status"],
    where: { companyId: ctx.companyId, archivedAt: null, ...(supplierId ? { vendorId: supplierId } : {}) },
    _count: { _all: true },
  });
  const of = (states: string[] | null) => counts.filter((row) => !states || states.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  return Object.fromEntries(Object.entries(TAB_STATES).map(([key, states]) => [key, of(states)]));
}

type Sums = { total: number; ordered: Prisma.Decimal | null; received: Prisma.Decimal | null; value: Prisma.Decimal | null; still: Prisma.Decimal | null };

async function pageOrders(ctx: ReportContext, query: ResolvedListQuery): Promise<ListPageResult> {
  const now = new Date();
  const tabs = await tabCounts(ctx, query.filters.supplierId);
  if (query.group) {
    const loaded = await loadOrders(ctx, loaderParams(query));
    const run = runList(LIST, loaded.rows, query, { role: ctx.role, userId: ctx.userId, now, timeZone: DEFAULT_TIME_ZONE, can: () => false, seeCost: true });
    return { ...run.result, tabs, truncated: loaded.truncated };
  }
  const where = whereFor(ctx.companyId, { ...filtersOf(query.filters), q: query.q }, query.tab, now);
  const [sums] = await prisma.$queryRaw<Sums[]>`
    SELECT count(*)::int AS total, sum(r.ordered) AS ordered, sum(r.received) AS received, sum(r.value) AS value, sum(r."stillValue") AS still
    FROM (${ORDERS} WHERE po.id IN (SELECT o.id FROM "RetailPurchaseOrder" o ${where})) r`;
  const total = sums?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.size));
  const page = Math.min(Math.max(1, query.page), pages);
  const rows = total ? await selectRows(where, orderFor(query.sort), query.size, (page - 1) * query.size) : [];
  return {
    total,
    pages,
    page,
    rows: rows.map((row) => toOrderRow(row, now)),
    groups: null,
    totals: {
      delivered: `${formatCount(num(sums?.received) ?? 0)} of ${formatCount(num(sums?.ordered) ?? 0)}`,
      value: num(sums?.value) ?? 0,
      stillToCome: num(sums?.still) ?? 0,
    },
    summary: {},
    tabs,
    everEmpty: tabs.all === 0,
    truncated: false,
  };
}

async function orderOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const [suppliers, sites] = await Promise.all([
    prisma.vendor.findMany({
      where: { companyId: ctx.companyId, purchaseOrders: { some: { archivedAt: null } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.site.findMany({ where: { companyId: ctx.companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    supplier: suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
    site: sites.map((site) => ({ value: site.id, label: site.name })),
  };
}

/* ── An order's Lines and Messages ──────────────────────────────────────── */

async function loadOrderLines(ctx: ReportContext, params: ReportParams) {
  if (!params.orderId) return result([]);
  const order = await prisma.retailPurchaseOrder.findFirst({
    where: { id: params.orderId, companyId: ctx.companyId },
    select: {
      id: true,
      status: true,
      firstExpectedDate: true,
      lines: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          itemName: true,
          quantity: true,
          receivedQuantity: true,
          unitCost: true,
          vatRate: true,
          closedShortAt: true,
          inventoryItem: { select: { productId: true } },
        },
      },
    },
  });
  if (!order) return result([]);
  const state = order.status as OrderState;
  const now = new Date();
  const late = lateness(
    {
      state,
      firstExpectedDate: order.firstExpectedDate,
      lines: order.lines.map((line) => ({ quantity: line.quantity, receivedQuantity: line.receivedQuantity, unitCost: line.unitCost, vatRate: line.vatRate, closedShort: Boolean(line.closedShortAt) })),
    },
    now,
  ).late;
  const open = state === "DRAFT" || state === "SENT" || state === "PARTIAL";
  return result(
    order.lines.map((line, index): ReportRow => {
      const ordered = num(line.quantity) ?? 0;
      const delivered = num(line.receivedQuantity) ?? 0;
      const left = line.closedShortAt || !open ? 0 : Math.max(0, ordered - (state === "DRAFT" ? 0 : delivered));
      return {
        id: line.id,
        orderId: order.id,
        productId: line.inventoryItem?.productId ?? null,
        order: index,
        product: line.itemName,
        ordered,
        delivered,
        stillToCome: left,
        stillTone: left > 0 && (state === "PARTIAL" || late) ? "warn" : null,
        stillUnit: line.closedShortAt ? "not delivered" : null,
        cost: num(line.unitCost) ?? 0,
        costTone: "ink-3",
        value: Math.round(ordered * (num(line.unitCost) ?? 0) * 100) / 100,
      };
    }),
  );
}

const MESSAGE_STATE = {
  QUEUED: { label: "Waiting to send", tone: "pending" },
  SENT: { label: "Sent", tone: "info" },
  FAILED: { label: "Failed", tone: "bad" },
} as const;

async function loadOrderMessages(ctx: ReportContext, params: ReportParams) {
  if (!params.orderId) return result([]);
  const order = await prisma.retailPurchaseOrder.findFirst({
    where: { id: params.orderId, companyId: ctx.companyId },
    select: { id: true, vendor: { select: { name: true, contacts: { where: { removedAt: null }, select: { name: true, phone: true, email: true } } } } },
  });
  if (!order) return result([]);
  const messages = await prisma.retailMessage.findMany({
    where: { companyId: ctx.companyId, entityType: "RetailPurchaseOrder", entityId: order.id },
    orderBy: { createdAt: "desc" },
    take: TAKE,
    select: { id: true, channel: true, to: true, body: true, status: true, lastError: true, direction: true, createdAt: true, sentAt: true },
  });
  const digits = (value: string | null) => (value ?? "").replace(/\D/g, "");
  const nameOf = (to: string) =>
    order.vendor.contacts.find((contact) => (contact.phone && digits(contact.phone) === digits(to)) || contact.email?.trim().toLowerCase() === to.toLowerCase())?.name ??
    order.vendor.name;
  return result(
    messages.map((message): ReportRow => {
      const reply = message.direction === "IN";
      const state = reply
        ? { label: "Reply", tone: "hollow" }
        : message.status === "FAILED"
          ? { label: message.lastError ? `Failed: ${message.lastError}` : "Failed", tone: "bad" }
          : MESSAGE_STATE[message.status];
      const at = message.sentAt ?? message.createdAt;
      return {
        id: message.id,
        orderId: order.id,
        when: at.toISOString(),
        whenText: `${formatDay(at)} ${formatTime(at)}`,
        who: reply ? `From ${order.vendor.name}` : `To ${nameOf(message.to)}`,
        how: message.channel === "WHATSAPP" ? "WhatsApp" : "Email",
        message: message.body,
        status: reply ? "REPLY" : message.status,
        state: state.label,
        tone: state.tone,
      };
    }),
  );
}

export const BUYING_ORDER_LOADERS: Record<string, ReportLoader> = {
  "retail-orders": { load: loadOrders, page: pageOrders, options: orderOptions },
  "retail-order-lines": { load: loadOrderLines },
  "retail-order-messages": { load: loadOrderMessages },
};
