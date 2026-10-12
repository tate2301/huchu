import { prisma } from "@/lib/prisma";
import type { RetailAuditActor } from "@/lib/retail/audit";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { outstanding } from "@/lib/retail/purchase-orders";
import { emptiesShop, EmptiesRefusal } from "@/lib/retail/stock/empties";
import { multiplyMoney, sumMoney, toNumberOrZero } from "@/lib/money";
import { dayKey, formatDay, formatShortDay } from "@/lib/workspace/format";

import { DeliveryRefusal } from "./deliveries";
import { lateness, lineVat, orderedDelivered, type OrderState } from "./figures";
import { firstWord } from "./words";

/**
 * What the Receive page (40-buying 5.7) and the delivery record (5.6) read:
 * `receivingView` for `GET /orders/[id]/receiving`, `deliveryView` for
 * `GET /deliveries/[id]`. Words the server owns ("300 of 780 came on 13
 * August", "120 came on 13 Aug", the terms sentence) are written here.
 */

const DAY_MS = 86_400_000;
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** "13 August" — the year left to the reader. */
const dayMonth = (at: Date) => formatDay(at).replace(/ \d{4}$/, "");

export type ReceivingLine = {
  orderLineId: string;
  inventoryItemId: string;
  productId: string | null;
  name: string;
  /** The product's own barcode, and its case's with the case size. */
  barcodes: string[];
  packBarcode: string | null;
  packSize: number | null;
  ordered: number;
  /** "120 came on 13 Aug" / "First delivery". */
  before: string;
  /** Still to come: what "This time" starts at. */
  due: number;
  unitCost: number;
  vatRate: number;
};

export type ReceivingView = {
  order: {
    id: string;
    poNo: string;
    status: OrderState;
    draft: boolean;
    supplier: { id: string; name: string; short: string };
    site: { id: string; name: string };
    late: { days: number } | null;
    dueToday: boolean;
    deliveriesSoFar: number;
    /** "Delta Beverages, second delivery". */
    heading: string;
    /** "300 of 780 came on 13 August" / "Nothing has come yet". */
    deliveredSummary: string;
  };
  lines: ReceivingLine[];
  terms: { payment: "ON_ACCOUNT" | "CASH_ON_DELIVERY"; sentence: string };
  empties: { on: true; perCrate: string; crateWord: string; inStore: number } | null;
  /** Paid-out requisitions for this supplier not yet linked to a delivery; the newest first. */
  requisitions: Array<{ id: string; requisitionNo: string; amount: number; status: string }>;
  counter: { id: string; name: string };
  can: { post: boolean };
};

/** The order a delivery is received against, or a refusal in the page's words (404; 409 "PO-0003 is closed…"). */
export async function receivingView(actor: RetailAuditActor, orderId: string, now: Date = new Date()): Promise<ReceivingView> {
  const companyId = actor.companyId;
  const order = await prisma.retailPurchaseOrder.findFirst({
    where: { id: orderId, companyId, archivedAt: null },
    include: {
      vendor: { select: { id: true, name: true, payTermsDays: true } },
      site: { select: { id: true, name: true } },
      lines: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          inventoryItem: {
            select: {
              id: true,
              productId: true,
              unitCost: true,
              product: { select: { name: true, barcode: true, packs: { where: { archivedAt: null }, orderBy: { packSize: "asc" }, select: { barcode: true, packSize: true } } } },
            },
          },
          receiptLines: { where: { receipt: { status: "POSTED" } }, select: { noteQuantity: true, receipt: { select: { postedAt: true } } } },
        },
      },
      receipts: { where: { status: "POSTED" }, orderBy: { postedAt: "asc" }, select: { postedAt: true } },
    },
  });
  if (!order) throw new DeliveryRefusal(404, "Purchase order not found");
  if (order.status === "CLOSED") throw new DeliveryRefusal(409, `${order.poNo} is closed. Reopen it to book a delivery against it.`);
  if (order.status === "RECEIVED") throw new DeliveryRefusal(409, `Everything on ${order.poNo} has already come.`);
  if (order.status === "CANCELLED") throw new DeliveryRefusal(409, `${order.poNo} was cancelled.`);

  const state = order.status as OrderState;
  const figureLines = order.lines.map((line) => ({
    quantity: line.quantity,
    receivedQuantity: line.receivedQuantity,
    unitCost: line.unitCost,
    vatRate: line.vatRate,
    closedShort: Boolean(line.closedShortAt),
  }));
  const late = lateness({ state, lines: figureLines, firstExpectedDate: order.firstExpectedDate }, now);
  const expected = order.expectedDate ?? order.firstExpectedDate;
  const dueToday = !late.late && expected !== null && dayKey(expected) === dayKey(now);
  const { ordered, delivered } = orderedDelivered(figureLines);
  const so = order.receipts.length;
  const lastAt = order.receipts.at(-1)?.postedAt ?? null;
  const short = firstWord(order.vendor.name);

  const lines = order.lines
    .filter((line) => line.inventoryItem)
    .map((line): ReceivingLine => {
      const item = line.inventoryItem!;
      const came = toNumberOrZero(line.receivedQuantity);
      const lastCame = line.receiptLines.reduce<Date | null>((latest, row) => (row.receipt.postedAt && (!latest || row.receipt.postedAt > latest) ? row.receipt.postedAt : latest), null);
      const pack = item.product?.packs.find((entry) => entry.barcode && entry.packSize) ?? null;
      return {
        orderLineId: line.id,
        inventoryItemId: item.id,
        productId: item.productId,
        name: item.product?.name ?? line.itemName,
        barcodes: item.product?.barcode ? [item.product.barcode] : [],
        packBarcode: pack?.barcode ?? null,
        packSize: pack?.packSize ?? null,
        ordered: toNumberOrZero(line.quantity),
        before: came > 0 ? `${came} came${lastCame ? ` on ${formatShortDay(lastCame)}` : ""}` : "First delivery",
        due: toNumberOrZero(outstanding(line)),
        unitCost: toNumberOrZero(line.unitCost),
        vatRate: toNumberOrZero(line.vatRate),
      };
    });

  const terms =
    order.payment === "CASH_ON_DELIVERY"
      ? { payment: order.payment, sentence: `Cash on delivery to ${short}.` }
      : order.vendor.payTermsDays
        ? {
            payment: order.payment,
            sentence: `On account with ${short}, ${order.vendor.payTermsDays} days from delivery. The bill for this delivery falls due on ${formatShortDay(new Date(now.getTime() + order.vendor.payTermsDays * DAY_MS))}.`,
          }
        : { payment: order.payment, sentence: `On account with ${short}, due on delivery.` };

  let empties: ReceivingView["empties"] = null;
  try {
    const deposits = await emptiesShop(prisma, companyId);
    const last = await prisma.retailEmptiesEntry.findFirst({ where: { siteId: order.siteId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { cratesAfter: true } });
    empties = { on: true, perCrate: deposits.crateDeposit.toFixed(2), crateWord: "Crates", inStore: last?.cratesAfter ?? 0 };
  } catch (error) {
    if (!(error instanceof EmptiesRefusal)) throw error;
  }

  const [requisitions, counter] = await Promise.all([
    prisma.crmRequisition.findMany({
      where: { companyId, siteId: { not: null }, status: "DISBURSED", deliveries: { none: {} }, OR: [{ payeeVendorId: order.vendorId }, { purchaseOrderId: order.id }] },
      orderBy: { disbursedAt: "desc" },
      select: { id: true, requisitionNo: true, status: true, amount: true, paidAmount: true },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { id: true, name: true } }),
  ]);

  return {
    order: {
      id: order.id,
      poNo: order.poNo,
      status: state,
      draft: state === "DRAFT",
      supplier: { id: order.vendor.id, name: order.vendor.name, short },
      site: order.site,
      late: late.late ? { days: late.days } : null,
      dueToday,
      deliveriesSoFar: so,
      heading: `${order.vendor.name}, ${ORDINALS[so] ?? `delivery ${so + 1}`}${ORDINALS[so] ? " delivery" : ""}`,
      deliveredSummary: delivered > 0 ? `${delivered} of ${ordered} came ${so > 1 ? "by" : "on"} ${lastAt ? dayMonth(lastAt) : "the last delivery"}` : "Nothing has come yet",
    },
    lines,
    terms,
    empties,
    requisitions: requisitions.map((row) => ({
      id: row.id,
      requisitionNo: row.requisitionNo,
      amount: toNumberOrZero(row.paidAmount ?? row.amount),
      status: row.status,
    })),
    counter: { id: counter.id, name: counter.name ?? "You" },
    can: { post: canRetailRoleDo(actor.userRole, "retail.purchasing", "approve") },
  };
}

/* ── The delivery record (5.6) ──────────────────────────────────────────── */

export type DeliveryStep = { label: string; state: "done" | "now" | "todo" };

export type DeliveryView = {
  id: string;
  receiptNo: string;
  status: "COUNTED" | "POSTED" | "REVERSED";
  supplier: { id: string; name: string };
  order: { id: string; poNo: string; deliveredPct: number } | null;
  site: { id: string; name: string };
  noteNumber: string | null;
  driver: string | null;
  countedBy: { id: string; name: string } | null;
  checkedBy: { id: string; name: string } | null;
  receivedAt: string;
  checkedAt: string | null;
  steps: DeliveryStep[];
  /** "12 short" warn, "2 damaged" bad, "No order", "Reversed" bad. */
  chips: Array<{ label: string; tone: "warn" | "bad" | "plain" }>;
  figures: {
    /** In stock from it. */
    units: number;
    /** On the note: what came, damaged included. */
    noteUnits: number;
    lines: number;
    linesWithDifferences: number;
    /** Σ quantity × cost ex VAT. */
    value: number;
    valueWithVat: number;
    short: number;
    shortValue: number;
    damaged: number;
  };
  /** In stock ÷ on the note, per line. */
  chart: Array<{ name: string; label: string; pct: number }>;
  rail: { credit: string; photos: string };
  bill: { id: string; billNumber: string } | null;
  counts: { lines: number; differences: number; photos: number };
  can: { post: boolean; edit: boolean; editCounter: boolean };
};

const DELIVERY_STEPS = ["Arrived", "Counted", "Checked", "In stock", "Billed"];

/** "Castle 340ml" — the chart's tick: the first word and the size. */
function tickOf(name: string) {
  const words = name.split(/\s+/);
  const size = words.find((word) => /^\d+(?:[.,]\d+)?(?:ml|l|cl|kg|g)$/i.test(word));
  return size && words[0] !== size ? `${words[0]} ${size}` : (words[0] ?? name);
}

export async function deliveryView(actor: RetailAuditActor, id: string): Promise<DeliveryView> {
  const companyId = actor.companyId;
  const receipt = await prisma.retailGoodsReceipt.findFirst({
    where: { id, companyId },
    include: {
      vendor: { select: { id: true, name: true } },
      site: { select: { id: true, name: true } },
      countedBy: { select: { id: true, name: true } },
      checkedBy: { select: { id: true, name: true } },
      purchaseOrder: { select: { id: true, poNo: true, lines: { select: { quantity: true, receivedQuantity: true, unitCost: true, vatRate: true } } } },
      lines: { orderBy: { createdAt: "asc" } },
      differences: { orderBy: { createdAt: "asc" }, select: { settle: true, settledAt: true, createdAt: true } },
    },
  });
  if (!receipt) throw new DeliveryRefusal(404, "Delivery not found");
  const photos = await prisma.retailAttachment.findMany({
    where: { companyId, entityType: "RetailGoodsReceipt", entityId: receipt.id },
    orderBy: { createdAt: "asc" },
    select: { name: true, kind: true },
  });

  const lineShort = (line: (typeof receipt.lines)[number]) => Math.max(0, toNumberOrZero(line.noteQuantity.minus(line.damagedQuantity).minus(line.quantity)));
  const units = toNumberOrZero(sumMoney(receipt.lines.map((line) => line.quantity)));
  const noteUnits = toNumberOrZero(sumMoney(receipt.lines.map((line) => line.noteQuantity)));
  const damaged = toNumberOrZero(sumMoney(receipt.lines.map((line) => line.damagedQuantity)));
  const short = receipt.lines.reduce((sum, line) => sum + lineShort(line), 0);
  const shortValue = toNumberOrZero(sumMoney(receipt.lines.map((line) => multiplyMoney(lineShort(line), line.unitCost))));
  const value = sumMoney(receipt.lines.map((line) => line.lineTotal));
  const valueWithVat = sumMoney(receipt.lines.map((line) => line.lineTotal.plus(lineVat(line.lineTotal, line.vatRate))));

  const status = receipt.status;
  const now = status === "COUNTED" ? 2 : status === "POSTED" ? 4 : -1;
  const steps: DeliveryStep[] =
    status === "REVERSED"
      ? DELIVERY_STEPS.map((label, index) => ({ label, state: index < 3 ? "done" : "todo" }))
      : DELIVERY_STEPS.map((label, index) => ({ label, state: index < now ? "done" : index === now ? "now" : "todo" }));

  const chips: DeliveryView["chips"] = [];
  if (status === "REVERSED") chips.push({ label: "Reversed", tone: "bad" });
  if (damaged > 0) chips.push({ label: `${damaged} damaged`, tone: "bad" });
  if (short > 0) chips.push({ label: `${short} short`, tone: "warn" });
  if (!receipt.purchaseOrder) chips.push({ label: "No order", tone: "plain" });

  const order = receipt.purchaseOrder
    ? (() => {
        const { ordered, delivered } = orderedDelivered(receipt.purchaseOrder.lines.map((line) => ({ ...line, closedShort: false })));
        return { id: receipt.purchaseOrder.id, poNo: receipt.purchaseOrder.poNo, deliveredPct: ordered > 0 ? Math.round((delivered / ordered) * 100) : 0 };
      })()
    : null;

  const credits = receipt.differences.filter((difference) => difference.settle === "CREDIT");
  const credit =
    credits.length === 0
      ? "None"
      : credits.every((difference) => difference.settledAt)
        ? `Came, ${dayMonth(credits.reduce((latest, difference) => (difference.settledAt! > latest ? difference.settledAt! : latest), credits[0]!.settledAt!))}`
        : `Asked for, ${dayMonth(credits[0]!.createdAt)}`;
  const pictures = photos.filter((photo) => photo.kind === "PHOTO" || photo.kind === "DELIVERY_NOTE");

  const can = canRetailRoleDo(actor.userRole, "retail.purchasing", "approve");
  const edit = canRetailRoleDo(actor.userRole, "retail.purchasing", "update");
  return {
    id: receipt.id,
    receiptNo: receipt.receiptNo,
    status,
    supplier: receipt.vendor,
    order,
    site: receipt.site,
    noteNumber: receipt.noteNumber,
    driver: receipt.driver,
    countedBy: receipt.countedBy ? { id: receipt.countedBy.id, name: receipt.countedBy.name ?? "—" } : null,
    checkedBy: receipt.checkedBy ? { id: receipt.checkedBy.id, name: receipt.checkedBy.name ?? "—" } : null,
    receivedAt: receipt.createdAt.toISOString(),
    checkedAt: receipt.checkedAt?.toISOString() ?? null,
    steps,
    chips,
    figures: {
      units,
      noteUnits,
      lines: receipt.lines.length,
      linesWithDifferences: receipt.lines.filter((line) => !line.noteQuantity.equals(line.quantity)).length,
      value: toNumberOrZero(value),
      valueWithVat: toNumberOrZero(valueWithVat),
      short,
      shortValue,
      damaged,
    },
    chart: receipt.lines.map((line) => {
      const note = toNumberOrZero(line.noteQuantity);
      return { name: line.itemName, label: tickOf(line.itemName), pct: note > 0 ? Math.round((toNumberOrZero(line.quantity) / note) * 100) : 0 };
    }),
    rail: {
      credit,
      photos: pictures.length === 0 ? "None" : `${pictures.length} ${pictures.length === 1 ? "photo" : "photos"}, ${pictures[0]!.name}`,
    },
    bill: null,
    counts: { lines: receipt.lines.length, differences: receipt.differences.length, photos: pictures.length },
    can: { post: status === "COUNTED" && can, edit, editCounter: status === "COUNTED" && edit },
  };
}
