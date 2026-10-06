import { randomInt } from "node:crypto";

import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import { isObviousTillPin, tillPinDenial } from "@/lib/retail/till-pin";

import { fieldRefusal } from "./refusal";

/**
 * Till PINs are issued, not chosen (80-admin Decisions 4): the owner or a
 * manager sends one, at random (or typed by the owner in onboarding), and the
 * person picks their own the first time they use it (`mustChange`). Issuing
 * clears any lock. The digits leave the server only in the WhatsApp message,
 * or to the person who issued them when that could not send.
 */

/** Four random digits a person behind the counter would not try first. */
export function randomTillPin(draw: (max: number) => number = randomInt): string {
  for (;;) {
    const pin = String(draw(10_000)).padStart(4, "0");
    if (!isObviousTillPin(pin)) return pin;
  }
}

/**
 * Give a person a new PIN inside the caller's transaction: random unless
 * `typed` (onboarding), bcrypt cost 10, must be changed, no failed tries, no
 * lock. Returns the digits for the message.
 */
export async function issueTillPin(
  tx: Prisma.TransactionClient,
  input: { companyId: string; userId: string; issuedById: string; typed?: string | null; now?: Date },
): Promise<string> {
  let pin = randomTillPin();
  if (input.typed) {
    const denial = tillPinDenial(input.typed);
    if (denial) throw fieldRefusal({ pin: denial });
    pin = input.typed;
  }
  const pinHash = await bcrypt.hash(pin, 10);
  const issued = {
    pinHash,
    failedAttempts: 0,
    lockedAt: null,
    mustChange: true,
    issuedById: input.issuedById,
    issuedAt: input.now ?? new Date(),
  };
  await tx.retailTillPin.upsert({
    where: { userId: input.userId },
    update: { companyId: input.companyId, ...issued },
    create: { companyId: input.companyId, userId: input.userId, ...issued },
  });
  return pin;
}
