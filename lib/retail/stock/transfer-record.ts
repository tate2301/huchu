import { prisma } from "@/lib/prisma";
import { DEFAULT_TIME_ZONE, dayKey } from "@/lib/workspace/format";

import { stillToCome, transferState, type TransferStatus } from "./transfer-words";

/**
 * One transfer as its record reads it (30-stock 4.5 `TransferView`, 5.14):
 * where it goes, who sent and received it, its lines with what came and what
 * is still to come, what the receiving site holds now, and how often stock
 * has moved between these two sites by month. Cost and value only for a role
 * that may see cost.
 */

export type TransferLineView = {
  id: string;
  product: { id: string; name: string };
  /** The stock line it left from: what the lines sheet sends back. */
  fromLineId: string;
  unit: string;
  sent: number;
  received: number;
  lost: number;
  toCome: number;
  unitCost?: number;
  value?: number;
};

export type TransferView = {
  id: string;
  transferNo: string;
  status: TransferStatus;
  stateLabel: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  sentAt: string;
  sentBy: string;
  driver: string | null;
  vehicle: string | null;
  arrives: string | null;
  note: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  cancelledAt: string | null;
  lines: TransferLineView[];
  units: number;
  received: number;
  lost: number;
  toCome: number;
  value?: number;
  /** Units on hand at the To site now. */
  toSiteHolds: number;
  /** Between these two sites, either way, the last 36 months, oldest first (cancelled ones did not move). */
  history: Array<{ month: string; transfers: number }>;
  /** When the server read it, so "today" and "2h 10m" are the server's. */
  now: string;
};

/** Months of history the record carries; "All time" is this much. */
export const HISTORY_MONTHS = 36;

/** `YYYY-MM` of an instant in the shop's zone. */
export function monthKey(at: Date, timeZone = DEFAULT_TIME_ZONE): string {
  return dayKey(at, timeZone).slice(0, 7);
}

/** The `count` months ending with the one `now` falls in, oldest first. */
export function monthsEnding(now: Date, count: number, timeZone = DEFAULT_TIME_ZONE): string[] {
  const [year, month] = monthKey(now, timeZone).split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const back = count - 1 - index;
    const total = year * 12 + (month - 1) - back;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

/** Transfers per month over `months`, from the instants they left. */
export function bucketByMonth(sentAts: Date[], months: string[], timeZone = DEFAULT_TIME_ZONE) {
  const counts = new Map(months.map((month) => [month, 0]));
  for (const at of sentAts) {
    const key = monthKey(at, timeZone);
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }
  return months.map((month) => ({ month, transfers: counts.get(month)! }));
}

const cents = (value: number) => Math.round(value * 100) / 100;

/** The transfer, or null when it is not this shop's. */
export async function loadTransferView(
  companyId: string,
  id: string,
  { canSeeCost, now = new Date() }: { canSeeCost: boolean; now?: Date },
): Promise<TransferView | null> {
  const transfer = await prisma.retailStockTransfer.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      transferNo: true,
      status: true,
      fromSiteId: true,
      toSiteId: true,
      fromSite: { select: { name: true } },
      toSite: { select: { name: true } },
      sentAt: true,
      sentBy: { select: { name: true } },
      driver: true,
      vehicle: true,
      arrives: true,
      note: true,
      receivedAt: true,
      receivedBy: { select: { name: true } },
      cancelledAt: true,
      lines: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          fromItemId: true,
          quantitySent: true,
          quantityReceived: true,
          quantityLost: true,
          unitCost: true,
          product: { select: { id: true, name: true } },
          fromItem: { select: { unit: true } },
        },
      },
    },
  });
  if (!transfer) return null;

  const months = monthsEnding(now, HISTORY_MONTHS);
  const [holds, between] = await Promise.all([
    prisma.inventoryItem.aggregate({
      where: { siteId: transfer.toSiteId, productId: { not: null } },
      _sum: { currentStock: true },
    }),
    prisma.retailStockTransfer.findMany({
      where: {
        companyId,
        status: { not: "CANCELLED" },
        // A day early, so no zone puts the first month's first hours outside; the buckets decide.
        sentAt: { gte: new Date(Date.parse(`${months[0]}-01T00:00:00Z`) - 24 * 60 * 60 * 1000) },
        OR: [
          { fromSiteId: transfer.fromSiteId, toSiteId: transfer.toSiteId },
          { fromSiteId: transfer.toSiteId, toSiteId: transfer.fromSiteId },
        ],
      },
      select: { sentAt: true },
    }),
  ]);

  const lines = transfer.lines.map((line): TransferLineView => {
    const sent = line.quantitySent.toNumber();
    const received = line.quantityReceived.toNumber();
    const lost = line.quantityLost.toNumber();
    const unitCost = line.unitCost.toNumber();
    return {
      id: line.id,
      product: line.product,
      fromLineId: line.fromItemId,
      unit: line.fromItem.unit,
      sent,
      received,
      lost,
      toCome: stillToCome(transfer.status, { sent, received, lost }),
      ...(canSeeCost ? { unitCost, value: cents(sent * unitCost) } : {}),
    };
  });
  const tally = lines.reduce(
    (sum, line) => ({ sent: sum.sent + line.sent, received: sum.received + line.received, lost: sum.lost + line.lost }),
    { sent: 0, received: 0, lost: 0 },
  );

  return {
    id: transfer.id,
    transferNo: transfer.transferNo,
    status: transfer.status,
    stateLabel: transferState(transfer.status, tally).label,
    from: { id: transfer.fromSiteId, name: transfer.fromSite.name },
    to: { id: transfer.toSiteId, name: transfer.toSite.name },
    sentAt: transfer.sentAt.toISOString(),
    sentBy: transfer.sentBy.name,
    driver: transfer.driver,
    vehicle: transfer.vehicle,
    arrives: transfer.arrives,
    note: transfer.note,
    receivedAt: transfer.receivedAt?.toISOString() ?? null,
    receivedBy: transfer.receivedBy?.name ?? null,
    cancelledAt: transfer.cancelledAt?.toISOString() ?? null,
    lines,
    units: tally.sent,
    received: tally.received,
    lost: tally.lost,
    toCome: stillToCome(transfer.status, tally),
    ...(canSeeCost ? { value: cents(lines.reduce((sum, line) => sum + (line.value ?? 0), 0)) } : {}),
    toSiteHolds: holds._sum.currentStock?.toNumber() ?? 0,
    history: bucketByMonth(
      between.map((row) => row.sentAt),
      months,
    ),
    now: now.toISOString(),
  };
}
