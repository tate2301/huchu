/**
 * What a shop calls each deposit value it charges: "Bottles, 340 to 375ml"
 * for 0.10, "Crates of 24" for 3.40. A product keeps its own deposit amount;
 * its kind is found by that amount, so a name is never out of step with what
 * the till charges.
 */

import { prisma } from "@/lib/prisma";
import { toNumberOrZero } from "@/lib/money";

export type DepositKind = { amount: number; name: string };

/** The shop's named deposit values, smallest first. */
export async function loadDepositKinds(companyId: string): Promise<DepositKind[]> {
  const rows = await prisma.retailDepositKind.findMany({
    where: { companyId },
    orderBy: { amount: "asc" },
    select: { amount: true, name: true },
  });
  return rows.map((row) => ({ amount: toNumberOrZero(row.amount), name: row.name }));
}

/** The name the shop gives a deposit amount; null when it has none, or there is no deposit. */
export function depositKindName(kinds: readonly DepositKind[], amount: number | null | undefined): string | null {
  if (!amount) return null;
  const cents = Math.round(amount * 100);
  return kinds.find((kind) => Math.round(kind.amount * 100) === cents)?.name ?? null;
}
