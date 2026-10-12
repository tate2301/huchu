import { Prisma } from "@prisma/client";

import { balance, lockCustomer } from "./ledger";

/**
 * Points back on a refund or a void (CUS-01, W-46), inside its transaction.
 *
 * `share` is how much of the sale went back (|refund total| ÷ sale total; 1
 * for a void). What the sale earned comes off in that share and what it
 * spent goes back in that share, each capped so the reversals of one sale
 * never exceed what it earned or spent. The points taken off never take the
 * balance below nothing: what cannot be taken is left, with a note.
 */
export async function reversePoints(
  tx: Prisma.TransactionClient,
  input: {
    saleId: string;
    reversalSaleId: string;
    share: Prisma.Decimal.Value;
    actor?: { id: string | null; name: string | null };
    at?: Date;
  },
): Promise<{ takenBack: number; givenBack: number }> {
  const moved = await tx.retailPointsEntry.findMany({
    where: { saleId: input.saleId, kind: { in: ["EARNED", "SPENT"] } },
    select: { companyId: true, customerId: true, kind: true, points: true, value: true },
  });
  if (moved.length === 0) return { takenBack: 0, givenBack: 0 };
  const { companyId, customerId } = moved[0]!;
  const earned = moved.filter((row) => row.kind === "EARNED").reduce((sum, row) => sum + row.points, 0);
  const spent = moved.filter((row) => row.kind === "SPENT").reduce((sum, row) => sum - row.points, 0);
  const worth = (kind: "EARNED" | "SPENT") =>
    moved.filter((row) => row.kind === kind).reduce((sum, row) => sum.plus(row.value), new Prisma.Decimal(0));

  await lockCustomer(tx, customerId);
  // What earlier refunds of this sale already reversed.
  const before = await tx.retailPointsEntry.findMany({
    where: { kind: "REVERSED", customerId, sale: { sourceSaleId: input.saleId } },
    select: { points: true },
  });
  const takenBefore = before.filter((row) => row.points < 0).reduce((sum, row) => sum - row.points, 0);
  const givenBefore = before.filter((row) => row.points > 0).reduce((sum, row) => sum + row.points, 0);

  const share = Prisma.Decimal.min(new Prisma.Decimal(input.share).abs(), 1);
  const portion = (points: number) => share.times(points).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  const givenBack = Math.max(Math.min(portion(spent), spent - givenBefore), 0);
  let takenBack = Math.max(Math.min(portion(earned), earned - takenBefore), 0);
  const at = input.at ?? new Date();
  const row = (points: number, kind: "EARNED" | "SPENT", note: string | null) => ({
    companyId,
    customerId,
    kind: "REVERSED" as const,
    points,
    value: (kind === "EARNED" ? earned : spent) > 0
      ? worth(kind).times(Math.abs(points)).dividedBy(kind === "EARNED" ? earned : spent).toDecimalPlaces(2)
      : new Prisma.Decimal(0),
    saleId: input.reversalSaleId,
    note,
    actorId: input.actor?.id ?? null,
    actorName: input.actor?.name ?? null,
    createdAt: at,
  });

  if (givenBack > 0) await tx.retailPointsEntry.create({ data: row(givenBack, "SPENT", null) });
  if (takenBack > 0) {
    const held = await balance(tx, customerId);
    const wanted = takenBack;
    takenBack = Math.min(takenBack, Math.max(held, 0));
    const note = takenBack < wanted ? `Only ${takenBack} could be taken back.` : null;
    if (takenBack > 0) await tx.retailPointsEntry.create({ data: row(-takenBack, "EARNED", note) });
    else if (note) await tx.retailPointsEntry.create({ data: { ...row(0, "EARNED", note) } });
  }
  return { takenBack, givenBack };
}
