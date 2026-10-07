import { prisma } from "@/lib/prisma";
import { tillState, type DeviceKind } from "@/lib/retail/till-words";
import { formatTime } from "@/lib/workspace/format";

import type { NeedsActionProvider, NeedsActionRow } from "./types";
import { countTitle } from "./words";

/** A sale ZIMRA has not signed yet, with the till it waits on. */
export type UnsignedSale = {
  postedAt: Date | null;
  till: {
    name: string;
    device: { kind: DeviceKind; lastSeenAt: Date | null } | null;
    shiftOpen: boolean;
  } | null;
};

/**
 * "Two receipts not yet fiscalised" (W-44). When the till that rang the
 * newest of them is offline: "Handheld 1 offline since 13:58 · will send on
 * reconnect"; else "Waiting for ZIMRA · it retries every few minutes".
 */
export function notFiscalisedRow(sales: ReadonlyArray<UnsignedSale>, now: Date): NeedsActionRow | null {
  if (sales.length === 0) return null;
  const newest = [...sales].sort((a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0))[0]!;
  const till = newest.till;
  const offline = till && tillState({ device: till.device, shiftOpen: till.shiftOpen }, now).state === "OFFLINE";
  const seen = till?.device?.lastSeenAt;
  return {
    key: "not-fiscalised",
    tone: "warn",
    title: `${countTitle(sales.length, "receipt", "receipts")} not yet fiscalised`,
    meta: offline
      ? `${till.name} offline${seen ? ` since ${formatTime(seen)}` : ""} · will send on reconnect`
      : "Waiting for ZIMRA · it retries every few minutes",
    figure: String(sales.length),
    figureTone: "ink",
    href: "/retail/manage/tills",
  };
}

export const notFiscalised: NeedsActionProvider = {
  key: "not-fiscalised",
  can: ["retail.cash-control", "view"],
  load: async (ctx) => {
    const sales = await prisma.retailSale.findMany({
      where: {
        companyId: ctx.companyId,
        ...(ctx.siteIds ? { siteId: { in: ctx.siteIds } } : {}),
        OR: [{ fiscalReceipt: { status: { in: ["PENDING", "FAILED"] } } }, { fiscalWaitsSince: { not: null }, fiscalReceipt: null }],
      },
      select: {
        postedAt: true,
        register: {
          select: {
            name: true,
            devices: { where: { unpairedAt: null }, select: { kind: true, lastSeenAt: true }, orderBy: { pairedAt: "desc" }, take: 1 },
            shifts: { where: { status: "OPEN" }, select: { id: true }, take: 1 },
          },
        },
      },
    });
    const rows: UnsignedSale[] = sales.map((sale) => ({
      postedAt: sale.postedAt,
      till: sale.register
        ? { name: sale.register.name, device: sale.register.devices[0] ?? null, shiftOpen: sale.register.shifts.length > 0 }
        : null,
    }));
    return [notFiscalisedRow(rows, ctx.now)].filter((row) => row !== null);
  },
};
