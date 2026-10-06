import { prisma } from "@/lib/prisma";
import { loadTillRules, saveTillRules, type TillRulesPatch } from "@/lib/retail/till-rules";
import {
  hoursWords,
  parseHours,
  parsePercent,
  percentWords,
  VOID_PIN_WORDS,
  voidPinRuleOf,
} from "@/lib/retail/till-rule-words";

import type { SettingsStore } from "./types";

/**
 * The Till rules page's values (W-64): `RetailTillRules`, as the page writes
 * them — money "20.00", the void rule's label, "10%", "24 hours".
 */

/** The page's checked changes as a till rules patch. */
export function tillRulesPatch(changes: Record<string, unknown>): TillRulesPatch {
  const patch: TillRulesPatch = {};
  if (typeof changes.refundPinOver === "string") patch.refundPinOver = changes.refundPinOver;
  if (typeof changes.voidPin === "string") patch.voidPin = voidPinRuleOf(changes.voidPin) ?? undefined;
  if (Array.isArray(changes.refundReasons)) patch.refundReasons = changes.refundReasons as string[];
  if (Array.isArray(changes.voidReasons)) patch.voidReasons = changes.voidReasons as string[];
  if (typeof changes.splitTender === "boolean") patch.splitTender = changes.splitTender;
  if (typeof changes.referenceRequired === "boolean") patch.referenceRequired = changes.referenceRequired;
  if (typeof changes.maxCashierDiscountPercent === "string") {
    const percent = parsePercent(changes.maxCashierDiscountPercent);
    if (percent !== null) patch.maxCashierDiscountPercent = percent.toFixed(2);
  }
  if (typeof changes.drawerOpenWithoutSale === "boolean") patch.drawerOpenWithoutSale = changes.drawerOpenWithoutSale;
  if (typeof changes.cashDropPromptOver === "string") patch.cashDropPromptOver = changes.cashDropPromptOver;
  if (typeof changes.offlineHours === "string") {
    const hours = parseHours(changes.offlineHours);
    if (hours !== null) patch.offlineHours = hours;
  }
  return patch;
}

export const tillRulesSettings: SettingsStore = {
  async load(companyId) {
    const rules = await loadTillRules(companyId);
    return {
      refundPinOver: rules.refundPinOver.toFixed(2),
      voidPin: VOID_PIN_WORDS[rules.voidPin],
      refundReasons: rules.refundReasons,
      voidReasons: rules.voidReasons,
      splitTender: rules.splitTender,
      referenceRequired: rules.referenceRequired,
      maxCashierDiscountPercent: percentWords(rules.maxCashierDiscountPercent.toFixed(2)),
      drawerOpenWithoutSale: rules.drawerOpenWithoutSale,
      cashDropPromptOver: rules.cashDropPromptOver.toFixed(2),
      offlineHours: hoursWords(rules.offlineHours),
      // Read-only: the money the limits are in, which the page labels them with.
      currency: rules.currency,
    };
  },

  async save(tx, actor, changes) {
    const patch = tillRulesPatch(changes);
    if (Object.keys(patch).length > 0) await saveTillRules(tx, actor, patch);
  },

  /** The page's last save, or the row's own stamp when it is newer (rules written before the page existed). */
  async lastChanged(companyId, saved) {
    const row = await prisma.retailTillRules.findUnique({
      where: { companyId },
      select: { updatedAt: true, updatedBy: { select: { name: true } } },
    });
    if (!row?.updatedBy) return saved;
    if (saved && new Date(saved.at).getTime() >= row.updatedAt.getTime() - 1000) return saved;
    return { by: row.updatedBy.name ?? "Someone", at: row.updatedAt.toISOString() };
  },
};
