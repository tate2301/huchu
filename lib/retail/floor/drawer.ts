import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { tillWords } from "@/lib/retail/shift-open-rules";

/**
 * Which drawer a back-office cash act uses (50-floor decision 2, FLR-02;
 * packets 58 and 67 reuse it): one rule, in order, so money handed back or
 * taken in the back office always lands in exactly one drawer.
 *
 * 1. The drawer the person picked, which must still be open at the site.
 * 2. The sale's own shift, while it is open.
 * 3. The open shift on the sale's till.
 * 4. The person's own open shift at the site.
 * 5. The only open shift at the site.
 * 6. Several: the person is asked (`choose`), stale drawers (open over 12
 *    hours) last, then by till name.
 * 7. None.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export type DrawerShift = {
  id: string;
  shiftNo: string;
  siteId: string;
  registerId: string;
  registerCode: string;
  registerName: string;
  cashierId: string;
  cashierName: string;
  openedAt: Date;
};

export type DrawerOption = { shiftId: string; label: string; stale: boolean };

export type DrawerChoice = { shift: DrawerShift } | { choose: DrawerOption[] } | { none: true };

/** A drawer open longer than this is stale: it sorts last when the person is asked. */
export const STALE_DRAWER_MS = 12 * 60 * 60 * 1000;

export const DRAWER_CLOSED = "That drawer is not open any more.";

/** 409: the drawer picked closed in the meantime. */
export class DrawerClosed extends Error {
  readonly status = 409;
  constructor() {
    super(DRAWER_CLOSED);
    this.name = "DrawerClosed";
  }
}

const SHIFT_SELECT = {
  id: true,
  shiftNo: true,
  siteId: true,
  registerId: true,
  registerCode: true,
  registerName: true,
  cashierId: true,
  cashierName: true,
  openedAt: true,
} satisfies Prisma.RetailShiftSelect;

/** "Front till · Chipo Dube". */
export function drawerLabel(shift: Pick<DrawerShift, "registerName" | "cashierName">): string {
  return `${shift.registerName} · ${shift.cashierName}`;
}

/** "Cash comes out of the front till’s drawer (Chipo Dube)." */
export function drawerHint(shift: Pick<DrawerShift, "registerName" | "cashierName">): string {
  return `Cash comes out of ${tillWords(shift.registerName)}’s drawer (${shift.cashierName}).`;
}

/** "Open a shift at Harare Main Branch to hand cash back." */
export function noDrawer(siteName: string, verb: "hand cash back" | "take cash"): string {
  return `Open a shift at ${siteName} to ${verb}.`;
}

/** The drawers to ask about: fresh ones first by till name, stale ones last. */
export function drawerOptions(shifts: DrawerShift[], now: Date = new Date()): DrawerOption[] {
  return shifts
    .map((shift) => ({ shift, stale: now.getTime() - shift.openedAt.getTime() > STALE_DRAWER_MS }))
    .sort((a, b) => Number(a.stale) - Number(b.stale) || a.shift.registerName.localeCompare(b.shift.registerName))
    .map(({ shift, stale }) => ({ shiftId: shift.id, label: drawerLabel(shift), stale }));
}

export async function resolveDrawer(
  db: Db,
  input: {
    companyId: string;
    siteId: string;
    registerId?: string | null;
    saleShiftId?: string | null;
    chosenShiftId?: string | null;
    actorId: string;
    now?: Date;
  },
): Promise<DrawerChoice> {
  const open = { companyId: input.companyId, siteId: input.siteId, status: "OPEN" as const };

  if (input.chosenShiftId) {
    const chosen = await db.retailShift.findFirst({ where: { ...open, id: input.chosenShiftId }, select: SHIFT_SELECT });
    if (!chosen) throw new DrawerClosed();
    return { shift: chosen };
  }

  const shifts = await db.retailShift.findMany({ where: open, select: SHIFT_SELECT, orderBy: { openedAt: "asc" } });
  const first = (match: (shift: DrawerShift) => boolean) => shifts.find(match);
  const found =
    (input.saleShiftId ? first((shift) => shift.id === input.saleShiftId) : undefined) ??
    (input.registerId ? first((shift) => shift.registerId === input.registerId) : undefined) ??
    first((shift) => shift.cashierId === input.actorId) ??
    (shifts.length === 1 ? shifts[0] : undefined);
  if (found) return { shift: found };
  if (shifts.length > 1) return { choose: drawerOptions(shifts, input.now) };
  return { none: true };
}
