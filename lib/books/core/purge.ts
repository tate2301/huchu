import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

import { auditActor, canDo, type BooksActor } from "./can-do";
import { asUndoRefused, deleteDocument, UndoRefused } from "./undo";
import { contextFor, loadDoc } from "./undo-docs";
import { deleteRefusal, reasonOf, UNDO_NOUN, type UndoKind } from "./undo-rules";

/**
 * D18 (books-final §2.5, §5.12): a device registered against ZIMRA's test
 * environment signs test data, not supplies ZIMRA holds. The owner purges
 * it: every invoice and credit note it signed is deleted for good (each as
 * permanent delete does, its snapshot in the audit trail), then its fiscal
 * days once nothing is left on them. A till sale or a school fee receipt it
 * signed is its module's to remove, so it is listed as skipped with why.
 * One `books.fiscal-device.purged` event keeps the device, its days and
 * every record as they were, before anything goes.
 *
 * Never on a live device: `isTestDevice` is off unless the owner turned it on.
 */

export type PurgeResult = {
  device: string;
  auditEventId: string;
  purged: Array<{ kind: UndoKind; id: string; label: string; auditEventId: string }>;
  skipped: Array<{ id: string; label: string; why: string }>;
  fiscalDaysRemoved: number;
};

export async function purgeTestDevice(actor: BooksActor, providerConfigId: string, input: { reason: string | null | undefined }, now = new Date()): Promise<PurgeResult> {
  const may = canDo(actor, "delete.posted", {});
  if (!may.allowed) throw new UndoRefused("Only the owner can purge a test device's documents.", 403);
  const reason = reasonOf(input.reason);
  if (!reason) throw new UndoRefused("Say why, in a few words. The reason is kept in the audit trail.", 400);
  const device = await prisma.fiscalisationProviderConfig.findFirst({
    where: { id: providerConfigId, companyId: actor.companyId },
    select: { id: true, providerKey: true, deviceId: true, serialNumber: true, isTestDevice: true, isActive: true },
  });
  if (!device) throw new UndoRefused("That fiscal device is not here any more.", 404);
  const name = device.deviceId ? `Device ${device.deviceId}` : device.providerKey;
  if (!device.isTestDevice) throw new UndoRefused(`${name} is not marked as a test device, so what it signed is held by ZIMRA and is never purged.`);

  const days = await prisma.fiscalDay.findMany({ where: { companyId: actor.companyId, providerConfigId: device.id }, select: { id: true, fiscalDayNo: true, status: true, openedAt: true, closedAt: true } });
  const receipts = await prisma.fiscalReceipt.findMany({
    where: { companyId: actor.companyId, OR: [{ fiscalDayId: { in: days.map((day) => day.id) } }, { providerKey: device.providerKey, fiscalDayId: null }] },
    select: { id: true, invoiceId: true, creditNoteId: true, retailSaleId: true, schoolReceiptId: true, receiptGlobalNo: true, fiscalNumber: true, status: true, fiscalDayId: true },
  });

  await writePlatformAuditEvent({
    companyId: actor.companyId,
    actorId: actor.userId,
    eventType: "books.fiscal-device.purged",
    entityType: "FiscalisationProviderConfig",
    entityId: device.id,
    reason,
    payload: { by: auditActor(actor), at: now.toISOString(), device, fiscalDays: days, fiscalReceipts: receipts },
  });
  const event = await prisma.platformAuditEvent.findFirst({ where: { companyId: actor.companyId, eventType: "books.fiscal-device.purged", entityId: device.id }, orderBy: { createdAt: "desc" }, select: { id: true } });

  const result: PurgeResult = { device: name, auditEventId: event!.id, purged: [], skipped: [], fiscalDaysRemoved: 0 };
  // Credit notes before the invoices they cite: an invoice's delete takes its notes with it.
  const targets: Array<{ kind: UndoKind; id: string }> = [
    ...receipts.filter((row) => row.creditNoteId).map((row) => ({ kind: "credit-note" as const, id: row.creditNoteId! })),
    ...receipts.filter((row) => row.invoiceId).map((row) => ({ kind: "invoice" as const, id: row.invoiceId! })),
  ];
  for (const target of targets) {
    try {
      const done = await deleteDocument(actor, target.kind, target.id, { reason: `Test device purge: ${reason}` }, now);
      result.purged.push({ kind: target.kind, id: target.id, label: done.label, auditEventId: done.auditEventId });
    } catch (error) {
      const refused = asUndoRefused(error);
      // A credit note already gone with its invoice is not a skip.
      if (refused?.status === 404) continue;
      result.skipped.push({ id: target.id, label: target.kind, why: refused?.message ?? (error instanceof Error ? error.message : "It could not be deleted.") });
    }
  }
  for (const row of receipts.filter((row) => row.retailSaleId || row.schoolReceiptId)) {
    result.skipped.push({
      id: row.retailSaleId ?? row.schoolReceiptId!,
      label: row.fiscalNumber ?? `Fiscal receipt ${row.receiptGlobalNo ?? ""}`.trim(),
      why: row.retailSaleId ? "A till sale is removed from Retail, which owns the drawer and the stock." : "A fee receipt is removed from Schools → Fees, which owns the family's account.",
    });
  }

  // The device's days go once nothing it signed is left on them; their numbers are never reused on a live device.
  for (const day of days) {
    const left = await prisma.fiscalReceipt.count({ where: { fiscalDayId: day.id } });
    if (left > 0) continue;
    await prisma.fiscalDay.delete({ where: { id: day.id } }).catch((error: unknown) => {
      throw asUndoRefused(error) ?? error;
    });
    result.fiscalDaysRemoved += 1;
  }
  return result;
}

/** D18's switch: the owner marks a device as ZIMRA's test environment, or not, with a reason. */
export async function markTestDevice(actor: BooksActor, providerConfigId: string, input: { isTestDevice: boolean; reason: string | null | undefined }) {
  if (!canDo(actor, "delete.posted", {}).allowed) throw new UndoRefused("Only the owner can mark a fiscal device as a test device.", 403);
  const reason = reasonOf(input.reason);
  if (!reason) throw new UndoRefused("Say why, in a few words. The reason is kept in the audit trail.", 400);
  const device = await prisma.fiscalisationProviderConfig.findFirst({ where: { id: providerConfigId, companyId: actor.companyId }, select: { id: true, isTestDevice: true } });
  if (!device) throw new UndoRefused("That fiscal device is not here any more.", 404);
  const updated = await prisma.fiscalisationProviderConfig.update({ where: { id: device.id }, data: { isTestDevice: input.isTestDevice }, select: { id: true, isTestDevice: true } });
  await writePlatformAuditEvent({
    companyId: actor.companyId,
    actorId: actor.userId,
    eventType: "books.fiscal-device.test-mode",
    entityType: "FiscalisationProviderConfig",
    entityId: device.id,
    reason,
    payload: { by: auditActor(actor), from: device.isTestDevice, to: input.isTestDevice },
  });
  return updated;
}

export type FiscalDeviceRow = { id: string; name: string; deviceId: string | null; isTestDevice: boolean; isActive: boolean };

/** The workspace's fiscal devices, for the owner's test-device switch and purge on Management's fiscal device page. */
export async function fiscalDevicesFor(actor: BooksActor): Promise<FiscalDeviceRow[]> {
  if (!canDo(actor, "delete.posted", {}).allowed) throw new UndoRefused("Only the owner sees the test-device switch.", 403);
  const rows = await prisma.fiscalisationProviderConfig.findMany({
    where: { companyId: actor.companyId },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: { id: true, providerKey: true, deviceId: true, isTestDevice: true, isActive: true },
  });
  return rows.map((row) => ({ id: row.id, name: row.deviceId ? `Device ${row.deviceId}` : row.providerKey, deviceId: row.deviceId, isTestDevice: row.isTestDevice, isActive: row.isActive }));
}

export type PurgePlan = {
  device: string;
  isTestDevice: boolean;
  /** What the purge deletes for good, each as permanent delete does. */
  remove: Array<{ kind: UndoKind; id: string; label: string }>;
  /** What it leaves, and why: a till sale or fee receipt is its module's; a rule refuses the rest. */
  skipped: Array<{ id: string; label: string; why: string }>;
  fiscalDays: number;
};

/** What a purge would do, read without changing anything: the confirm dialog lists it before the owner presses Purge. */
export async function planPurge(actor: BooksActor, providerConfigId: string, now = new Date()): Promise<PurgePlan> {
  if (!canDo(actor, "delete.posted", {}).allowed) throw new UndoRefused("Only the owner can purge a test device's documents.", 403);
  const device = await prisma.fiscalisationProviderConfig.findFirst({
    where: { id: providerConfigId, companyId: actor.companyId },
    select: { id: true, providerKey: true, deviceId: true, isTestDevice: true },
  });
  if (!device) throw new UndoRefused("That fiscal device is not here any more.", 404);
  const name = device.deviceId ? `Device ${device.deviceId}` : device.providerKey;
  const days = await prisma.fiscalDay.findMany({ where: { companyId: actor.companyId, providerConfigId: device.id }, select: { id: true } });
  const receipts = await prisma.fiscalReceipt.findMany({
    where: { companyId: actor.companyId, OR: [{ fiscalDayId: { in: days.map((day) => day.id) } }, { providerKey: device.providerKey, fiscalDayId: null }] },
    select: { invoiceId: true, creditNoteId: true, retailSaleId: true, schoolReceiptId: true, receiptGlobalNo: true, fiscalNumber: true },
  });
  const plan: PurgePlan = { device: name, isTestDevice: device.isTestDevice, remove: [], skipped: [], fiscalDays: days.length };
  const targets: Array<{ kind: UndoKind; id: string }> = [
    ...receipts.filter((row) => row.invoiceId).map((row) => ({ kind: "invoice" as const, id: row.invoiceId! })),
    ...receipts.filter((row) => row.creditNoteId).map((row) => ({ kind: "credit-note" as const, id: row.creditNoteId! })),
  ];
  for (const target of targets) {
    const doc = await loadDoc(actor.companyId, target.kind, target.id);
    if (!doc) continue;
    // A test device's documents are purged as if unsigned (D18); every other rule of permanent delete stands.
    const refusal = device.isTestDevice ? deleteRefusal({ ...doc, testDevice: true }, await contextFor(actor.companyId, doc, now)) : `${name} is not marked as a test device.`;
    if (refusal) plan.skipped.push({ id: target.id, label: doc.label, why: refusal });
    else plan.remove.push({ kind: target.kind, id: target.id, label: doc.label });
  }
  for (const row of receipts.filter((row) => row.retailSaleId || row.schoolReceiptId)) {
    plan.skipped.push({
      id: row.retailSaleId ?? row.schoolReceiptId!,
      label: row.fiscalNumber ?? `Fiscal receipt ${row.receiptGlobalNo ?? ""}`.trim(),
      why: row.retailSaleId ? `A ${UNDO_NOUN["retail-sale"].noun} is removed from Retail, which owns the drawer and the stock.` : "A fee receipt is removed from Schools → Fees, which owns the family's account.",
    });
  }
  return plan;
}
