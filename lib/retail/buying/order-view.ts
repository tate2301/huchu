import type { RetailOrderPayment, RetailOrderSentVia } from "@prisma/client";

import { quantity, sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { binState, type BinState } from "@/lib/retail/bin";
import { isOpenForDelivery, outstanding } from "@/lib/retail/purchase-orders";
import { dayKey, formatDay, formatTime } from "@/lib/workspace/format";

import { deliveredValue, lateness, orderedDelivered, orderTotals, stillToCome, type OrderState } from "./figures";
import { channelOf, chaseRecipient, expectedFor, orderRecipients } from "./orders";
import { repOf } from "./suppliers";
import { shortName, type OrderChannel } from "./words";

/**
 * An order as its record reads it (40-buying 4.3 `OrderView`, 5.4): the
 * state and whether it is late, the steps, the figures behind the KPIs and
 * the chart, its lines and deliveries, the rail's facts and what can be done
 * to it now. Words that depend on the viewer's role are the record kind's.
 */

export type OrderStep = { label: string; state: "done" | "now" | "todo" };

export type OrderView = {
  id: string;
  poNo: string;
  status: OrderState;
  binned: BinState | null;
  supplier: { id: string; name: string; payTermsDays: number | null; stopped: boolean };
  site: { id: string; name: string };
  /** The site can change: nothing has come. */
  siteOpen: boolean;
  raisedAt: string;
  raisedBy: string | null;
  sentAt: string | null;
  sentVia: RetailOrderSentVia | null;
  /** "WhatsApp, 10 August 14:20", "By hand, 10 August", "Not yet". */
  sentWords: string;
  channel: OrderChannel;
  expectedDate: string | null;
  firstExpectedDate: string | null;
  promisedFor: string | null;
  payment: RetailOrderPayment;
  noteToSupplier: string | null;
  late: { days: number } | null;
  steps: OrderStep[];
  figures: {
    lines: number;
    ordered: number;
    delivered: number;
    deliveredPct: number;
    net: number;
    vat: number;
    total: number;
    deliveredValue: number;
    stillUnits: number;
    stillValue: number;
    /** Units on lines closed short: "480 units not delivered". */
    notDelivered: number;
    /** Done: the last delivery against the first expected day, in days (0 on time). */
    doneLateDays: number | null;
  };
  chart: Array<{ name: string; label: string; pct: number }>;
  lines: Array<{
    id: string;
    productId: string | null;
    name: string;
    category: string | null;
    quantity: number;
    received: number;
    unitCost: number;
    vatRate: number;
    outstanding: number;
    closedShort: boolean;
  }>;
  deliveries: Array<{ id: string; receiptNo: string; postedAt: string; units: number }>;
  /** The order's requisition (Submitted, Approved, Paid out, Accounted for): its chip and rail row. */
  requisition: { id: string; requisitionNo: string; status: "SUBMITTED" | "APPROVED" | "DISBURSED" | "ACQUITTED"; amount: number } | null;
  counts: { lines: number; deliveries: number; messages: number };
  can: {
    send: boolean;
    edit: boolean;
    close: boolean;
    reopen: boolean;
    remove: boolean;
    duplicate: boolean;
    receive: boolean;
    /** Sent or part delivered: "Send a reminder" and "Cancel what is left". */
    chase: boolean;
    cancelRest: boolean;
  };
  /**
   * The chase sheet's starting point (5.17): who it goes to (the first
   * contact who gets orders, else the rep; null with no contacts, when it
   * goes to the supplier's own number), how, and the day to promise (today
   * plus the lead time, tomorrow at the soonest). Null when not waiting.
   */
  chase: {
    contact: { id: string; label: string; sub: string | null } | null;
    hasContacts: boolean;
    channel: "WHATSAPP" | "EMAIL";
    firstName: string | null;
    promisedFor: string;
  } | null;
};

const VIA_WORDS: Record<RetailOrderSentVia, string> = { WHATSAPP: "WhatsApp", EMAIL: "Email", BY_HAND: "By hand" };
const noYear = (value: Date) => formatDay(value).replace(/ \d{4}$/, "");

/** Draft · Sent · Part delivered · Received · Billed, done up to where the order is. */
export function orderSteps(state: OrderState): OrderStep[] {
  const labels = ["Draft", "Sent", "Part delivered", state === "CLOSED" ? "Closed short" : "Received", "Billed"];
  if (state === "CANCELLED") {
    return [
      { label: "Draft", state: "done" },
      { label: "Sent", state: "done" },
      { label: "Cancelled", state: "now" },
    ];
  }
  // Bills arrive with their unit: a received or closed order waits at Billed.
  const now = { DRAFT: 0, SENT: 1, PARTIAL: 2, RECEIVED: 4, CLOSED: 4 }[state];
  return labels.map((label, index) => ({ label, state: index < now ? "done" : index === now ? "now" : "todo" }));
}

export async function loadOrderView(companyId: string, id: string, now = new Date()): Promise<OrderView | null> {
  const order = await prisma.retailPurchaseOrder.findFirst({
    where: { id, companyId },
    include: {
      vendor: {
        select: {
          id: true,
          name: true,
          payTermsDays: true,
          leadTimeDays: true,
          stoppedAt: true,
          whatsapp: true,
          email: true,
          sendOrdersOnWhatsapp: true,
          contactName: true,
          contacts: { where: { removedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, phone: true, email: true, sends: true } },
        },
      },
      site: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      lines: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { inventoryItem: { select: { productId: true, product: { select: { retailCategory: { select: { name: true } } } } } } },
      },
      receipts: { where: { status: "POSTED" }, orderBy: { postedAt: "asc" }, select: { id: true, receiptNo: true, postedAt: true, createdAt: true, lines: { select: { quantity: true } } } },
    },
  });
  if (!order) return null;
  const state = order.status as OrderState;
  const figureLines = order.lines.map((line) => ({
    quantity: line.quantity,
    receivedQuantity: line.receivedQuantity,
    unitCost: line.unitCost,
    vatRate: line.vatRate,
    closedShort: Boolean(line.closedShortAt),
  }));
  const figureOrder = { state, lines: figureLines, firstExpectedDate: order.firstExpectedDate };
  const late = lateness(figureOrder, now);
  const totals = orderTotals(figureLines);
  const { ordered, delivered } = orderedDelivered(figureLines);
  const still = stillToCome(figureOrder);
  const notDelivered = order.lines
    .filter((line) => line.closedShortAt)
    .reduce((sum, line) => sum + Math.max(0, toNumberOrZero(line.quantity) - toNumberOrZero(line.receivedQuantity)), 0);
  const lastDelivery = order.receipts.at(-1)?.postedAt ?? null;
  const doneLateDays =
    (state === "RECEIVED" || state === "CLOSED") && lastDelivery && order.firstExpectedDate
      ? Math.max(0, Math.round((Date.parse(dayKey(lastDelivery)) - Date.parse(dayKey(order.firstExpectedDate))) / 86_400_000))
      : null;
  const messages = await prisma.retailMessage.count({ where: { companyId, entityType: "RetailPurchaseOrder", entityId: order.id } });
  const requisition = await prisma.crmRequisition.findFirst({
    where: { companyId, purchaseOrderId: order.id, status: { in: ["SUBMITTED", "APPROVED", "DISBURSED", "ACQUITTED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, requisitionNo: true, status: true, amount: true, approvedAmount: true, paidAmount: true, acquittedAmount: true },
  });
  const recipients = orderRecipients(order.vendor);
  const open = state === "DRAFT" || state === "SENT" || state === "PARTIAL";
  const anythingCame = order.lines.some((line) => quantity(line.receivedQuantity).greaterThan(0));
  const binned = await binState(companyId, "RetailPurchaseOrder", order.id, order.archivedAt, now);
  const waiting = state === "SENT" || state === "PARTIAL";
  const rep = repOf(order.vendor.contactName, order.vendor.contacts);
  const chaseTo = order.vendor.contacts.find((contact) => contact.sends === "ORDERS" && (contact.phone || contact.email)) ?? rep;
  const chaseVia = chaseRecipient(order.vendor, chaseTo ?? null);

  return {
    id: order.id,
    poNo: order.poNo,
    status: state,
    binned,
    supplier: { id: order.vendor.id, name: order.vendor.name, payTermsDays: order.vendor.payTermsDays, stopped: order.vendor.stoppedAt !== null },
    site: order.site ?? { id: "", name: "No shop" },
    siteOpen: open && !anythingCame,
    raisedAt: order.createdAt.toISOString(),
    raisedBy: order.createdBy?.name ?? null,
    sentAt: order.sentAt?.toISOString() ?? null,
    sentVia: order.sentVia,
    sentWords: !order.sentAt
      ? "Not yet"
      : order.sentVia === "BY_HAND" || !order.sentVia
        ? `By hand, ${noYear(order.sentAt)}`
        : `${VIA_WORDS[order.sentVia]}, ${noYear(order.sentAt)} ${formatTime(order.sentAt)}`,
    channel: channelOf(recipients),
    expectedDate: order.expectedDate ? dayKey(order.expectedDate) : null,
    firstExpectedDate: order.firstExpectedDate ? dayKey(order.firstExpectedDate) : null,
    promisedFor: order.chaseAction && order.chasedAt && order.expectedDate ? dayKey(order.expectedDate) : null,
    payment: order.payment,
    noteToSupplier: order.noteToSupplier,
    late: late.late ? { days: late.days } : null,
    steps: orderSteps(state),
    figures: {
      lines: order.lines.length,
      ordered,
      delivered,
      deliveredPct: ordered > 0 ? Math.round((delivered / ordered) * 100) : 0,
      net: toNumberOrZero(totals.lines),
      vat: toNumberOrZero(totals.vat),
      total: toNumberOrZero(totals.total),
      deliveredValue: toNumberOrZero(deliveredValue(figureLines)),
      stillUnits: still.units,
      stillValue: toNumberOrZero(still.value),
      notDelivered,
      doneLateDays,
    },
    chart: order.lines.map((line) => {
      const q = toNumberOrZero(line.quantity);
      return { name: line.itemName, label: shortName(line.itemName), pct: q > 0 ? Math.min(100, Math.round((toNumberOrZero(line.receivedQuantity) / q) * 100)) : 0 };
    }),
    lines: order.lines.map((line) => ({
      id: line.id,
      productId: line.inventoryItem?.productId ?? null,
      name: line.itemName,
      category: line.inventoryItem?.product?.retailCategory?.name ?? null,
      quantity: toNumberOrZero(line.quantity),
      received: toNumberOrZero(line.receivedQuantity),
      unitCost: toNumberOrZero(line.unitCost),
      vatRate: toNumberOrZero(line.vatRate),
      outstanding: state === "DRAFT" ? toNumberOrZero(line.quantity) : toNumberOrZero(outstanding(line)),
      closedShort: Boolean(line.closedShortAt),
    })),
    deliveries: order.receipts.map((receipt) => ({
      id: receipt.id,
      receiptNo: receipt.receiptNo,
      postedAt: (receipt.postedAt ?? receipt.createdAt).toISOString(),
      units: toNumberOrZero(sumMoney(receipt.lines.map((line) => line.quantity))),
    })),
    requisition: requisition
      ? {
          id: requisition.id,
          requisitionNo: requisition.requisitionNo ?? "Requisition",
          status: requisition.status as "SUBMITTED" | "APPROVED" | "DISBURSED" | "ACQUITTED",
          amount: toNumberOrZero(requisition.acquittedAmount ?? requisition.paidAmount ?? requisition.approvedAmount ?? requisition.amount),
        }
      : null,
    counts: { lines: order.lines.length, deliveries: order.receipts.length, messages },
    can: {
      send: state === "DRAFT" && order.lines.length > 0 && !order.vendor.stoppedAt,
      edit: open,
      close: state === "PARTIAL" || (state === "SENT" && late.late),
      reopen: state === "CLOSED",
      remove: state === "DRAFT",
      duplicate: !order.vendor.stoppedAt,
      receive: isOpenForDelivery(order.status) && !order.archivedAt,
      chase: waiting,
      cancelRest: waiting,
    },
    chase: waiting
      ? {
          contact: chaseTo
            ? { id: chaseTo.id, label: chaseTo === rep ? `${chaseTo.name}, rep` : chaseTo.name, sub: chaseTo.phone ?? chaseTo.email ?? null }
            : null,
          hasContacts: order.vendor.contacts.length > 0,
          channel: chaseVia?.channel ?? "WHATSAPP",
          firstName: chaseVia?.firstName ?? null,
          promisedFor: expectedFor(Math.max(1, order.vendor.leadTimeDays ?? 0), now),
        }
      : null,
  };
}
