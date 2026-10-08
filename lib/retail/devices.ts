import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { markActivityFailed } from "@/lib/activity/context";
import { errorResponse } from "@/lib/api-response";
import { getHostHeaderFromRequestHeaders, resolveTenantFromHost } from "@/lib/platform/tenant";
import { peekIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent } from "@/lib/retail/audit";
import {
  DEVICE_COOKIE,
  UNPAIRED_REVIEW_REASON,
  alreadyATillSentence,
  badCodeSentence,
  deviceKindFromShell,
  deviceLabelFromUserAgent,
  lockedSentence,
  pairedFootnote,
  personChip,
  pinOutcomeSentence,
  shiftOnOtherTillSentence,
  unpairedSaleVerdict,
  type UnpairReason,
} from "@/lib/retail/device-words";
import { tillFiscal } from "@/lib/retail/fiscal-settings";
import { PAIRING_TTL_MS, PairingRefusal, checkTillRoom, hashCode } from "@/lib/retail/pairing";
import { tillPayments, type TillTender } from "@/lib/retail/payment-settings";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { receiptWire } from "@/lib/retail/receipt-settings";
import type { ReceiptWire } from "@/lib/retail/receipt-words";
import type { LicenceWindow } from "@/lib/retail/licence-hours";
import { loadShopProfile } from "@/lib/retail/shop-profile";
import { shopFeatures, type ShopProfile } from "@/lib/retail/shop-profile-rules";
import { loadLicenceHours } from "@/lib/retail/site-licence-hours";
import { cashUpSignOff, type SignOff } from "@/lib/retail/sign-off";
import { loadTillRules, tillRulesForTill, type TillRulesForTill } from "@/lib/retail/till-rules";
import { checkTillPin, type PinPlace } from "@/lib/retail/till-pin-attempt";
import { deviceWords, type DeviceKind } from "@/lib/retail/till-words";

/**
 * The device side of a till (10-setup W-04 steps 5–8, W-76, 4.4).
 *
 * A device proves which till it is with a key: 32 random bytes in the
 * httpOnly `tender_device` cookie on the POS host, of which the server keeps
 * only the sha256 (`RetailDevice.keyHash`). People say who they are with a
 * PIN or a password. Every POS route asks `requirePosDevice` for the device
 * first; a device that was unpaired gets 401 DEVICE_UNPAIRED at its next
 * request and shows /unpaired.
 */

/** sha256 of a device key: what `RetailDevice.keyHash` holds. */
export const hashDeviceKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** A new device key, base64url, for the cookie only. */
export const newDeviceKey = () => randomBytes(32).toString("base64url");

/** A new id for an unpaired device's `tender_install` cookie. */
export const newInstallId = () => randomUUID();

/** Last seen is written at most this often. */
const SEEN_EVERY_MS = 60 * 1000;

const deviceSelect = {
  id: true,
  companyId: true,
  registerId: true,
  kind: true,
  label: true,
  appVersion: true,
  lastSeenAt: true,
  pairedAt: true,
  unpairedAt: true,
  unpairReason: true,
  pairedBy: { select: { name: true } },
  unpairedBy: { select: { name: true } },
  register: {
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
      hasPrinter: true,
      hasDrawer: true,
      hasScale: true,
      priceListId: true,
      site: { select: { id: true, name: true, priceListId: true } },
    },
  },
} satisfies Prisma.RetailDeviceSelect;

export type PosDevice = Prisma.RetailDeviceGetPayload<{ select: typeof deviceSelect }>;

/** The device whose key this is, paired or not; null for a key nobody issued. */
export async function findDeviceByKey(key: string | null | undefined): Promise<PosDevice | null> {
  if (!key) return null;
  return prisma.retailDevice.findUnique({ where: { keyHash: hashDeviceKey(key) }, select: deviceSelect });
}

/** A device that is one of the shop's tills now: paired, on a till that is still open. */
export const isLiveTill = (device: PosDevice | null): device is PosDevice =>
  Boolean(device && !device.unpairedAt && device.register.isActive);

/** The device behind a request's cookie. */
export function deviceOfRequest(request: NextRequest): Promise<PosDevice | null> {
  return findDeviceByKey(request.cookies.get(DEVICE_COOKIE)?.value);
}

/**
 * Where a PIN typed on this host is typed, for the lock's words (ADM-03): the
 * till a `till-pin` session was opened at, else the shop's device paired on
 * this host (a password session at the till), else nowhere (the admin).
 */
export async function pinPlaceOf(
  request: NextRequest,
  session: { user: { companyId: string; registerId?: string | null } },
): Promise<PinPlace> {
  if (session.user.registerId) return { registerId: session.user.registerId };
  const device = await deviceOfRequest(request);
  return device && device.companyId === session.user.companyId ? { registerId: device.registerId } : {};
}

/** What a 401 DEVICE_UNPAIRED carries, and what /unpaired shows. */
export type UnpairedFacts = {
  by: string;
  at: string;
  reason: UnpairReason;
  tillName: string;
  deviceLabel: string;
};

export function unpairedFacts(device: PosDevice): UnpairedFacts {
  return {
    by: device.unpairedBy?.name ?? "",
    at: (device.unpairedAt ?? new Date()).toISOString(),
    reason: (device.unpairReason ?? "UNPAIRED") as UnpairReason,
    tillName: device.register.name,
    deviceLabel: deviceWords(device),
  };
}

type DeviceSession = { user: { companyId: string } };

function refuse(status: number, body: Record<string, unknown>): NextResponse {
  markActivityFailed();
  return NextResponse.json(body, { status });
}

export const NOT_A_TILL = "This device is not a till. Pair it from Management › Tills and devices.";

/**
 * The device this POS request comes from. No device key, a key nobody
 * issued, another shop's device, or a paired device whose till was closed
 * → 409 NOT_A_TILL. Unpaired → 401 DEVICE_UNPAIRED with who, when and why —
 * unless `allowUnpaired`, which only `pos/sales` asks for, so the device can
 * send in what it sold before it was told. Records that the device was seen
 * (at most once a minute) and the version its shell reports.
 */
export async function requirePosDevice(
  request: NextRequest,
  session: DeviceSession,
  options: { allowUnpaired?: boolean } = {},
): Promise<{ device: PosDevice; response: null } | { device: null; response: NextResponse }> {
  const device = await deviceOfRequest(request);
  if (!device || device.companyId !== session.user.companyId || (!device.unpairedAt && !device.register.isActive)) {
    return { device: null, response: refuse(409, { error: NOT_A_TILL, code: "NOT_A_TILL" }) };
  }
  if (device.unpairedAt && !options.allowUnpaired) {
    const facts = unpairedFacts(device);
    return {
      device: null,
      response: refuse(401, { error: "This device is no longer a till.", code: "DEVICE_UNPAIRED", ...facts }),
    };
  }
  if (!device.unpairedAt) await noteSeen(device, request.headers.get("x-tender-version"));
  return { device, response: null };
}

/**
 * A till acts only on its own shifts: closing, or moving cash on, a shift that
 * is on another till is refused 409 "That shift is on {till}.". A shift that
 * is not the shop's is left for the handler's own 404.
 */
export async function refuseShiftElsewhere(device: PosDevice, shiftId: string): Promise<NextResponse | null> {
  const shift = await prisma.retailShift.findFirst({
    where: { id: shiftId, companyId: device.companyId },
    select: { registerId: true, register: { select: { name: true } } },
  });
  if (!shift || shift.registerId === device.registerId) return null;
  return refuse(409, { error: shiftOnOtherTillSentence(shift.register.name), code: "SHIFT_ELSEWHERE" });
}

/**
 * A sale from a device that may have been unpaired since (W-76): from a paired
 * device it simply goes in; from an unpaired one only an offline sale rung
 * before the unpairing goes in, flagged for a manager (`reviewReason`). Anything
 * else is refused with the 401 the device turns into /unpaired.
 */
export function unpairedSaleGate(
  device: PosDevice,
  offlineSoldAt: Date | null,
): { reviewReason: string | null; response: null } | { reviewReason: null; response: NextResponse } {
  const verdict = unpairedSaleVerdict({ unpairedAt: device.unpairedAt, soldAt: offlineSoldAt ?? new Date() });
  if (verdict === "accept") return { reviewReason: null, response: null };
  if (verdict === "flag" && offlineSoldAt) return { reviewReason: UNPAIRED_REVIEW_REASON, response: null };
  return {
    reviewReason: null,
    response: refuse(401, { error: "This device is no longer a till.", code: "DEVICE_UNPAIRED", ...unpairedFacts(device) }),
  };
}

/**
 * How many sales this device sent in after it was unpaired: the offline sales
 * it held, which came in flagged (W-76). What /unpaired counts, from the
 * database rather than from the device's word.
 */
export async function salesSentAfterUnpairing(device: PosDevice): Promise<number> {
  if (!device.unpairedAt) return 0;
  return prisma.retailSale.count({
    where: {
      companyId: device.companyId,
      deviceId: device.id,
      reviewReason: UNPAIRED_REVIEW_REASON,
      createdAt: { gte: device.unpairedAt },
    },
  });
}

/** What /unpaired says (board NoLonger), all of it read from the database. */
export type NoLongerFacts = {
  till: string;
  reason: UnpairReason;
  /** Who unpaired it, or made the code that replaced it. */
  by: string | null;
  at: string;
  /** Sales this device held offline that came in after it was unpaired. */
  sent: number;
  /** REPLACED: the device that took its place, and who paired it when. */
  replacement: { kind: DeviceKind; label: string | null; by: string | null; at: string } | null;
  /** REPLACED while a shift was open on the till, and it still is: whose. */
  shift: { cashier: string } | null;
};

/**
 * Everything /unpaired shows: who unpaired this device and when, how many of
 * its offline sales came in since, and when it was replaced, the device that
 * took the till over and the shift that carried on there.
 */
export async function noLongerFacts(device: PosDevice): Promise<NoLongerFacts | null> {
  const unpairedAt = device.unpairedAt;
  if (!unpairedAt) return null;
  const reason = (device.unpairReason ?? "UNPAIRED") as UnpairReason;
  const replaced = reason === "REPLACED";
  const [sent, replacement, shift] = await Promise.all([
    salesSentAfterUnpairing(device),
    replaced
      ? prisma.retailDevice.findFirst({
          where: { companyId: device.companyId, registerId: device.registerId, id: { not: device.id }, pairedAt: { gte: unpairedAt } },
          orderBy: { pairedAt: "asc" },
          select: { kind: true, label: true, pairedAt: true, pairedBy: { select: { name: true } } },
        })
      : null,
    replaced
      ? prisma.retailShift.findFirst({
          where: { companyId: device.companyId, registerId: device.registerId, status: "OPEN", openedAt: { lte: unpairedAt } },
          orderBy: { openedAt: "desc" },
          select: { cashierName: true },
        })
      : null,
  ]);
  return {
    till: device.register.name,
    reason,
    by: device.unpairedBy?.name || null,
    at: unpairedAt.toISOString(),
    sent,
    replacement: replacement
      ? { kind: replacement.kind, label: replacement.label, by: replacement.pairedBy.name || null, at: replacement.pairedAt.toISOString() }
      : null,
    shift: shift ? { cashier: shift.cashierName } : null,
  };
}

/** Last seen now (at most once a minute), and the shell's version when it says. */
export async function noteSeen(device: PosDevice, appVersion: string | null | undefined, now: Date = new Date()) {
  const version = appVersion?.trim().slice(0, 40) || null;
  const stale = !device.lastSeenAt || now.getTime() - device.lastSeenAt.getTime() >= SEEN_EVERY_MS;
  const newVersion = version !== null && version !== device.appVersion;
  if (!stale && !newVersion) return;
  await prisma.retailDevice.update({
    where: { id: device.id },
    data: { ...(stale ? { lastSeenAt: now } : {}), ...(newVersion ? { appVersion: version } : {}) },
    select: { id: true },
  });
}

/* ── Pair this device (W-04 step 6) ───────────────────────────────────────── */

export class PairRefusal extends Error {
  constructor(
    readonly status: 400 | 409 | 429,
    message: string,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PairRefusal";
  }
}

export type PairInput = {
  companyId: string;
  code: string;
  /** The `tender_install` cookie; null when the browser sent none. */
  installId: string | null;
  /** The caller's address from our own edge (`trustedClientAddress`). */
  address: string;
  /** The `tender_device` cookie, when the request carries one. */
  deviceKey: string | null;
  userAgent: string | null;
  /** `X-Tender-Shell`. */
  shell: string | null;
  /** `X-Tender-Version`. */
  appVersion: string | null;
};

/**
 * Wrong codes are counted against the caller (`RetailPairingThrottle.installId`
 * holds the key): per install and per address, five and the caller waits 15
 * minutes like a PIN. An install id is whatever the browser says and addresses
 * can be many, so the shop counts too, but it never stops pairing: every
 * twenty wrong codes at the shop end the codes alive at that moment. No code
 * faces more than twenty guesses, and a code made after that pairs as usual,
 * so guessing cannot keep a shop from pairing a till. Each count forgets wrong
 * codes once none has come for a lock's length (a code's life for the shop).
 */
export const PAIR_SHOP_MAX_WRONG = 20;
const SHOP_KEY = "shop";
const SHOP_WINDOW_MS = PAIRING_TTL_MS;

type ThrottleRow = { installId: string; failedAttempts: number; lockedUntil: Date | null; updatedAt: Date };
type ThrottleState = { failedAttempts: number; lockedUntil: Date | null };

/** Five wrong codes from one caller, then it waits this long. Unlike a PIN's lock, a pairing lock runs out. */
const PAIR_MAX_WRONG = 5;
const PAIR_LOCK_MS = 15 * 60 * 1000;

type PairGate = { decision: "LOCKED" | "OPEN" | "WRONG" | "NOW_LOCKED"; next: ThrottleState; attemptsRemaining: number };

/** One count's answer to a code: refused while locked; a wrong code counts, the fifth locks it for 15 minutes. */
function pairGate(state: ThrottleState, wrong: boolean, now: Date): PairGate {
  if (state.lockedUntil && state.lockedUntil.getTime() > now.getTime()) {
    return { decision: "LOCKED", next: state, attemptsRemaining: 0 };
  }
  const base = state.lockedUntil ? 0 : Math.max(0, state.failedAttempts);
  if (!wrong) return { decision: "OPEN", next: { failedAttempts: base, lockedUntil: null }, attemptsRemaining: PAIR_MAX_WRONG - base };
  const failedAttempts = base + 1;
  if (failedAttempts >= PAIR_MAX_WRONG) {
    return { decision: "NOW_LOCKED", next: { failedAttempts, lockedUntil: new Date(now.getTime() + PAIR_LOCK_MS) }, attemptsRemaining: 0 };
  }
  return { decision: "WRONG", next: { failedAttempts, lockedUntil: null }, attemptsRemaining: PAIR_MAX_WRONG - failedAttempts };
}

/** The caller's own counts: its install, when it sent one, and its address. */
function callerKeys(input: PairInput): string[] {
  return [...(input.installId ? [`install:${input.installId}`] : []), `ip:${input.address}`];
}

/** A row's count as it stands now: wrong codes stop counting once none has come for `windowMs`. */
function throttleState(row: ThrottleRow | undefined, windowMs: number, now: Date): ThrottleState {
  if (!row) return { failedAttempts: 0, lockedUntil: null };
  const stale = !row.lockedUntil && now.getTime() - row.updatedAt.getTime() > windowMs;
  return stale ? { failedAttempts: 0, lockedUntil: null } : { failedAttempts: row.failedAttempts, lockedUntil: row.lockedUntil };
}

const lockedRefusal = (lockedUntil: Date) =>
  new PairRefusal(429, lockedSentence(lockedUntil), { code: "LOCKED", lockedUntil: lockedUntil.toISOString() });

/**
 * One more wrong code at the shop. The twentieth ends every code alive and
 * starts the count again. The count goes up in the database, so wrong codes
 * sent at the same moment are all counted.
 */
async function countShopWrongCode(companyId: string, now: Date): Promise<void> {
  const where = { companyId_installId: { companyId, installId: SHOP_KEY } };
  const fresh = new Date(now.getTime() - SHOP_WINDOW_MS);
  const bumped = await prisma.retailPairingThrottle.updateMany({
    where: { companyId, installId: SHOP_KEY, updatedAt: { gte: fresh } },
    data: { failedAttempts: { increment: 1 } },
  });
  if (bumped.count === 0) {
    await prisma.retailPairingThrottle.upsert({
      where,
      create: { companyId, installId: SHOP_KEY, failedAttempts: 1 },
      update: { failedAttempts: 1, lockedUntil: null },
    });
  }
  const reached = await prisma.retailPairingThrottle.updateMany({
    where: { companyId, installId: SHOP_KEY, failedAttempts: { gte: PAIR_SHOP_MAX_WRONG } },
    data: { failedAttempts: 0 },
  });
  if (reached.count > 0) {
    await prisma.retailPairingCode.updateMany({
      where: { companyId, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
  }
}

/**
 * Redeem a pairing code. Five wrong codes from one install, or one address,
 * stop it for 15 minutes (429 LOCKED); a wrong one is 400 BAD_CODE with the
 * tries left, and twenty across the shop end its live codes. A device that is
 * already one of the shop's tills is refused (409): it is unpaired first. In
 * one transaction: the code is used; a REPLACE code unpairs the till's current
 * device (REPLACED, by whoever made the code); a PAIR code checks the plan;
 * the new device is made with the key's hash; audited. Returns the key for
 * the cookie, and the till and site.
 */
export async function pairDevice(
  input: PairInput,
  now: Date = new Date(),
): Promise<{ key: string; till: { id: string; name: string }; site: { id: string; name: string } }> {
  const already = await findDeviceByKey(input.deviceKey);
  if (already && already.companyId === input.companyId && isLiveTill(already)) {
    throw new PairRefusal(409, alreadyATillSentence(already.register.name), { code: "ALREADY_A_TILL" });
  }

  const keys = callerKeys(input);
  const rows: ThrottleRow[] = await prisma.retailPairingThrottle.findMany({
    where: { companyId: input.companyId, installId: { in: keys } },
    select: { installId: true, failedAttempts: true, lockedUntil: true, updatedAt: true },
  });
  const counted = keys.map((key) => ({
    key,
    state: throttleState(
      rows.find((row) => row.installId === key),
      PAIR_LOCK_MS,
      now,
    ),
  }));
  // Five and fifteen minutes, held on each count.
  const gates = counted.map((entry) => pairGate(entry.state, false, now));
  const lockedUntil = latestLock(counted.filter((_, index) => gates[index]!.decision === "LOCKED").map((entry) => entry.state.lockedUntil));
  if (lockedUntil) throw lockedRefusal(lockedUntil);
  const triesLeft = Math.min(...gates.map((gate) => gate.attemptsRemaining));

  const digits = input.code.replace(/\D/g, "");
  const live =
    digits.length === 6
      ? await prisma.retailPairingCode.findFirst({
          where: { companyId: input.companyId, codeHash: hashCode(input.companyId, digits), usedAt: null, expiresAt: { gt: now } },
          select: { id: true, registerId: true, purpose: true, createdById: true },
        })
      : null;

  if (!live) {
    const outcomes = counted.map((entry) => ({
      key: entry.key,
      outcome: pairGate(entry.state, true, now),
    }));
    await prisma.$transaction(
      outcomes.map(({ key, outcome }) =>
        prisma.retailPairingThrottle.upsert({
          where: { companyId_installId: { companyId: input.companyId, installId: key } },
          create: { companyId: input.companyId, installId: key, ...outcome.next },
          update: outcome.next,
        }),
      ),
    );
    await countShopWrongCode(input.companyId, now);
    const nowLocked = latestLock(
      outcomes.filter(({ outcome }) => outcome.decision === "NOW_LOCKED").map(({ outcome }) => outcome.next.lockedUntil),
    );
    if (nowLocked) throw lockedRefusal(nowLocked);
    const left = Math.min(...outcomes.map(({ outcome }) => outcome.attemptsRemaining));
    throw new PairRefusal(400, badCodeSentence(left), { code: "BAD_CODE", triesLeft: left });
  }

  const key = newDeviceKey();
  const kind: DeviceKind = deviceKindFromShell(input.shell);
  const label = kind === "BROWSER" ? deviceLabelFromUserAgent(input.userAgent) : null;
  const appVersion = input.appVersion?.trim().slice(0, 40) || null;

  const paired = await prisma.$transaction(async (tx) => {
    // Used once: a second redeem of the same code finds it gone.
    const claimed = await tx.retailPairingCode.updateMany({
      where: { id: live.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    // Someone redeemed it a moment ago.
    const taken = new PairRefusal(400, badCodeSentence(triesLeft), { code: "BAD_CODE", triesLeft });
    if (claimed.count === 0) throw taken;
    const till = await tx.retailRegister.findFirst({
      where: { id: live.registerId, companyId: input.companyId, isActive: true },
      select: { id: true, name: true, site: { select: { id: true, name: true } } },
    });
    if (!till) throw taken;
    const actor = await tx.user.findUnique({ where: { id: live.createdById }, select: { name: true, role: true } });
    const auditActor = { companyId: input.companyId, userId: live.createdById, userName: actor?.name ?? null, userRole: actor?.role ?? null };

    const current = await tx.retailDevice.findFirst({
      where: { registerId: till.id, unpairedAt: null },
      select: { id: true, kind: true, label: true },
    });
    if (current) {
      // A PAIR code on a till that paired meanwhile still replaces: the till has one device.
      await tx.retailDevice.update({
        where: { id: current.id },
        data: { unpairedAt: now, unpairedById: live.createdById, unpairReason: "REPLACED" },
      });
    } else {
      try {
        await checkTillRoom(tx, input.companyId);
      } catch (error) {
        if (error instanceof PairingRefusal) throw new PairRefusal(409, error.message, { code: "PLAN_LIMIT" });
        throw error;
      }
    }

    const device = await tx.retailDevice.create({
      data: {
        companyId: input.companyId,
        registerId: till.id,
        kind,
        label,
        keyHash: hashDeviceKey(key),
        appVersion,
        pairedAt: now,
        pairedById: live.createdById,
        lastSeenAt: now,
      },
      select: { id: true, kind: true, label: true },
    });
    await tx.retailPairingCode.update({ where: { id: live.id }, data: { deviceId: device.id } });
    // The caller's counts start again; the shop's is left to run out, since a right code does not excuse the wrong ones.
    await tx.retailPairingThrottle.deleteMany({ where: { companyId: input.companyId, installId: { in: keys } } });

    await writeRetailAuditEvent(tx, {
      actor: auditActor,
      eventType: RETAIL_AUDIT_EVENTS.devicePaired,
      entityType: "RetailRegister",
      entityId: till.id,
      payload: { name: till.name, device: deviceWords(device), deviceId: device.id, purpose: live.purpose },
    });
    if (current) {
      await writeRetailAuditEvent(tx, {
        actor: auditActor,
        eventType: RETAIL_AUDIT_EVENTS.deviceReplaced,
        entityType: "RetailRegister",
        entityId: till.id,
        payload: {
          name: till.name,
          from: deviceWords(current),
          fromDeviceId: current.id,
          to: deviceWords(device),
          toDeviceId: device.id,
        },
      });
    }
    return { till: { id: till.id, name: till.name }, site: till.site };
  });
  return { key, ...paired };
}

/** The latest of some locks, or null. */
function latestLock(locks: (Date | null)[]): Date | null {
  return locks.reduce<Date | null>((latest, lock) => (lock && (!latest || lock > latest) ? lock : latest), null);
}

/* ── What the till knows about itself (GET devices/me) ────────────────────── */

export type TillContext = {
  till: { id: string; name: string; code: string; hasPrinter: boolean; hasDrawer: boolean; hasScale: boolean };
  site: { id: string; name: string; places: number };
  device: { id: string; kind: DeviceKind; label: string; pairedAt: string; pairedBy: string; paired: string };
  /** What kind of shop: the till asks for ID and keeps licence hours on a liquor store. */
  shop: ShopProfile;
  /**
   * The site's licence hours, one window a weekday, while the shop keeps them
   * (else empty: alcohol sells all day). The till judges them offline too.
   */
  licenceHours: LicenceWindow[];
  /** The tenders the shop takes, in the order the payment screen shows them (SET-05). Anything off is not here. */
  tenders: TillTender[];
  /** Today's ZiG rate and how ZiG change rounds, while the shop takes ZiG cash and has a rate. */
  zig: { rate: string; setAt: string; rounding: string } | null;
  /**
   * How customers pay by EcoCash, so the till can tell them: the shop's
   * merchant code, the number to send money to, or the terminal at the counter
   * (nothing to say but the amount). `name` is "Shows customers as". Null when
   * the shop does not take EcoCash.
   */
  ecocash: {
    method: "MERCHANT_CODE" | "PHONE_NUMBER" | "TERMINAL";
    merchantCode: string | null;
    phone: string | null;
    name: string | null;
  } | null;
  /** The till rules (SET-06): the till asks first, the server checks them again. */
  rules: TillRulesForTill;
  /** What its receipts say (SET-07): the shop's top and bottom lines, numbers and copies. */
  receipt: ReceiptWire;
  /** The shop's fiscal device (SET-08): its ID once registered, the open day, and whether the till stops while ZIMRA is away. */
  fiscal: {
    deviceId: string | null;
    dayNo: number | null;
    /** "With the last shift": the shop's last open shift closing closes the day. */
    dayClose: "WITH_LAST_SHIFT" | "BY_HAND";
    whenUnreachable: "KEEP_SELLING" | "STOP_SELLING";
  };
  /** Who can approve with their PIN at this till: active staff with a till PIN who hold the approve right. */
  approvers: Array<{ userId: string; name: string }>;
  /** The till's own list, else the site's, else the shop's default; null when the shop has none. */
  priceListId: string | null;
  /** The number the next shift opened at this site will take ("SH-00244"): a forecast, not reserved. */
  nextShiftNo: string;
  /** Who signs the cash-up off: the site's shop manager, else the company's first manager by name; null when there is none. */
  signOff: SignOff | null;
};

export async function tillContext(device: PosDevice, now: Date = new Date()): Promise<TillContext> {
  const { register } = device;
  const [places, defaultList, shop, tillRules, payments, pins, receipt, fiscal, licenceHours, nextShiftNo, signOff] = await Promise.all([
    prisma.stockLocation.count({ where: { siteId: register.site.id, isActive: true } }),
    register.priceListId || register.site.priceListId
      ? Promise.resolve(null)
      : prisma.priceList.findFirst({ where: { companyId: device.companyId, isDefault: true, archivedAt: null }, select: { id: true } }),
    loadShopProfile(device.companyId),
    loadTillRules(device.companyId),
    tillPayments(device.companyId),
    prisma.retailTillPin.findMany({
      where: { companyId: device.companyId, user: { isActive: true, companyId: device.companyId } },
      select: { user: { select: { id: true, name: true, role: true } } },
    }),
    receiptWire(device.companyId, register.site.id),
    tillFiscal(device.companyId),
    loadLicenceHours(device.companyId, register.site.id),
    peekIdentifier(prisma, { companyId: device.companyId, entity: "RETAIL_SHIFT", siteId: register.site.id }),
    cashUpSignOff(device.companyId, register.site.id),
  ]);
  const pairedBy = device.pairedBy.name ?? "";
  return {
    till: {
      id: register.id,
      name: register.name,
      code: register.code,
      hasPrinter: register.hasPrinter,
      hasDrawer: register.hasDrawer,
      hasScale: register.hasScale,
    },
    site: { id: register.site.id, name: register.site.name, places },
    device: {
      id: device.id,
      kind: device.kind,
      label: deviceWords(device),
      pairedAt: device.pairedAt.toISOString(),
      pairedBy,
      paired: pairedFootnote(device.pairedAt, pairedBy, now),
    },
    shop,
    licenceHours: shopFeatures(shop).licenceHours ? licenceHours : [],
    tenders: payments.tenders,
    zig: payments.zig,
    ecocash: payments.ecocash,
    rules: tillRulesForTill(tillRules),
    receipt,
    fiscal,
    approvers: pins
      .filter((pin) => canRetailRoleDo(pin.user.role, "retail.sell", "approve"))
      .map((pin) => ({ userId: pin.user.id, name: pin.user.name ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    priceListId: register.priceListId ?? register.site.priceListId ?? defaultList?.id ?? null,
    nextShiftNo,
    signOff,
  };
}

/** The shop's default site if it is open, else its first open site; null when it has none. */
export async function shopSiteId(companyId: string): Promise<string | null> {
  const profile = await prisma.retailShopProfile.findUnique({ where: { companyId }, select: { defaultSiteId: true } });
  const sites = await prisma.site.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  return sites.find((site) => site.id === profile?.defaultSiteId)?.id ?? sites[0]?.id ?? null;
}

/* ── Who is selling? (GET devices/people) ─────────────────────────────────── */

export type TillPerson = {
  userId: string;
  /** "Chipo D.": a till shows short names, never an email or a role. */
  label: string;
  outcome: string;
  /** Five wrong PINs (ADM-03): locked until a manager sends a new one; their password still opens the till. */
  pinLocked: boolean;
  /** Their open shift, on this till (`here`) or on another one. */
  openShift: { shiftNo: string; here: boolean; till: string } | null;
};

/**
 * The people who may sell at this till: active staff of the shop whom the
 * till admits and the matrix lets sell, managers included, who hold a till
 * PIN (issued from People, ADM-02/03). Whoever has the shift open on this till comes first, then by
 * surname. `outcome` says what signing in will do here: open their shift,
 * carry it on, or send them to the till their shift is open on first.
 */
export async function tillPeople(device: PosDevice): Promise<TillPerson[]> {
  const pins = await prisma.retailTillPin.findMany({
    where: { companyId: device.companyId, user: { isActive: true, companyId: device.companyId } },
    select: { lockedAt: true, user: { select: { id: true, name: true, role: true } } },
  });
  const lockedIds = new Set(pins.filter((pin) => pin.lockedAt).map((pin) => pin.user.id));
  const sellers = pins
    .map((pin) => pin.user)
    .filter((user) => canAccessPosPortal(user.role) && canRetailRoleDo(user.role, "retail.sell", "create"));
  const open = await prisma.retailShift.findMany({
    where: { companyId: device.companyId, status: "OPEN", cashierId: { in: sellers.map((user) => user.id) } },
    orderBy: { openedAt: "desc" },
    select: { cashierId: true, shiftNo: true, registerId: true, registerName: true },
  });
  const shiftOf = new Map<string, (typeof open)[number]>();
  for (const shift of open) if (!shiftOf.has(shift.cashierId)) shiftOf.set(shift.cashierId, shift);
  const onThisTill = (userId: string) => shiftOf.get(userId)?.registerId === device.registerId;
  const surname = (name: string) => name.trim().split(/\s+/).at(-1)?.toLowerCase() ?? "";
  return sellers
    .sort(
      (a, b) =>
        Number(onThisTill(b.id)) - Number(onThisTill(a.id)) ||
        surname(a.name ?? "").localeCompare(surname(b.name ?? "")) ||
        (a.name ?? "").localeCompare(b.name ?? ""),
    )
    .map((user) => {
      const shift = shiftOf.get(user.id);
      return {
        userId: user.id,
        label: personChip(user.name ?? ""),
        outcome: pinOutcomeSentence(
          user.name ?? "",
          device.register.name,
          onThisTill(user.id) ? { onThisTill: true } : { onThisTill: false, elsewhere: shift?.registerName ?? null },
        ),
        pinLocked: lockedIds.has(user.id),
        openShift: shift ? { shiftNo: shift.shiftNo, here: onThisTill(user.id), till: shift.registerName } : null,
      };
    });
}

/* ── Messages (heartbeat, dismiss) ────────────────────────────────────────── */

export type TillMessage = { id: string; body: string; from: string; at: string };

/** The till's messages not yet dismissed, oldest first. */
export async function tillMessages(device: PosDevice): Promise<TillMessage[]> {
  const rows = await prisma.retailDeviceMessage.findMany({
    where: { companyId: device.companyId, registerId: device.registerId, dismissedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, createdAt: true, sentBy: { select: { name: true } } },
  });
  return rows.map((row) => ({ id: row.id, body: row.body, from: row.sentBy.name ?? "", at: row.createdAt.toISOString() }));
}

/** Dismiss one of this till's messages. False when it is not this till's. */
export async function dismissTillMessage(device: PosDevice, id: string, now: Date = new Date()): Promise<boolean> {
  const result = await prisma.retailDeviceMessage.updateMany({
    where: { id, companyId: device.companyId, registerId: device.registerId, dismissedAt: null },
    data: { dismissedAt: now },
  });
  if (result.count > 0) return true;
  return (await prisma.retailDeviceMessage.count({ where: { id, companyId: device.companyId, registerId: device.registerId } })) > 0;
}

/* ── Who may sign in at the till (the `till-pin` provider) ────────────────── */

type TillSignInRefusal = "NOT_A_TILL" | "DEVICE_UNPAIRED" | "NOT_ON_THIS_TILL";

export type TillPinSignIn =
  | { ok: true; device: PosDevice; mustChange: boolean }
  | { ok: false; reason: TillSignInRefusal | "NO_PIN" | "LOCKED" | "WRONG_PIN"; triesLeft?: number };

export type TillPasswordSignIn = { ok: true; device: PosDevice } | { ok: false; reason: TillSignInRefusal | "WRONG_PASSWORD" };

/** The device a sign-in is made at, when it is a live till and the person is one it offers (`tillPeople`). */
async function tillForSignIn(
  deviceKey: string | null | undefined,
  userId: string,
): Promise<{ ok: true; device: PosDevice } | { ok: false; reason: TillSignInRefusal }> {
  const device = await findDeviceByKey(deviceKey);
  if (!device) return { ok: false, reason: "NOT_A_TILL" };
  if (device.unpairedAt) return { ok: false, reason: "DEVICE_UNPAIRED" };
  if (!device.register.isActive) return { ok: false, reason: "NOT_A_TILL" };
  const people = await tillPeople(device);
  if (!people.some((person) => person.userId === userId)) return { ok: false, reason: "NOT_ON_THIS_TILL" };
  return { ok: true, device };
}

/**
 * A PIN sign-in at a paired device: the device must be a live till of the
 * shop; the person must be one the till offers (`tillPeople`); the PIN is
 * checked with the lockout of ADM-03 (`checkTillPin`: five wrong and it is
 * locked until a new one is sent). `mustChange` says the PIN was issued and
 * they choose their own before the till opens.
 */
export async function checkTillPinSignIn(
  input: { deviceKey: string | null | undefined; userId: string; pin: string },
  now: Date = new Date(),
): Promise<TillPinSignIn> {
  const till = await tillForSignIn(input.deviceKey, input.userId);
  if (!till.ok) return till;
  const { device } = till;

  const checked = await checkTillPin({
    companyId: device.companyId,
    userId: input.userId,
    pin: input.pin,
    place: { registerId: device.registerId },
    opens: true,
    now,
  });
  if (checked.decision === "NO_PIN") return { ok: false, reason: "NO_PIN" };
  if (checked.decision === "ACCEPTED") return { ok: true, device, mustChange: checked.mustChange };
  if (checked.decision === "LOCKED" || checked.decision === "REJECTED_NOW_LOCKED") return { ok: false, reason: "LOCKED" };
  return { ok: false, reason: "WRONG_PIN", triesLeft: checked.attemptsRemaining };
}

/**
 * The way round a locked PIN (ADM-03 keeps it locked until a manager sends a
 * new one): the person's account password, at the same till and on the same
 * list as a PIN. The PIN's counter is left alone, since the password is not a
 * guess at it. The caller compares the bcrypt hash; the sign-in rate limit is
 * the caller's too.
 */
export async function checkTillPasswordSignIn(input: {
  deviceKey: string | null | undefined;
  userId: string;
  verify: (passwordHash: string) => Promise<boolean>;
}): Promise<TillPasswordSignIn> {
  const till = await tillForSignIn(input.deviceKey, input.userId);
  if (!till.ok) return till;
  const user = await prisma.user.findFirst({
    where: { id: input.userId, companyId: till.device.companyId, isActive: true },
    select: { password: true },
  });
  if (!user?.password || !(await input.verify(user.password))) return { ok: false, reason: "WRONG_PASSWORD" };
  return till;
}

/** A refusal from `pairDevice`, or the generic one. */
export function pairFailure(error: unknown): NextResponse {
  if (error instanceof PairRefusal) return refuse(error.status, { error: error.message, ...error.body });
  console.error("[API] POST /api/v2/retail/devices/pair error:", error);
  return errorResponse("That did not work. Try the code again.");
}

/**
 * A device route with no session (`devices/me`, `people`, `heartbeat`): the
 * device key is the credential, and it must be a device of the shop whose
 * POS host this is.
 */
export async function requireHostDevice(
  request: NextRequest,
): Promise<{ device: PosDevice; response: null } | { device: null; response: NextResponse }> {
  const tenant = await resolveTenantFromHost(getHostHeaderFromRequestHeaders(request.headers));
  if (!tenant) return { device: null, response: refuse(409, { error: NOT_A_TILL, code: "NOT_A_TILL" }) };
  return requirePosDevice(request, { user: { companyId: tenant.companyId } });
}
