import type { RetailRateSource } from "@prisma/client";

import {
  latestZigRate,
  loadPaymentSettings,
  savePaymentSettings,
  type PaymentSettingsPatch,
} from "@/lib/retail/payment-settings";
import { RATE_BY_HAND, RATE_RBZ_DAILY, ZIG_ROUNDING, type TenderKey } from "@/lib/retail/payment-words";
import { rbzRateAvailable } from "@/lib/retail/rbz-rate";
import { TENDER_FIELD_IDS } from "@/lib/retail/settings-pages/payments";

import { SettingsRefused, type SettingsStore } from "./types";

/**
 * The Payments page's values (W-05): `RetailPaymentSettings`, and the ZiG
 * rate from `CurrencyRate`. The rate and how it is updated are shown here but
 * saved by their own action (`POST /api/v2/retail/payments/zig-rate`, C-14).
 */

const SOURCE_WORDS: Record<RetailRateSource, string> = { MANUAL: RATE_BY_HAND, RBZ_DAILY: RATE_RBZ_DAILY };

/** The page's changes as a settings patch; the rate and its source are the action's. */
export function paymentsPatch(changes: Record<string, unknown>): PaymentSettingsPatch {
  const patch: PaymentSettingsPatch = {};
  const tenders: Partial<Record<TenderKey, boolean>> = {};
  for (const id of TENDER_FIELD_IDS) {
    if (typeof changes[id] === "boolean") tenders[id] = changes[id] as boolean;
  }
  if (Object.keys(tenders).length > 0) patch.tenders = tenders;
  if (typeof changes.zigRounding === "string") {
    patch.zigChangeRounding = ZIG_ROUNDING.find((option) => option.label === changes.zigRounding)?.step;
  }
  if (typeof changes.ecocashMerchantCode === "string") {
    patch.ecocashMerchantCode = changes.ecocashMerchantCode.trim() || null;
  }
  if (typeof changes.ecocashDisplayName === "string") {
    patch.ecocashDisplayName = changes.ecocashDisplayName.trim().toUpperCase() || null;
  }
  return patch;
}

export const paymentsSettings: SettingsStore = {
  async load(companyId) {
    const [settings, zig] = await Promise.all([loadPaymentSettings(companyId), latestZigRate(companyId)]);
    return {
      ...settings.tenders,
      zigRate: zig?.rate ?? "",
      zigSource: SOURCE_WORDS[settings.zigRateSource],
      zigRounding: ZIG_ROUNDING.find((option) => option.step === settings.zigChangeRounding)?.label ?? "Nearest 1",
      ecocashMerchantCode: settings.ecocashMerchantCode ?? "",
      ecocashDisplayName: settings.ecocashDisplayName ?? "",
      zigSetAt: zig?.setAt.toISOString() ?? null,
      zigSetBy: zig?.setBy ?? null,
      rbzAvailable: rbzRateAvailable(),
    };
  },

  async save(tx, actor, changes) {
    const before = await loadPaymentSettings(actor.companyId, tx);
    const patch = paymentsPatch(changes);

    const tenders = { ...before.tenders, ...patch.tenders };
    if (!Object.values(tenders).some(Boolean)) {
      throw new SettingsRefused("Take at least one tender.", { status: 400, field: "cashUsd" });
    }
    if (Object.keys(patch).length > 0) await savePaymentSettings(tx, actor, patch);
    // Turning ZiG cash on needs a rate the till can take it at.
    if (patch.tenders?.cashZig === true && !(await latestZigRate(actor.companyId, tx))) {
      throw new SettingsRefused("Set today’s rate to take ZiG.", { status: 400, field: "cashZig" });
    }
  },

  /** The rate's change when it is the latest, else the page's last save. */
  async lastChanged(companyId, saved) {
    const zig = await latestZigRate(companyId);
    if (!zig) return saved;
    if (saved && new Date(saved.at).getTime() > zig.setAt.getTime()) return saved;
    return { by: zig.setBy ?? "the RBZ", at: zig.setAt.toISOString(), what: "rate" };
  },
};
