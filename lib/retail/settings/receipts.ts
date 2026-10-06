import { isEmailConfigured } from "@/lib/email/send";
import { isWhatsAppConfigured } from "@/lib/messaging/whatsapp";
import { prisma } from "@/lib/prisma";
import { receiptPreview, receiptWire, saveReceiptSettings, type ReceiptSettingsPatch } from "@/lib/retail/receipt-settings";
import { SEND_BY_WORDS, sendByOf } from "@/lib/retail/receipt-words";

import type { SettingsStore } from "./types";

/**
 * The Receipts page's values (W-07): `RetailReceiptSettings` as the page
 * writes them — the top of the receipt as printed (the shop's own, else its
 * name and address), copies "1"/"2", "Also send by" in words — and, read
 * only, what the preview and the hints need.
 */

/** The page's checked changes as a settings patch; an emptied top or bottom goes back to none. */
export function receiptsPatch(changes: Record<string, unknown>): ReceiptSettingsPatch {
  const patch: ReceiptSettingsPatch = {};
  if (typeof changes.header === "string") patch.header = changes.header || null;
  if (typeof changes.footer === "string") patch.footer = changes.footer || null;
  if (typeof changes.showVatNumber === "boolean") patch.showVatNumber = changes.showVatNumber;
  if (typeof changes.showLicenceNumber === "boolean") patch.showLicenceNumber = changes.showLicenceNumber;
  if (typeof changes.printLogo === "boolean") patch.printLogo = changes.printLogo;
  if (changes.copies === "1" || changes.copies === "2") patch.copies = changes.copies === "2" ? 2 : 1;
  if (typeof changes.alsoSendBy === "string") {
    const sendBy = sendByOf(changes.alsoSendBy);
    if (sendBy) patch.alsoSendBy = sendBy;
  }
  return patch;
}

export const receiptsSettings: SettingsStore = {
  async load(companyId) {
    const [wire, preview] = await Promise.all([receiptWire(companyId), receiptPreview(companyId)]);
    return {
      header: wire.header,
      footer: wire.footer,
      showVatNumber: wire.showVatNumber,
      showLicenceNumber: wire.showLicenceNumber,
      printLogo: wire.printLogo,
      copies: String(wire.copies),
      alsoSendBy: SEND_BY_WORDS[wire.alsoSendBy],
      // Read-only: what the receipt prints beside the settings, and the sale it previews.
      vatNumber: wire.vatNumber,
      licenceNumber: wire.licenceNumber,
      logoUrl: wire.logoUrl,
      liquor: wire.liquor,
      preview,
      whatsAppReady: isWhatsAppConfigured(),
      emailReady: isEmailConfigured(),
    };
  },

  async save(tx, actor, changes) {
    const patch = receiptsPatch(changes);
    if (Object.keys(patch).length > 0) await saveReceiptSettings(tx, actor, patch);
  },

  /** The page's last save, or the row's own stamp when it is newer (settings written before the page existed). */
  async lastChanged(companyId, saved) {
    const row = await prisma.retailReceiptSettings.findUnique({
      where: { companyId },
      select: { updatedAt: true, updatedBy: { select: { name: true } } },
    });
    if (!row?.updatedBy) return saved;
    if (saved && new Date(saved.at).getTime() >= row.updatedAt.getTime() - 1000) return saved;
    return { by: row.updatedBy.name ?? "Someone", at: row.updatedAt.toISOString() };
  },
};
