import type { FiscalisationProviderConfig, Prisma } from "@prisma/client";

import { resolveDeviceSigningKey } from "@/lib/accounting/fdms-connector";
import { isFdmsUnreachable, recordFdmsContact } from "@/lib/accounting/fdms-contact";
import {
  buildFiscalDayCanonicalString,
  closeDayOnDevice,
  getDeviceStatus,
  providerCertificatePem,
} from "@/lib/accounting/fdms-device";
import {
  centsFromMinorUnits,
  formatReceiptDate,
  hashReceipt,
  hashReceiptInput,
  signReceipt,
  verifyReceiptSignature,
} from "@/lib/accounting/fdms-receipt-signing";
import { registerFiscalDevice } from "@/lib/accounting/fdms-registration";
import {
  claimFiscalDayClosing,
  closeFiscalDay,
  FISCAL_DAY_STATUS,
  FiscalDayCloseInProgressError,
  FiscalDayHasPendingReceiptsError,
  FiscalDayNotFoundError,
  FiscalDayNotOpenError,
  lockDeviceDay,
  openFiscalDay,
  releaseFiscalDayClosing,
  type FiscalDayClaim,
} from "@/lib/accounting/fiscal-day";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import {
  FISCAL_PROVIDER_KEY,
  resendRetailReceipts,
  retailFiscalDayTaxLines,
  shopFiscalDevice,
  signWaitingSales,
  waitingSales,
} from "@/lib/retail/fiscalisation";
import {
  connectionWords,
  DAY_CLOSE_WORDS,
  dayCloseOf,
  DEVICE_DAY_OPEN_REFUSAL,
  DEVICE_RECONNECT_DAY_OPEN_REFUSAL,
  FISCAL_OFFLINE_REFUSAL,
  FISCAL_OFFLINE_WINDOW_MS,
  fiscalDayLabel,
  fiscalDayTotal,
  UNREACHABLE_WORDS,
  whenUnreachableOf,
  zReportTotals,
  type DayClose,
  type WhenUnreachable,
} from "@/lib/retail/fiscal-words";

/**
 * Setup › Fiscal device (SET-08, W-06): the shop's ZIMRA device, how its
 * fiscal day closes, and what the tills do while ZIMRA cannot be reached.
 *
 * The device is the company's `ZIMRA_FDMS` `FiscalisationProviderConfig`
 * ({@link shopFiscalDevice}); the taxpayer and VAT numbers are
 * `AccountingSettings`' (what the signer reads; VAT also onto the branding the
 * receipts print); the two rules are `RetailFiscalSettings`. Every till signs
 * with this one device (10-setup open question 11).
 */

export const FISCAL_SETTINGS_ENTITY = { entityType: "RetailSettings", entityId: "fiscal" } as const;

type Db = typeof prisma | Prisma.TransactionClient;

/** A refusal with its HTTP status and, for 409s the spec names, a code. */
export class FiscalRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 502,
    readonly code?: string,
  ) {
    super(message);
    this.name = "FiscalRefused";
  }
}

export async function loadFiscalSettings(
  companyId: string,
  db: Db = prisma,
): Promise<{ dayClose: DayClose; whenUnreachable: WhenUnreachable }> {
  const row = await db.retailFiscalSettings.findUnique({
    where: { companyId },
    select: { dayClose: true, whenUnreachable: true },
  });
  return { dayClose: row?.dayClose ?? "WITH_LAST_SHIFT", whenUnreachable: row?.whenUnreachable ?? "KEEP_SELLING" };
}

/** The device's day that has not closed yet: open, or closing while its Z-report waits for ZIMRA. */
async function activeDay(device: FiscalisationProviderConfig, db: Db = prisma) {
  return db.fiscalDay.findFirst({
    where: { companyId: device.companyId, providerConfigId: device.id, status: { not: FISCAL_DAY_STATUS.CLOSED } },
    select: { id: true, fiscalDayNo: true, status: true, openedAt: true },
  });
}

/** What each day took: its till receipts' sales when it has any, else what its Z-report counted. */
async function dayTotals(
  companyId: string,
  days: Array<{ id: string; countersJson: string | null }>,
): Promise<Map<string, string>> {
  const receipts = days.length
    ? await prisma.fiscalReceipt.findMany({
        where: {
          companyId,
          fiscalDayId: { in: days.map((day) => day.id) },
          retailSaleId: { not: null },
          status: { not: "VOIDED" },
        },
        select: { fiscalDayId: true, retailSale: { select: { totalAmount: true, currency: true } } },
      })
    : [];
  const byDay = new Map<string, Map<string, bigint>>();
  for (const receipt of receipts) {
    if (!receipt.fiscalDayId || !receipt.retailSale) continue;
    const totals = byDay.get(receipt.fiscalDayId) ?? new Map<string, bigint>();
    const currency = receipt.retailSale.currency.toUpperCase();
    const cents = BigInt(receipt.retailSale.totalAmount.times(100).toFixed(0));
    totals.set(currency, (totals.get(currency) ?? BigInt(0)) + cents);
    byDay.set(receipt.fiscalDayId, totals);
  }
  return new Map(
    days.map((day) => [day.id, fiscalDayTotal(byDay.get(day.id) ?? zReportTotals(day.countersJson) ?? new Map())]),
  );
}

export type FiscalDayRow = { no: number; label: string; total: string };

/**
 * The page's values (10-setup 4.8 `FiscalPage`, flattened for the
 * SettingsFrame): the connection line, the device's numbers, the two rules in
 * words, the open day and the newest five days.
 */
export async function loadFiscalPage(companyId: string, now: Date = new Date()) {
  const [device, settings, accounting] = await Promise.all([
    shopFiscalDevice(companyId),
    loadFiscalSettings(companyId),
    prisma.accountingSettings.findUnique({ where: { companyId }, select: { taxNumber: true, vatNumber: true } }),
  ]);
  const days = device
    ? await prisma.fiscalDay.findMany({
        where: { companyId, providerConfigId: device.id },
        orderBy: { fiscalDayNo: "desc" },
        take: 5,
        select: { id: true, fiscalDayNo: true, status: true, openedAt: true, closedAt: true, countersJson: true },
      })
    : [];
  const totals = await dayTotals(companyId, days);
  const open = days.find((day) => day.status !== FISCAL_DAY_STATUS.CLOSED) ?? null;
  const registered = Boolean(device?.registeredAt);
  const connection = connectionWords({
    registered,
    unreachableSince: device && isFdmsUnreachable(device) ? device.lastFailedAt : null,
    activeDay: open ? { no: open.fiscalDayNo, openedAt: open.openedAt, status: open.status } : null,
    now,
  });
  return {
    connection: connection.text,
    connectionState: connection.state,
    deviceId: device?.deviceId ?? "",
    serialNumber: device?.serialNumber ?? "",
    taxpayerNumber: accounting?.taxNumber ?? "",
    vatNumber: accounting?.vatNumber ?? "",
    // Typed to connect, never kept.
    activationKey: "",
    registered,
    dayClose: DAY_CLOSE_WORDS[settings.dayClose],
    whenUnreachable: UNREACHABLE_WORDS[settings.whenUnreachable],
    openDay: open ? { id: open.id, no: open.fiscalDayNo, openedAt: open.openedAt.toISOString(), status: open.status } : null,
    days: days.map<FiscalDayRow>((day) => ({
      no: day.fiscalDayNo,
      label: fiscalDayLabel(day, now),
      total: totals.get(day.id) ?? "",
    })),
  };
}

/** Who registered the device and when, for the save bar ("Registered by Tendai Mhlanga, 14 March."). */
export async function fiscalRegistration(companyId: string): Promise<{ by: string; at: string } | null> {
  const device = await prisma.fiscalisationProviderConfig.findUnique({
    where: { companyId_providerKey: { companyId, providerKey: FISCAL_PROVIDER_KEY } },
    select: { registeredAt: true, registeredBy: { select: { name: true } } },
  });
  if (!device?.registeredAt) return null;
  return { by: device.registeredBy?.name ?? "Someone", at: device.registeredAt.toISOString() };
}

/* ── Saving the page ─────────────────────────────────────────────────────── */

export type FiscalPatch = {
  deviceId?: string;
  serialNumber?: string;
  taxpayerNumber?: string;
  vatNumber?: string;
  dayClose?: string;
  whenUnreachable?: string;
};

/**
 * Write the page's checked changes inside the settings save. A new device ID
 * is a new device: not registered, its days counted from 1 — the old one is
 * retired with its days and receipts when it has any — and while a day is
 * open on the old one the change is refused (409 `FISCAL_DAY_OPEN`), because
 * that day's receipts are signed under it.
 */
export async function saveFiscalPatch(tx: Prisma.TransactionClient, actor: RetailAuditActor, patch: FiscalPatch) {
  const { companyId } = actor;
  if (patch.deviceId !== undefined || patch.serialNumber !== undefined) {
    const device = await shopFiscalDevice(companyId, tx);
    const deviceId = patch.deviceId !== undefined ? patch.deviceId || null : (device?.deviceId ?? null);
    const serialNumber = patch.serialNumber !== undefined ? patch.serialNumber || null : (device?.serialNumber ?? null);
    const newDevice = device !== null && patch.deviceId !== undefined && deviceId !== device.deviceId;
    if (newDevice && (await activeDay(device, tx))) {
      throw new FiscalRefused(DEVICE_DAY_OPEN_REFUSAL, 409, "FISCAL_DAY_OPEN");
    }
    const fresh = {
      companyId,
      providerKey: FISCAL_PROVIDER_KEY,
      apiBaseUrl: device?.apiBaseUrl ?? process.env.ZIMRA_FDMS_API_BASE_URL ?? null,
      deviceId,
      serialNumber,
      isActive: true,
    };
    if (device && newDevice && (await tx.fiscalDay.count({ where: { providerConfigId: device.id } })) > 0) {
      // The old device keeps its days and receipts, retired under a key of its own; the new one counts its own from 1.
      const retired = `${FISCAL_PROVIDER_KEY}#${device.id}`;
      await tx.fiscalisationProviderConfig.update({ where: { id: device.id }, data: { providerKey: retired, isActive: false } });
      await tx.fiscalReceipt.updateMany({
        where: { companyId, fiscalDay: { providerConfigId: device.id } },
        data: { providerKey: retired },
      });
      await tx.fiscalisationProviderConfig.create({ data: fresh });
    } else if (device) {
      await tx.fiscalisationProviderConfig.update({
        where: { id: device.id },
        data: {
          deviceId,
          serialNumber,
          ...(device.apiBaseUrl ? {} : { apiBaseUrl: fresh.apiBaseUrl }),
          // A new device is not registered: the key and certificate were the old one's.
          ...(newDevice
            ? { certificateRef: null, registeredAt: null, registeredById: null, lastOkAt: null, lastFailedAt: null }
            : {}),
        },
      });
    } else {
      await tx.fiscalisationProviderConfig.create({ data: fresh });
    }
  }

  const numbers: { taxNumber?: string | null; vatNumber?: string | null } = {};
  if (patch.taxpayerNumber !== undefined) numbers.taxNumber = patch.taxpayerNumber || null;
  if (patch.vatNumber !== undefined) numbers.vatNumber = patch.vatNumber || null;
  if (Object.keys(numbers).length > 0) {
    await tx.accountingSettings.upsert({ where: { companyId }, create: { companyId, ...numbers }, update: numbers });
    // The receipts print the branding's VAT number; it stays the one the signer reads.
    if (numbers.vatNumber !== undefined) {
      await tx.companyBranding.updateMany({ where: { companyId }, data: { vatNumber: numbers.vatNumber } });
    }
  }

  const rules: { dayClose?: DayClose; whenUnreachable?: WhenUnreachable } = {};
  if (patch.dayClose !== undefined) rules.dayClose = dayCloseOf(patch.dayClose) ?? undefined;
  if (patch.whenUnreachable !== undefined) rules.whenUnreachable = whenUnreachableOf(patch.whenUnreachable) ?? undefined;
  if (rules.dayClose || rules.whenUnreachable) {
    await tx.retailFiscalSettings.upsert({
      where: { companyId },
      create: { companyId, ...rules, updatedById: actor.userId },
      update: { ...rules, updatedById: actor.userId },
    });
  }
}

/* ── Connect ─────────────────────────────────────────────────────────────── */

/**
 * "Connect": register the saved device with ZIMRA with the activation key it
 * sent, under the saved serial number. 400 when the device's numbers are not
 * saved yet; 502 with ZIMRA's own words when it refuses or does not answer.
 */
export async function connectFiscalDevice(actor: RetailAuditActor, activationKey: string, now: Date = new Date()) {
  const device = await shopFiscalDevice(actor.companyId);
  if (!device?.deviceId) throw new FiscalRefused("Save the device ID before connecting.", 400);
  if (!device.serialNumber) throw new FiscalRefused("Save the serial number before connecting.", 400);
  // Connecting again replaces the device's key and certificate: the open day's receipts are signed under the old
  // one, and its Z-report must be too.
  if (device.registeredAt && (await activeDay(device))) {
    throw new FiscalRefused(DEVICE_RECONNECT_DAY_OPEN_REFUSAL, 409, "FISCAL_DAY_OPEN");
  }
  const result = await registerFiscalDevice({
    provider: device.apiBaseUrl ? device : { ...device, apiBaseUrl: process.env.ZIMRA_FDMS_API_BASE_URL ?? null },
    activationKey,
    serialNumber: device.serialNumber,
    registeredById: actor.userId,
    now,
  });
  if (!result.ok) throw new FiscalRefused(result.error, result.status);
  await writeRetailAuditEvent(prisma, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.fiscalConnected,
    ...FISCAL_SETTINGS_ENTITY,
    payload: {
      deviceId: device.deviceId,
      serialNumber: device.serialNumber,
      taxCodesMapped: result.taxCodesMapped,
      taxCodesNotMapped: result.taxCodesNotMapped,
    },
  });
}

/* ── Test a receipt ──────────────────────────────────────────────────────── */

export type FiscalTest = { ok: boolean; message: string; ms: number };

/**
 * "Test a receipt": a zero-value receipt signed with the device's key here
 * (nothing submitted, no number used, checked against the certificate on
 * file), then FDMS asked for the device's status. Says how long it took.
 */
export async function testFiscalDevice(companyId: string, clock: () => number = () => Date.now()): Promise<FiscalTest> {
  const started = clock();
  const done = (ok: boolean, message: string): FiscalTest => ({ ok, message, ms: Math.max(0, Math.round(clock() - started)) });
  const device = await shopFiscalDevice(companyId);
  const key = device ? resolveDeviceSigningKey(device) : null;
  if (!device?.deviceId || !device.registeredAt || !key) return done(false, "Connect the device before testing it.");

  try {
    const hash = hashReceiptInput({
      deviceId: device.deviceId,
      receiptType: "FISCALINVOICE",
      receiptCurrency: "USD",
      receiptGlobalNo: 1,
      receiptDate: new Date(),
      receiptTotal: centsFromMinorUnits(0),
      taxes: [{ taxId: 0, taxPercent: null, taxAmount: centsFromMinorUnits(0) }],
      previousReceiptHash: null,
    });
    const signature = signReceipt(hash, key.privateKeyPem, key.passphrase ? { passphrase: key.passphrase } : undefined);
    const certificate = providerCertificatePem(device);
    if (certificate && !verifyReceiptSignature({ hash, signature, publicKeyPem: certificate })) {
      return done(false, "The device's key does not match its certificate. Connect it again with a new activation key.");
    }
  } catch (error) {
    return done(false, `The device could not sign: ${error instanceof Error ? error.message : "unknown error"}.`);
  }

  let status: Awaited<ReturnType<typeof getDeviceStatus>>;
  try {
    status = await getDeviceStatus({ provider: device });
  } catch (error) {
    await recordFdmsContact(device.id, false);
    return done(false, `The device signed a test receipt, but ZIMRA did not answer: ${error instanceof Error ? error.message : "no reply"}.`);
  }
  await recordFdmsContact(device.id, true);
  if (status.status !== "SUCCESS") {
    return done(false, `The device signed a test receipt, but ZIMRA said: ${status.error ?? "no"}.`);
  }
  return done(true, "The device signed a test receipt and ZIMRA answered.");
}

/* ── Close a day ─────────────────────────────────────────────────────────── */

/** ZIMRA did not take the Z-report, or did not answer it: the day stays closing for the next close. */
class FdmsCloseRefused extends Error {}

/** ZIMRA did not answer before the report was sent: an open day stays open, and a day whose report waits still waits. */
function silentCloseWords(dayNo: number, wasClosing: boolean, detail: string): string {
  return wasClosing
    ? `ZIMRA did not answer, so day ${dayNo}'s report still waits. Close it again once ZIMRA is back. (${detail})`
    : `ZIMRA did not answer, so day ${dayNo} stays open and the tills keep signing into it. Close it again once ZIMRA is back. (${detail})`;
}

/**
 * ZIMRA did not answer the report: it may have taken it and only its answer
 * was lost, so the day never takes receipts again — it stays closing, and
 * the sales wait for the next day.
 */
function unansweredReportWords(dayNo: number, detail: string): string {
  return `ZIMRA did not answer day ${dayNo}'s report, so the day stays closed to sales and they wait for day ${dayNo + 1}. Close it again once ZIMRA is back. (${detail})`;
}

/** Whether ZIMRA's GetStatus says it has closed `dayNo` already: closed, or a later day on the device. */
function zimraClosed(status: Awaited<ReturnType<typeof getDeviceStatus>>, dayNo: number): boolean {
  const last = status.data?.lastFiscalDayNo ?? null;
  if (last === null) return false;
  return last > dayNo || (last === dayNo && status.data?.fiscalDayStatus === "FiscalDayClosed");
}

/** Whether ZIMRA says it has closed `dayNo`; false while it does not answer. */
async function zimraHasClosed(device: FiscalisationProviderConfig, dayNo: number): Promise<boolean> {
  let status: Awaited<ReturnType<typeof getDeviceStatus>>;
  try {
    status = await getDeviceStatus({ provider: device });
  } catch {
    await recordFdmsContact(device.id, false);
    return false;
  }
  await recordFdmsContact(device.id, true);
  return status.status === "SUCCESS" && zimraClosed(status, dayNo);
}

/**
 * Close a fiscal day: the day's counters from its till receipts, signed with
 * the device's key and sent to ZIMRA as its Z-report (`CloseDay`).
 *
 * ZIMRA is asked how the device stands first: while it does not answer, the
 * day is left as it is, and an open day's tills keep signing into it ("Keep
 * selling, sign later") — a report ZIMRA never received has not closed
 * anything. Then the day stops taking receipts (closing) before anything is
 * counted: the claim waits for every sale signing into the day under its
 * lock, so the report counts every receipt the day holds. Its receipts ZIMRA
 * has not taken go again, and the report. Once the report has gone out the
 * day never takes receipts again, whatever comes back: ZIMRA may have taken
 * it with only its answer lost. So when the report goes unanswered ZIMRA is
 * asked how the day stands (GetStatus): closed there, the day is recorded
 * closed with its report; otherwise, or when ZIMRA is still silent, it stays
 * closing, and so does one whose report ZIMRA answers with a no, until it is
 * closed again. A day is given back to the tills only when its report never
 * went out. One close holds the day at a time: a second, by hand, with the
 * last shift or from the worker, is refused while the first is on its way,
 * and a closing day no close holds is taken over — and when ZIMRA already has
 * the day closed (an earlier report was taken), it is recorded closed with its
 * report and not sent again. A sale rung while the day is closing waits, and
 * is signed into the next day once the report is taken, or into the same day
 * when it is given back ({@link signWaitingSales}).
 */
export async function closeShopFiscalDay(
  actor: RetailAuditActor,
  dayId: string,
  how: "HAND" | "LAST_SHIFT" = "HAND",
) {
  const device = await shopFiscalDevice(actor.companyId);
  if (!device) throw new FiscalRefused("This shop has no fiscal device.", 404);
  const day = await prisma.fiscalDay.findFirst({
    where: { id: dayId, companyId: actor.companyId, providerConfigId: device.id },
    select: { id: true, fiscalDayNo: true, status: true, deviceId: true, openedAt: true },
  });
  if (!day) throw new FiscalRefused("That fiscal day is not this shop's.", 404);
  if (day.status === FISCAL_DAY_STATUS.CLOSED) throw new FiscalRefused(`Day ${day.fiscalDayNo} is already closed.`, 409);
  const key = resolveDeviceSigningKey(device);
  if (!key) throw new FiscalRefused("Connect the device before closing a day.", 409);
  const wasClosing = day.status === FISCAL_DAY_STATUS.CLOSING;

  let status: Awaited<ReturnType<typeof getDeviceStatus>>;
  try {
    status = await getDeviceStatus({ provider: device });
  } catch (error) {
    await recordFdmsContact(device.id, false);
    throw new FiscalRefused(silentCloseWords(day.fiscalDayNo, wasClosing, error instanceof Error ? error.message : "no reply"), 502);
  }
  await recordFdmsContact(device.id, true);

  let claim: FiscalDayClaim;
  try {
    claim = await claimFiscalDayClosing(day.id);
  } catch (error) {
    if (error instanceof FiscalDayCloseInProgressError) {
      throw new FiscalRefused(`Day ${day.fiscalDayNo} is already being closed. Its report is on its way to ZIMRA.`, 409, error.code);
    }
    if (error instanceof FiscalDayNotOpenError) throw new FiscalRefused(`Day ${day.fiscalDayNo} is already closed.`, 409);
    throw error;
  }
  // Once the report has gone out, ZIMRA may have closed the day whatever came back: it is never given back.
  let reportSent = false;
  // Not closed after all, the close lets go of the day. Given back, a day it took open takes the tills'
  // receipts again, the sales that waited on it first; otherwise it stays closing, for the next close.
  const letGo = async (giveBack: boolean) => {
    const reopen = giveBack && !reportSent && claim.from === FISCAL_DAY_STATUS.OPENED;
    const released = await releaseFiscalDayClosing(claim, { reopen });
    if (released && reopen) await signWaitingSales(actor.companyId);
  };
  // A day taken over from a close that died, or whose report ZIMRA refused: ZIMRA may have taken its report already.
  const takenAlready = claim.from === FISCAL_DAY_STATUS.CLOSING && zimraClosed(status, day.fiscalDayNo);

  try {
    // "Sign later": what the tills signed while ZIMRA was away goes again now, so the report can count it.
    if (!takenAlready) {
      const { refused } = await resendRetailReceipts({ companyId: actor.companyId, fiscalDayId: day.id });
      // Not ZIMRA's silence but the receipt itself: closing again will not send it, so the close says why.
      if (refused) {
        throw new FiscalRefused(
          `Day ${day.fiscalDayNo} cannot close: the receipt for sale ${refused.saleNo ?? refused.saleId} was not sent to ZIMRA. ${refused.fiscalError ?? ""}`.trim(),
          409,
          refused.errorCode ?? undefined,
        );
      }
    }
    const taxLinesByReceiptId = await retailFiscalDayTaxLines({ companyId: actor.companyId, fiscalDayId: day.id });
    await closeFiscalDay({
      dayId: day.id,
      companyId: actor.companyId,
      claim,
      taxLinesByReceiptId,
      signClosure: async ({ counters }) => {
        const hash = hashReceipt(
          buildFiscalDayCanonicalString({
            deviceId: day.deviceId,
            fiscalDayNo: day.fiscalDayNo,
            fiscalDayDate: formatReceiptDate(day.openedAt),
            counters: counters.counters,
          }),
        );
        const signature = signReceipt(hash, key.privateKeyPem, key.passphrase ? { passphrase: key.passphrase } : undefined);
        // The report ZIMRA already took is the one recorded: the same counters, signed the same way.
        if (takenAlready) return signature;
        let answer: Awaited<ReturnType<typeof closeDayOnDevice>>;
        reportSent = true;
        try {
          answer = await closeDayOnDevice({
            provider: device,
            deviceId: day.deviceId,
            fiscalDayNo: day.fiscalDayNo,
            receiptCounter: counters.lastReceiptCounter,
            counters: counters.counters,
            signature: { hash, signature },
          });
        } catch (error) {
          await recordFdmsContact(device.id, false);
          // The report may have reached ZIMRA with only its answer lost: ZIMRA says whether it closed the day.
          if (await zimraHasClosed(device, day.fiscalDayNo)) return signature;
          throw new FdmsCloseRefused(unansweredReportWords(day.fiscalDayNo, error instanceof Error ? error.message : "no reply"));
        }
        await recordFdmsContact(device.id, true);
        if (answer.status !== "SUCCESS") {
          throw new FdmsCloseRefused(
            `ZIMRA did not take day ${day.fiscalDayNo}'s report: ${answer.error ?? "no reason given"}. Sales wait for day ${day.fiscalDayNo + 1} until it is taken.`,
          );
        }
        return signature;
      },
    });
  } catch (error) {
    if (error instanceof FdmsCloseRefused) {
      // Refused, or perhaps taken with the answer lost: it waits closing for the next close.
      await letGo(false);
      throw new FiscalRefused(error.message, 502);
    }
    // The close holds the day, not closeFiscalDay: it lets go of it here — given back only if its report never went out.
    await letGo(true);
    if (error instanceof FiscalDayCloseInProgressError) {
      throw new FiscalRefused(`Day ${day.fiscalDayNo} is already being closed. Its report is on its way to ZIMRA.`, 409, error.code);
    }
    if (error instanceof FiscalDayHasPendingReceiptsError) {
      const count = error.receipts.length;
      throw new FiscalRefused(
        `Day ${day.fiscalDayNo} has ${count} ${count === 1 ? "receipt" : "receipts"} ZIMRA has not taken yet. ${
          count === 1 ? "It was" : "They were"
        } sent again just now and ZIMRA did not answer. Close the day again once ZIMRA is back.`,
        409,
        error.code,
      );
    }
    if (error instanceof FiscalDayNotOpenError) throw new FiscalRefused(`Day ${day.fiscalDayNo} is already closed.`, 409);
    if (error instanceof FiscalDayNotFoundError) throw new FiscalRefused("That fiscal day is not this shop's.", 404);
    throw error;
  }

  const closed = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id }, select: { id: true, countersJson: true } });
  const total = (await dayTotals(actor.companyId, [closed])).get(day.id) ?? null;
  await writeRetailAuditEvent(prisma, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.fiscalDayClosed,
    ...FISCAL_SETTINGS_ENTITY,
    payload: { dayNo: day.fiscalDayNo, deviceId: day.deviceId, total, how },
  });
  // The tills kept selling while the report was on its way: those sales go into the next day now, before any other.
  await signWaitingSales(actor.companyId);
}

/** Whether FDMS has not answered the device for less than the offline window: nothing new is sent to it meanwhile. */
function silentJustNow(device: FiscalisationProviderConfig, now: Date): boolean {
  return Boolean(
    device.lastFailedAt && isFdmsUnreachable(device) && now.getTime() - device.lastFailedAt.getTime() < FISCAL_OFFLINE_WINDOW_MS,
  );
}

/**
 * "Close the fiscal day · With the last shift": called by the shift-close
 * service once a shift has closed. When it was the shop's last open shift and
 * the shop closes its day that way, the open day closes now, under the person
 * who closed the shift — unless ZIMRA has just been silent, when the retail
 * worker sends the report once it answers ({@link closeWaitingFiscalDays}).
 * Never throws: the shift is closed either way.
 */
export async function closeFiscalDayIfLastShift(
  actor: RetailAuditActor,
  now: Date = new Date(),
): Promise<{ closed: number | null }> {
  try {
    const settings = await loadFiscalSettings(actor.companyId);
    if (settings.dayClose !== "WITH_LAST_SHIFT") return { closed: null };
    const stillOpen = await prisma.retailShift.count({ where: { companyId: actor.companyId, status: "OPEN" } });
    if (stillOpen > 0) return { closed: null };
    const device = await shopFiscalDevice(actor.companyId);
    if (!device?.registeredAt || silentJustNow(device, now)) return { closed: null };
    const day = await activeDay(device);
    if (!day || day.status !== FISCAL_DAY_STATUS.OPENED) return { closed: null };
    await closeShopFiscalDay(actor, day.id, "LAST_SHIFT");
    return { closed: day.fiscalDayNo };
  } catch (error) {
    console.error("[retail] closing the fiscal day with the last shift failed:", error);
    return { closed: null };
  }
}

/**
 * The retail worker's half of "With the last shift" (every five minutes): a
 * day still open after its last shift closed — ZIMRA did not answer then — is
 * closed once ZIMRA answers, while no shift is open. A day that a shift is
 * selling into stays open, even past midnight: it closes with that shift. A
 * day whose report went unanswered or was refused waits closing, its sales
 * waiting with it: it is closed again whatever the shifts do — ZIMRA asked
 * first, so a report it took is recorded, not sent again. Nothing on a till
 * or a shift opening ever sends a day's report. Sales rung while a day closed
 * that the close did not get to are signed first.
 */
export async function closeWaitingFiscalDays(onlyCompanyId?: string): Promise<string> {
  const devices = await prisma.fiscalisationProviderConfig.findMany({
    where: {
      providerKey: FISCAL_PROVIDER_KEY,
      isActive: true,
      registeredAt: { not: null },
      ...(onlyCompanyId ? { companyId: onlyCompanyId } : {}),
    },
  });
  const said: string[] = [];
  for (const device of devices) {
    const { companyId } = device;
    // A close that stopped before signing what the tills rang meanwhile: those sales go in now.
    const signed = (await signWaitingSales(companyId)).filter((sale) => sale.fiscalReceiptId).length;
    if (signed > 0) said.push(`${signed} ${signed === 1 ? "sale" : "sales"} rung while a day closed signed`);
    if ((await loadFiscalSettings(companyId)).dayClose !== "WITH_LAST_SHIFT") continue;
    const day = await activeDay(device);
    if (!day) continue;
    const waitsClosing = day.status === FISCAL_DAY_STATUS.CLOSING;
    if (!waitsClosing && (await prisma.retailShift.count({ where: { companyId, status: "OPEN" } })) > 0) continue;
    const last = await prisma.retailShift.findFirst({
      where: { companyId, status: "CLOSED", closedAt: { gte: day.openedAt } },
      orderBy: { closedAt: "desc" },
      select: { cashierId: true, cashierName: true },
    });
    if (!last) continue;
    try {
      await closeShopFiscalDay({ companyId, userId: last.cashierId, userName: last.cashierName }, day.id, "LAST_SHIFT");
      said.push(`day ${day.fiscalDayNo} closed`);
    } catch (error) {
      if (!(error instanceof FiscalRefused)) throw error;
      said.push(`day ${day.fiscalDayNo} waits`);
    }
  }
  return said.length > 0 ? said.join(", ") : "nothing waiting";
}

/**
 * The shop's fiscal day, opened by the day's first shift when none is open
 * (the counterpart of closing it with the last shift). A sale that finds none
 * opens one itself, in its own commit ({@link assignRetailSaleFiscalDay}); a
 * day still open takes the sale, whatever its date; a day whose report waits
 * on ZIMRA (closing) holds the next one back, and so do sales waiting for it,
 * which open it no later than the first of them. Never before the last day's
 * last receipt. Local only: nothing here calls ZIMRA. Never throws.
 */
export async function openFiscalDayIfNone(companyId: string, from: Date = new Date()): Promise<{ opened: number | null }> {
  try {
    const device = await shopFiscalDevice(companyId);
    if (!device?.registeredAt || !device.isActive || !device.deviceId) return { opened: null };
    const day = await prisma.$transaction(async (tx) => {
      if (await lockDeviceDay(tx, device.id)) return null;
      if ((await waitingSales(companyId, { take: 1 }, tx)).length > 0) return null;
      const previous = await tx.fiscalDay.findFirst({
        where: { providerConfigId: device.id },
        orderBy: { fiscalDayNo: "desc" },
        select: { closedAt: true },
      });
      // No earlier than the last day closed: ZIMRA takes no receipt dated before the last one it took.
      const floor = previous?.closedAt?.getTime() ?? 0;
      const openedAt = new Date(Math.min(Math.max(from.getTime(), floor), Date.now()));
      return openFiscalDay({ companyId, providerConfigId: device.id, openedAt }, tx);
    });
    return { opened: day?.fiscalDayNo ?? null };
  } catch (error) {
    console.error("[retail] opening the fiscal day failed:", error);
    return { opened: null };
  }
}

/* ── The tills ───────────────────────────────────────────────────────────── */

/** What a till knows of the fiscal device (devices/me): its ID, the open day, and the rule while ZIMRA is away. */
export async function tillFiscal(companyId: string) {
  const [device, settings] = await Promise.all([shopFiscalDevice(companyId), loadFiscalSettings(companyId)]);
  const day = device?.registeredAt ? await activeDay(device) : null;
  return {
    deviceId: device?.registeredAt ? device.deviceId : null,
    dayNo: day && day.status === FISCAL_DAY_STATUS.OPENED ? day.fiscalDayNo : null,
    whenUnreachable: settings.whenUnreachable,
  };
}

/**
 * "If ZIMRA cannot be reached · Stop selling": a new sale is refused from the
 * device's first failed call to FDMS until FDMS answers again. Nothing else
 * may call FDMS while the tills stand still, so once the last failure is five
 * minutes old the sale itself asks FDMS how the device stands (GetStatus):
 * an answer lets it through, silence refuses it and waits another five
 * minutes. Null when the till may sell.
 */
export async function fiscalSaleRefusal(companyId: string, now: Date = new Date()): Promise<string | null> {
  const settings = await loadFiscalSettings(companyId);
  if (settings.whenUnreachable !== "STOP_SELLING") return null;
  const device = await shopFiscalDevice(companyId);
  if (!device?.registeredAt || !device.lastFailedAt || !isFdmsUnreachable(device)) return null;
  if (now.getTime() - device.lastFailedAt.getTime() < FISCAL_OFFLINE_WINDOW_MS) return FISCAL_OFFLINE_REFUSAL;
  try {
    await getDeviceStatus({ provider: device });
  } catch {
    await recordFdmsContact(device.id, false, now);
    return FISCAL_OFFLINE_REFUSAL;
  }
  await recordFdmsContact(device.id, true, now);
  return null;
}
