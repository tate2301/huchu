import type { RetailRateSource } from "@prisma/client";

import {
  latestZigRate,
  loadPaymentSettings,
  savePaymentSettings,
  setZigRate,
  type PaymentSettingsPatch,
} from "@/lib/retail/payment-settings";
import { RATE_BY_HAND, RATE_RBZ_DAILY, ZIG_ROUNDING, type TenderKey } from "@/lib/retail/payment-words";
import { rbzRateAvailable } from "@/lib/retail/rbz-rate";
import { TENDER_FIELD_IDS } from "@/lib/retail/settings-pages/payments";

import { SettingsRefused, type SettingsStore } from "./types";

/**
 * The Payments page's values (W-05): `RetailPaymentSettings`, and the ZiG
 * rate from `CurrencyRate` — a changed rate is a new row of its own, audited
 * `RETAIL_ZIG_RATE.SET`, so it stays out of the page's settings event.
 */

const SOURCE_WORDS: Record<RetailRateSource, string> = { MANUAL: RATE_BY_HAND, RBZ_DAILY: RATE_RBZ_DAILY };

/** The page's changes as a settings patch; the rate is not in it. */
export function paymentsPatch(changes: Record<string, unknown>): PaymentSettingsPatch {
  const patch: PaymentSettingsPatch = {};
  const tenders: Partial<Record<TenderKey, boolean>> = {};
  for (const id of TENDER_FIELD_IDS) {
    if (typeof changes[id] === "boolean") tenders[id] = changes[id] as boolean;
  }
  if (Object.keys(tenders).length > 0) patch.tenders = tenders;
  if (changes.zigSource === RATE_BY_HAND) patch.zigRateSource = "MANUAL";
  if (changes.zigSource === RATE_RBZ_DAILY) patch.zigRateSource = "RBZ_DAILY";
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
    if (patch.zigRateSource === "RBZ_DAILY" && !rbzRateAvailable()) {
      throw new SettingsRefused("The RBZ rate is not connected yet.", { status: 400, field: "zigSource" });
    }
    if (Object.keys(patch).length > 0) await savePaymentSettings(tx, actor, patch);

    if (typeof changes.zigRate === "string" && changes.zigRate.trim()) {
      if ((patch.zigRateSource ?? before.zigRateSource) === "RBZ_DAILY") {
        throw new SettingsRefused("The RBZ sets the rate while it is updated daily.", { status: 400, field: "zigRate" });
      }
      await setZigRate(tx, { actor, companyId: actor.companyId, rate: changes.zigRate.trim(), source: "MANUAL" });
    } else if (patch.tenders?.cashZig === true && !(await latestZigRate(actor.companyId, tx))) {
      // Turning ZiG cash on needs a rate the till can take it at.
      throw new SettingsRefused("Set today’s rate to take ZiG.", { status: 400, field: "zigRate" });
    }
  },

  auditsOwn: ["zigRate"],

  /** The rate's change when it is the latest, else the page's last save. */
  async lastChanged(companyId, saved) {
    const zig = await latestZigRate(companyId);
    if (!zig) return saved;
    if (saved && new Date(saved.at).getTime() > zig.setAt.getTime()) return saved;
    return { by: zig.setBy ?? "the RBZ", at: zig.setAt.toISOString(), what: "rate" };
  },
};
