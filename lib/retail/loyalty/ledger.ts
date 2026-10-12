import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { takingsWhere } from "@/lib/retail/floor/takings";
import { todayIn } from "@/lib/workspace/format";

import type { LoyaltySettings } from "./settings";
import { LoyaltyRefusal, spendRefusal } from "./spend";
import { tierFor } from "./tiers";

/**
 * The points ledger's reads and the spend (CUS-01): a customer's balance is
 * the sum of their rows; nothing here edits or deletes one.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** The customer's points now: Σ `points`, one aggregate. */
export async function balance(db: Db, customerId: string): Promise<number> {
  const sum = await db.retailPointsEntry.aggregate({ where: { customerId }, _sum: { points: true } });
  return sum._sum.points ?? 0;
}

const YEAR_MS = 365 * 86_400_000;

/**
 * What the customer spent in the 365 days to `at`: Σ `baseAmount` of their
 * sales (posted or voided), voids and refunds — the floor's takings
 * (`takingsWhere`), so a voided sale and its void come to nothing.
 */
export async function spendOverYear(db: Db, companyId: string, customerId: string, at: Date): Promise<number> {
  const where = { ...takingsWhere({ companyId }), customerId, postedAt: { gte: new Date(at.getTime() - YEAR_MS), lte: at } };
  const sum = await db.retailSale.aggregate({ where, _sum: { baseAmount: true } });
  return Number((sum._sum.baseAmount ?? new Prisma.Decimal(0)).toString());
}

/** The customer's tier at `at`: a held tier while it lasts, else by their spend in 12 months. */
export async function customerTier(
  db: Db,
  input: { companyId: string; customerId: string; at: Date; settings: Pick<LoyaltySettings, "tiers"> },
): Promise<string | null> {
  const [customer, spend12m] = await Promise.all([
    db.customer.findUnique({ where: { id: input.customerId }, select: { tierHeld: true, tierHeldUntil: true } }),
    spendOverYear(db, input.companyId, input.customerId, input.at),
  ]);
  const held =
    customer?.tierHeld && customer.tierHeldUntil
      ? { name: customer.tierHeld, until: customer.tierHeldUntil.toISOString().slice(0, 10) }
      : null;
  return tierFor({ spend12m, settings: input.settings, held, today: todayIn(undefined, input.at) });
}

/** Holds the customer's row for the rest of the transaction, so two sales cannot spend the same points. */
export async function lockCustomer(tx: Prisma.TransactionClient, customerId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
}

/**
 * The spend, inside the sale's transaction: the customer's row locked, the
 * balance read under the lock and checked again, then `SPENT (−points)`
 * worth the discount the sale was given. Throws `LoyaltyRefusal` with the
 * till's sentence when the points are no longer there.
 */
export async function spendPoints(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    customer: { id: string; name: string };
    points: number;
    value: number;
    payable: number;
    saleId: string;
    actor: { id: string | null; name: string | null };
    settings: LoyaltySettings;
    at: Date;
  },
): Promise<void> {
  await lockCustomer(tx, input.customer.id);
  const held = await balance(tx, input.customer.id);
  const refusal = spendRefusal({
    enabled: input.settings.enabled,
    customer: { name: input.customer.name, balance: held },
    points: input.points,
    spendFrom: input.settings.spendFrom,
    pointValue: input.settings.pointValue,
    payable: input.payable,
  });
  if (refusal) throw new LoyaltyRefusal(refusal);
  await tx.retailPointsEntry.create({
    data: {
      companyId: input.companyId,
      customerId: input.customer.id,
      kind: "SPENT",
      points: -input.points,
      value: new Prisma.Decimal(input.value).toDecimalPlaces(2),
      saleId: input.saleId,
      actorId: input.actor.id,
      actorName: input.actor.name,
      createdAt: input.at,
    },
  });
}
