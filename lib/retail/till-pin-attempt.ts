import { NotificationEntityType, NotificationSeverity, NotificationType } from "@prisma/client";
import bcrypt from "bcryptjs";

import { emitRetailNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent } from "@/lib/retail/audit";
import { TILL_PIN_LOCKED, TILL_PIN_MAX_ATTEMPTS, tillPinDenial, type TillPinDecision } from "@/lib/retail/till-pin";
import { DEFAULT_TIME_ZONE, formatTime } from "@/lib/workspace/format";

/**
 * One typed till PIN, checked against the person's `RetailTillPin` with the
 * lockout of ADM-03 (80-admin 5.14). Every place a PIN is typed comes here:
 * "Who is selling?" (the `till-pin` sign-in), the till's unlock, a manager
 * approving (`verifyManagerPin`), and Change my PIN.
 *
 * A locked PIN is refused before bcrypt runs. The fifth wrong PIN in a row
 * locks it — `lockedAt`, a `RETAIL_PIN.LOCKED` event on the chain, and the
 * `RETAIL_PIN_LOCKED` notification to the owners and the managers who see
 * the person's sites — and it stays locked until somebody sends a new one.
 *
 * The counter is written with the shared client, never a caller's
 * transaction: a wrong PIN that rolls an act back must still count. Each try
 * claims its place in the count before bcrypt runs (one conditional UPDATE),
 * so tries sent in parallel add up instead of overwriting each other.
 */

/** The same cost factor issued PINs are hashed at (`lib/retail/people/pins.ts`). */
const PIN_HASH_ROUNDS = 10;

/**
 * Where the PIN was typed: at a till — its register, or the paired device that
 * names it — or, with neither, in the admin. The till's name is read only when
 * the PIN locks, for the event and the notification.
 */
export type PinPlace = { registerId?: string | null; deviceId?: string | null };

export type TillPinCheck =
  | { decision: "NO_PIN" }
  | { decision: TillPinDecision; attemptsRemaining: number; mustChange: boolean };

export async function checkTillPin(input: {
  companyId: string;
  userId: string;
  pin: string;
  place: PinPlace;
  /** A sign-in or unlock (the till opens): stamps `lastUnlockedAt`. An approval does not. */
  opens: boolean;
  now?: Date;
}): Promise<TillPinCheck> {
  const now = input.now ?? new Date();
  const record = await prisma.retailTillPin.findFirst({
    where: { companyId: input.companyId, userId: input.userId },
    select: { id: true, pinHash: true, mustChange: true },
  });
  if (!record) return { decision: "NO_PIN" };

  // Claim one of the five tries before comparing, in one statement: the
  // counter goes up only while the PIN is unlocked with tries left, so tries
  // sent at once each take their own and no more than five are ever compared.
  const claimed = await prisma.$queryRaw<{ failedAttempts: number }[]>`
    UPDATE "RetailTillPin"
       SET "failedAttempts" = "failedAttempts" + 1
     WHERE "id" = ${record.id} AND "lockedAt" IS NULL AND "failedAttempts" < ${TILL_PIN_MAX_ATTEMPTS}
     RETURNING "failedAttempts"`;
  const attempt = claimed[0]?.failedAttempts;
  // Locked, or the last tries are being compared right now: refused without comparing.
  if (attempt === undefined) return { decision: "LOCKED", attemptsRemaining: 0, mustChange: record.mustChange };

  if (await bcrypt.compare(input.pin, record.pinHash)) {
    await prisma.retailTillPin.update({
      where: { id: record.id },
      data: { failedAttempts: 0, ...(input.opens ? { lastUnlockedAt: now } : {}) },
      select: { id: true },
    });
    return { decision: "ACCEPTED", attemptsRemaining: TILL_PIN_MAX_ATTEMPTS, mustChange: record.mustChange };
  }

  if (attempt < TILL_PIN_MAX_ATTEMPTS) {
    return { decision: "REJECTED", attemptsRemaining: TILL_PIN_MAX_ATTEMPTS - attempt, mustChange: record.mustChange };
  }

  // The fifth wrong try. Only the attempt that finds it unlocked locks it, so it writes one event.
  const locked = await prisma.retailTillPin.updateMany({
    where: { id: record.id, lockedAt: null },
    data: { failedAttempts: TILL_PIN_MAX_ATTEMPTS, lockedAt: now },
  });
  if (locked.count > 0) await announceLock({ companyId: input.companyId, userId: input.userId, place: input.place, at: now });
  return { decision: "REJECTED_NOW_LOCKED", attemptsRemaining: 0, mustChange: record.mustChange };
}

/** "Farai Moyo’s PIN is locked" / "Five wrong tries at Back till, 08:12. Send a new PIN from People." */
export function pinLockedWords(input: { name: string; registerName: string | null; at: Date; timeZone?: string }) {
  const time = formatTime(input.at, input.timeZone ?? DEFAULT_TIME_ZONE);
  const where = input.registerName ? ` at ${input.registerName}` : "";
  return {
    title: `${input.name}’s PIN is locked`,
    summary: `Five wrong tries${where}, ${time}. Send a new PIN from People.`,
  };
}

/** The owners, and the managers who work at one of the person's sites (or every site). */
async function lockRecipients(companyId: string, person: { allSites: boolean; siteIds: string[] }): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      companyId,
      isActive: true,
      OR: [
        { role: "SUPERADMIN" },
        {
          role: { in: ["MANAGER", "SHOP_MANAGER"] },
          ...(person.allSites ? {} : { OR: [{ allSites: true }, { siteAccess: { some: { siteId: { in: person.siteIds } } } }] }),
        },
      ],
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function announceLock(input: { companyId: string; userId: string; place: PinPlace; at: Date }): Promise<void> {
  const person = await prisma.user.findFirst({
    where: { id: input.userId, companyId: input.companyId },
    select: { id: true, name: true, role: true, allSites: true, siteAccess: { select: { siteId: true } } },
  });
  if (!person) return;
  const name = person.name ?? "";
  const registerName = await tillNameOf(input.companyId, input.place);
  await writeRetailAuditEvent(prisma, {
    actor: { companyId: input.companyId, userId: person.id, userName: name, userRole: person.role },
    eventType: RETAIL_AUDIT_EVENTS.pinLocked,
    entityType: "User",
    entityId: person.id,
    payload: { registerName, source: input.place.registerId || input.place.deviceId ? "TILL" : "ADMIN" },
  });
  const words = pinLockedWords({ name, registerName, at: input.at });
  await emitRetailNotification({
    companyId: input.companyId,
    recipientIds: await lockRecipients(input.companyId, {
      allSites: person.allSites,
      siteIds: person.siteAccess.map((row) => row.siteId),
    }),
    type: NotificationType.RETAIL_PIN_LOCKED,
    title: words.title,
    summary: words.summary,
    entityType: NotificationEntityType.RETAIL_PERSON,
    entityId: person.id,
    viewPath: `/retail/manage/people?sheet=person&id=${person.id}`,
    severity: NotificationSeverity.WARNING,
  });
}

/** The name of the till a PIN was typed at, from its register or its paired device. */
async function tillNameOf(companyId: string, place: PinPlace): Promise<string | null> {
  if (place.registerId) {
    const till = await prisma.retailRegister.findFirst({ where: { id: place.registerId, companyId }, select: { name: true } });
    return till?.name ?? null;
  }
  if (place.deviceId) {
    const device = await prisma.retailDevice.findFirst({
      where: { id: place.deviceId, companyId },
      select: { register: { select: { name: true } } },
    });
    return device?.register.name ?? null;
  }
  return null;
}

/* ── Choosing your own PIN (POST /api/v2/retail/pos/pin/change) ───────────── */

export const CURRENT_PIN_WRONG = "That PIN is not right.";
export const PIN_SAME_AS_SENT = "Pick a PIN that is not the one you were sent.";
export const NO_PIN_TO_CHANGE = "You have no till PIN yet. Ask a manager to send you one.";

/** A PIN change refused: under a field (400), locked (423), or nothing to change (409). */
export class TillPinRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 423,
    readonly field: "currentPin" | "newPin" | null = null,
  ) {
    super(message);
    this.name = "TillPinRefused";
  }
}

/**
 * A person chooses their own PIN (80-admin 5.14). The new one must pass
 * `tillPinDenial` and, in place of an issued one, differ from it. The
 * current PIN is asked — with the lockout — unless the session was opened by
 * the issued PIN that must change (`pinMustChange`) and it still must. The new
 * PIN is theirs: `mustChange` off, the counter cleared, `issuedById` null, and
 * `RETAIL_PERSON.PIN_CHOSEN` on the chain.
 */
export async function chooseTillPin(input: {
  companyId: string;
  userId: string;
  userName: string | null;
  userRole: string | null;
  currentPin?: string | null;
  newPin: string;
  /** The session's `pinMustChange` claim. */
  openedByIssuedPin: boolean;
  place: PinPlace;
  now?: Date;
}): Promise<{ mustChange: false }> {
  const now = input.now ?? new Date();
  const record = await prisma.retailTillPin.findFirst({
    where: { companyId: input.companyId, userId: input.userId },
    select: { id: true, pinHash: true, lockedAt: true, mustChange: true },
  });
  if (!record) throw new TillPinRefused(NO_PIN_TO_CHANGE, 409);
  if (record.lockedAt) throw new TillPinRefused(TILL_PIN_LOCKED, 423);

  const denial = tillPinDenial(input.newPin);
  if (denial) throw new TillPinRefused(denial, 400, "newPin");

  if (!(input.openedByIssuedPin && record.mustChange)) {
    if (!input.currentPin) throw new TillPinRefused(CURRENT_PIN_WRONG, 400, "currentPin");
    const checked = await checkTillPin({
      companyId: input.companyId,
      userId: input.userId,
      pin: input.currentPin,
      place: input.place,
      opens: false,
      now,
    });
    if (checked.decision === "LOCKED" || checked.decision === "REJECTED_NOW_LOCKED") throw new TillPinRefused(TILL_PIN_LOCKED, 423);
    if (checked.decision !== "ACCEPTED") throw new TillPinRefused(CURRENT_PIN_WRONG, 400, "currentPin");
  }
  if (record.mustChange && (await bcrypt.compare(input.newPin, record.pinHash))) {
    throw new TillPinRefused(PIN_SAME_AS_SENT, 400, "newPin");
  }

  const pinHash = await bcrypt.hash(input.newPin, PIN_HASH_ROUNDS);
  await prisma.$transaction(async (tx) => {
    await tx.retailTillPin.update({
      where: { id: record.id },
      data: { pinHash, mustChange: false, failedAttempts: 0, lockedAt: null, issuedById: null, issuedAt: now },
    });
    await writeRetailAuditEvent(tx, {
      actor: { companyId: input.companyId, userId: input.userId, userName: input.userName, userRole: input.userRole },
      eventType: RETAIL_AUDIT_EVENTS.pinChosen,
      entityType: "User",
      entityId: input.userId,
      payload: {},
    });
  });
  return { mustChange: false };
}
