import type { RetailPurchaseOrderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { waitsForAPerson } from "@/lib/vane/drafts";

/**
 * Orders Vane drafted (the PageVaneRetail board, `/retail/buying/orders/vane`):
 * the reorders Vane drafted from Stock to reorder, one per usual supplier,
 * waiting for a person to send them, above the shop's latest other orders.
 * Sending stays the person's: from the order, or by approving Vane's send on
 * its card. Pure shaping below the read (`shapeVaneOrders`), tested.
 */

export type VaneOrderRow = {
  id: string;
  poNo: string;
  supplier: string;
  /** "6 products". */
  lines: string;
  value: number;
  state: "vane" | "draft" | "sent" | "part" | "received" | "closed" | "cancelled";
  stateLabel: string;
  /** "Usual, Tuesdays" for a draft; the day it came or is expected otherwise. */
  delivers: string;
};

export type VaneOrdersView = {
  finding: { fact: string; rest: string };
  /** Vane's drafts waiting to be sent. */
  waiting: number;
  rows: VaneOrderRow[];
};

type OrderFacts = {
  id: string;
  poNo: string;
  status: RetailPurchaseOrderStatus;
  madeByVane: boolean;
  createdById: string | null;
  expectedDate: Date | null;
  createdAt: Date;
  vendor: { name: string; deliversOn: string | null };
  lines: Array<{ inventoryItemId: string | null; itemName: string; lineTotal: number }>;
  receivedAt: Date | null;
};

const STATE: Record<RetailPurchaseOrderStatus, { state: VaneOrderRow["state"]; label: string }> = {
  DRAFT: { state: "draft", label: "Draft" },
  TO_APPROVE: { state: "draft", label: "To approve" },
  SENT: { state: "sent", label: "Sent" },
  PARTIAL: { state: "part", label: "Part delivered" },
  RECEIVED: { state: "received", label: "Received" },
  CLOSED: { state: "closed", label: "Closed" },
  CANCELLED: { state: "cancelled", label: "Cancelled" },
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const day = (date: Date, timeZone: string) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone });

function row(order: OrderFacts, timeZone: string): VaneOrderRow {
  const vane = order.status === "DRAFT" && waitsForAPerson(order);
  const state = vane ? { state: "vane" as const, label: "Vane’s draft" } : STATE[order.status];
  const products = new Set(order.lines.map((line) => line.inventoryItemId ?? line.itemName)).size;
  let delivers = "—";
  if (order.status === "DRAFT") {
    delivers = order.vendor.deliversOn ? `Usual, ${order.vendor.deliversOn}` : order.expectedDate ? `Expected ${day(order.expectedDate, timeZone)}` : "—";
  } else if ((order.status === "RECEIVED" || order.status === "CLOSED") && order.receivedAt) {
    delivers = day(order.receivedAt, timeZone);
  } else if (order.expectedDate) {
    delivers = day(order.expectedDate, timeZone);
  }
  return {
    id: order.id,
    poNo: order.poNo,
    supplier: order.vendor.name,
    lines: plural(products, "product", "products"),
    value: Math.round(order.lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100,
    state: state.state,
    stateLabel: state.label,
    delivers,
  };
}

export function shapeVaneOrders(input: { drafts: OrderFacts[]; others: OrderFacts[]; timeZone: string }): VaneOrdersView {
  const drafts = input.drafts.filter((order) => order.status === "DRAFT" && waitsForAPerson(order));
  const products = new Set(drafts.flatMap((order) => order.lines.map((line) => line.inventoryItemId ?? line.itemName))).size;
  const finding =
    drafts.length > 0
      ? {
          fact: `${drafts.length === 1 ? "1 order is" : `${drafts.length} orders are`} drafted for the ${plural(products, "product", "products")} running low.`,
          rest: `Vane drafted ${drafts.length === 1 ? "it for the" : "one per"} usual supplier from Stock to reorder. ${drafts.length === 1 ? "It goes" : "They go"} when you send ${drafts.length === 1 ? "it" : "them"}.`,
        }
      : {
          fact: "No order of Vane’s waits for you.",
          rest: "When stock runs low, Vane drafts one per usual supplier from Stock to reorder, for you to check and send.",
        };
  return {
    finding,
    waiting: drafts.length,
    rows: [...drafts, ...input.others].map((order) => row(order, input.timeZone)),
  };
}

const SELECT = {
  id: true,
  poNo: true,
  status: true,
  madeByVane: true,
  createdById: true,
  expectedDate: true,
  createdAt: true,
  vendor: { select: { name: true, deliversOn: true } },
  lines: { select: { inventoryItemId: true, itemName: true, lineTotal: true } },
  receipts: { orderBy: { createdAt: "desc" as const }, take: 1, select: { postedAt: true, createdAt: true } },
} as const;

/** Vane's drafts waiting, newest first, and the shop's latest other orders. */
export async function vaneOrders(companyId: string, options: { others?: number; timeZone?: string } = {}): Promise<VaneOrdersView> {
  const [drafts, others] = await Promise.all([
    prisma.retailPurchaseOrder.findMany({
      where: { companyId, archivedAt: null, status: "DRAFT", madeByVane: true, createdById: null },
      orderBy: { createdAt: "desc" },
      select: SELECT,
    }),
    prisma.retailPurchaseOrder.findMany({
      where: { companyId, archivedAt: null, NOT: { status: "DRAFT", madeByVane: true, createdById: null } },
      orderBy: { createdAt: "desc" },
      take: options.others ?? 3,
      select: SELECT,
    }),
  ]);
  const facts = (order: (typeof drafts)[number]): OrderFacts => ({
    ...order,
    lines: order.lines.map((line) => ({ inventoryItemId: line.inventoryItemId, itemName: line.itemName, lineTotal: Number(line.lineTotal) })),
    receivedAt: order.receipts[0]?.postedAt ?? order.receipts[0]?.createdAt ?? null,
  });
  return shapeVaneOrders({ drafts: drafts.map(facts), others: others.map(facts), timeZone: options.timeZone ?? "Africa/Harare" });
}
