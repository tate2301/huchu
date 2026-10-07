import { createHash, randomInt } from "node:crypto";

import type { Prisma, PrismaClient, RetailPairingPurpose } from "@prisma/client";

import { planLimitSentence } from "@/lib/retail/till-words";

/**
 * Pairing codes (10-setup W-04 step 3, W-76): six random digits a manager
 * makes for one till, good once, for 10 minutes. Only
 * `sha256(companyId + ":" + code)` is stored, so the database never holds a
 * code anyone could type. A new code for a till expires its older unused
 * ones, and no two live codes of one company are the same.
 *
 * The plan sets how many tills may be paired at once
 * (`SubscriptionPlan.maxTills`, C-07); `checkTillRoom` refuses one more.
 */

export const PAIRING_TTL_MS = 10 * 60 * 1000;

export type PairingPurpose = RetailPairingPurpose;
export type PairingState = "waiting" | "paired" | "expired";

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

/** A refusal with its HTTP status, its sentence, and the field or rule it broke. */
export class PairingRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly opts: {
      field?: string;
      code?: "PLAN_LIMIT" | "SHIFT_OPEN" | "TILL_USED" | "PAIRED" | "NOT_PAIRED" | "NO_SITE";
    } = {},
  ) {
    super(message);
    this.name = "PairingRefusal";
  }
}

/** Six digits, leading noughts kept: "048217". */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(companyId: string, code: string): string {
  return createHash("sha256").update(`${companyId}:${code}`).digest("hex");
}

/** The shop's plan and how many tills are paired now; null when it has no plan. */
export async function tillRoom(
  tx: Db,
  companyId: string,
): Promise<{ plan: string; maxTills: number | null; paired: number } | null> {
  const [subscription, paired] = await Promise.all([
    tx.companySubscription.findFirst({
      where: { companyId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      orderBy: { createdAt: "desc" },
      select: { plan: { select: { name: true, maxTills: true } } },
    }),
    tx.retailDevice.count({ where: { companyId, unpairedAt: null } }),
  ]);
  if (!subscription) return null;
  return { plan: subscription.plan.name, maxTills: subscription.plan.maxTills, paired };
}

/** 409 PLAN_LIMIT when one more paired till would pass the plan's limit. */
export async function checkTillRoom(tx: Db, companyId: string): Promise<void> {
  const room = await tillRoom(tx, companyId);
  if (room && room.maxTills !== null && room.paired >= room.maxTills) {
    throw new PairingRefusal(409, planLimitSentence(room.plan, room.maxTills), { code: "PLAN_LIMIT" });
  }
}

/**
 * Issue a code for a till: its older unused codes stop now, and the new one
 * is unique among the company's live codes. The caller checks the plan
 * (`checkTillRoom`) before a `PAIR` code; a `REPLACE` code swaps one paired
 * device for another, so the count stays.
 */
export async function issuePairingCode(
  tx: Tx,
  input: { companyId: string; registerId: string; purpose: PairingPurpose; createdById: string },
  now: Date = new Date(),
): Promise<{ code: string; expiresAt: Date }> {
  await expirePairingCodes(tx, input.registerId, now);
  for (;;) {
    const code = generateCode();
    const codeHash = hashCode(input.companyId, code);
    const clash = await tx.retailPairingCode.findFirst({
      where: { companyId: input.companyId, codeHash, usedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    });
    if (clash) continue;
    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
    await tx.retailPairingCode.create({
      data: {
        companyId: input.companyId,
        registerId: input.registerId,
        purpose: input.purpose,
        codeHash,
        expiresAt,
        createdById: input.createdById,
      },
    });
    return { code, expiresAt };
  }
}

/** The till's live code stops now (Cancel, unpair, a new code). Returns how many. */
export async function expirePairingCodes(db: Db, registerId: string, now: Date = new Date()): Promise<number> {
  const result = await db.retailPairingCode.updateMany({
    where: { registerId, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
  return result.count;
}

/**
 * Where the till's latest code stands: used → paired; live → waiting; else
 * expired. A till with no code at all is paired when it has a device.
 */
export async function pairingState(
  db: Db,
  registerId: string,
  now: Date = new Date(),
): Promise<{ state: PairingState; expiresAt: Date | null }> {
  const latest = await db.retailPairingCode.findFirst({
    where: { registerId },
    orderBy: { createdAt: "desc" },
    select: { usedAt: true, expiresAt: true },
  });
  if (!latest) {
    const device = await db.retailDevice.findFirst({ where: { registerId, unpairedAt: null }, select: { id: true } });
    return { state: device ? "paired" : "expired", expiresAt: null };
  }
  if (latest.usedAt) return { state: "paired", expiresAt: latest.expiresAt };
  return { state: latest.expiresAt.getTime() > now.getTime() ? "waiting" : "expired", expiresAt: latest.expiresAt };
}
