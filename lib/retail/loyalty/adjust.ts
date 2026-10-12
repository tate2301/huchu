import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { CustomerRefusal } from "@/lib/retail/customers/create";
import { NOT_A_TIER, RESTORE_FIRST } from "@/lib/retail/customers/update";
import { addMonths } from "@/lib/retail/vouchers/dates";
import { formatCount, todayIn } from "@/lib/workspace/format";

import { balance, lockCustomer, spendOverYear } from "./ledger";
import { loadLoyaltySettings, type LoyaltySettings } from "./settings";
import { LOYALTY_OFF, pointsValue } from "./spend";
import { tierFor } from "./tiers";

/**
 * Points and tiers by hand (CUS-04, W-47): add or take away points with a
 * reason, for one customer or many, and hold a tier for 12 months. Rows are
 * only appended; the customer's row is locked before the balance is read, so
 * a take-away and a spend at the till never both use the same points and the
 * balance never goes below zero.
 */

const WHOLE_POINTS = "A whole number of points, 1 or more.";
const SAY_WHAT_HAPPENED = "Say what happened.";

export const adjustInput = z.object({
  direction: z.enum(["ADD", "TAKE"]),
  points: z.coerce.number({ message: WHOLE_POINTS }).int(WHOLE_POINTS).min(1, WHOLE_POINTS).max(100000, WHOLE_POINTS),
  reason: z.enum(["MISSED_AT_TILL", "COMPLAINT", "BIRTHDAY", "CORRECTION"]),
  note: z.string({ message: SAY_WHAT_HAPPENED }).trim().min(1, SAY_WHAT_HAPPENED).max(300, SAY_WHAT_HAPPENED),
});
export type AdjustInput = z.infer<typeof adjustInput>;

const ids = z.array(z.string().uuid()).min(1, "Tick at least one customer.").max(500, "Pick up to 500 customers at a time.");
export const adjustManyInput = adjustInput.extend({ ids });
export const tierInput = z.object({ ids, tier: z.string() });

/** The sheet's field each input lands in. */
const FIELD: Record<string, string> = { direction: "dir", points: "n", reason: "why", note: "note", ids: "ids", tier: "tier" };

/** A 400 naming every field the input got wrong, in the sheet's field ids. */
export function parseOrRefuse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = FIELD[String(issue.path[0] ?? "")] ?? String(issue.path[0] ?? "");
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  throw new CustomerRefusal(Object.values(fieldErrors)[0] ?? "Validation failed", 400, fieldErrors);
}

/** "Tapiwa Marange has 3,021 points. Take away no more than that." */
export const tooFewSentence = (name: string, held: number) =>
  `${name} has ${formatCount(Math.max(held, 0))} ${held === 1 ? "point" : "points"}. Take away no more than that.`;

/** One customer short of points for a take-away: the bulk run skips them. */
class TooFew extends CustomerRefusal {}

async function adjustOne(
  tx: Prisma.TransactionClient,
  actor: RetailAuditActor,
  customerId: string,
  input: AdjustInput,
  settings: LoyaltySettings,
  now: Date,
): Promise<{ entryId: string; balance: number; name: string }> {
  // The row first, so a spend at the till waits for this (and this for it).
  await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} AND "companyId" = ${actor.companyId} FOR UPDATE`;
  const customer = await tx.customer.findFirst({
    where: { id: customerId, companyId: actor.companyId },
    select: { name: true, archivedAt: true, mergedIntoId: true },
  });
  if (!customer) throw new CustomerRefusal("Customer not found", 404, {});
  if (customer.archivedAt || customer.mergedIntoId) throw new CustomerRefusal(RESTORE_FIRST, 409, {});

  const held = await balance(tx, customerId);
  if (input.direction === "TAKE" && input.points > held) {
    const sentence = tooFewSentence(customer.name, held);
    throw new TooFew(sentence, 409, { n: sentence });
  }
  const signed = input.direction === "TAKE" ? -input.points : input.points;
  const entry = await tx.retailPointsEntry.create({
    data: {
      companyId: actor.companyId,
      customerId,
      kind: "ADJUSTED",
      points: signed,
      value: new Prisma.Decimal(pointsValue(input.points, settings.pointValue)).toDecimalPlaces(2),
      reason: input.reason,
      note: input.note,
      actorId: actor.userId,
      actorName: actor.userName,
      createdAt: now,
    },
    select: { id: true },
  });
  const after = held + signed;
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.pointsAdjusted,
    entityType: "Customer",
    entityId: customerId,
    payload: { direction: input.direction, points: input.points, reason: input.reason, note: input.note, balance: after },
  });
  return { entryId: entry.id, balance: after, name: customer.name };
}

async function enabledSettings(companyId: string, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<LoyaltySettings> {
  const settings = await loadLoyaltySettings(companyId, db);
  if (!settings.enabled) throw new CustomerRefusal(LOYALTY_OFF, 409, {});
  return settings;
}

/** One customer's points, in the caller's transaction: `ADJUSTED (±points)` and its audit. */
export async function adjustPoints(
  tx: Prisma.TransactionClient,
  actor: RetailAuditActor,
  customerId: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<{ entryId: string; balance: number }> {
  const input = parseOrRefuse(adjustInput, raw);
  const settings = await enabledSettings(actor.companyId, tx);
  const { entryId, balance: after } = await adjustOne(tx, actor, customerId, input, settings, now);
  return { entryId, balance: after };
}

/**
 * The same for many customers, each in a transaction of its own. A take-away
 * skips anyone with too few points and names them; a binned or unknown
 * customer is skipped too.
 */
export async function adjustMany(
  actor: RetailAuditActor,
  raw: unknown,
  now: Date = new Date(),
): Promise<{ done: number; skipped: Array<{ id: string; name: string }> }> {
  const { ids: customerIds, ...input } = parseOrRefuse(adjustManyInput, raw);
  const settings = await enabledSettings(actor.companyId);
  let done = 0;
  const skipped: Array<{ id: string; name: string }> = [];
  for (const id of new Set(customerIds)) {
    try {
      await prisma.$transaction((tx) => adjustOne(tx, actor, id, input, settings, now));
      done += 1;
    } catch (error) {
      if (!(error instanceof CustomerRefusal)) throw error;
      if (error instanceof TooFew) {
        const customer = await prisma.customer.findUnique({ where: { id }, select: { name: true } });
        skipped.push({ id, name: customer?.name ?? "A customer" });
      }
    }
  }
  return { done, skipped };
}

/**
 * Hold a tier for many customers (CUS-04): the tier their spend already gives
 * lets any hold go; any other is held until 12 months from today. One
 * `RETAIL_CUSTOMER.TIER_SET { tier, until }` for each customer it changes.
 */
export async function setTiers(
  actor: RetailAuditActor,
  raw: unknown,
  now: Date = new Date(),
): Promise<{ count: number; until: string }> {
  const { ids: customerIds, tier: typed } = parseOrRefuse(tierInput, raw);
  const settings = await loadLoyaltySettings(actor.companyId);
  const tier = typed.trim();
  if (!settings.tiers.some((entry) => entry.name === tier)) throw new CustomerRefusal(NOT_A_TIER, 400, { tier: NOT_A_TIER });
  const today = todayIn(undefined, now);
  const until = addMonths(today, 12);

  let count = 0;
  for (const id of new Set(customerIds)) {
    const changed = await prisma.$transaction(async (tx) => {
      await lockCustomer(tx, id);
      const customer = await tx.customer.findFirst({
        where: { id, companyId: actor.companyId, archivedAt: null, mergedIntoId: null },
        select: { tierHeld: true, tierHeldUntil: true },
      });
      if (!customer) return false;
      const spend12m = await spendOverYear(tx, actor.companyId, id, now);
      const bySpend = tierFor({ spend12m, settings, held: null, today });
      const heldUntil = customer.tierHeldUntil ? customer.tierHeldUntil.toISOString().slice(0, 10) : null;
      const next = tier === bySpend ? { tierHeld: null, until: null } : { tierHeld: tier, until };
      if (customer.tierHeld === next.tierHeld && heldUntil === next.until) return true;
      await tx.customer.update({
        where: { id },
        data: { tierHeld: next.tierHeld, tierHeldUntil: next.until ? new Date(`${next.until}T00:00:00Z`) : null },
      });
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.customerTierSet,
        entityType: "Customer",
        entityId: id,
        payload: { tier, until: next.until },
      });
      return true;
    });
    if (changed) count += 1;
  }
  return { count, until };
}
