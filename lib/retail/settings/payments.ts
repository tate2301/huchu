import type { RetailRateSource } from "@prisma/client";

import {
  latestZigRate,
  loadPaymentSettings,
  savePaymentSettings,
  type PaymentSettingsPatch,
} from "@/lib/retail/payment-settings";
import {
  ECOCASH_METHOD_WORDS,
  ecocashMethodOf,
  RATE_BY_HAND,
  RATE_RBZ_DAILY,
  ZIG_ROUNDING,
  type TenderKey,
} from "@/lib/retail/payment-words";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import { rbzRateAvailable } from "@/lib/retail/rbz-rate";
import type { SettingsLastChanged } from "@/lib/retail/settings-pages";
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
  if (typeof changes.ecocashMethod === "string") {
    const method = ecocashMethodOf(changes.ecocashMethod);
    if (method) patch.ecocashMethod = method;
  }
  if (typeof changes.ecocashMerchantCode === "string") {
    patch.ecocashMerchantCode = changes.ecocashMerchantCode.trim() || null;
  }
  if (typeof changes.ecocashPhone === "string") {
    patch.ecocashPhone = changes.ecocashPhone.trim() || null;
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
      ecocashMethod: ECOCASH_METHOD_WORDS[settings.ecocashMethod],
      ecocashMerchantCode: settings.ecocashMerchantCode ?? "",
      ecocashPhone: settings.ecocashPhone ?? "",
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

  /**
   * The newest of: the rate's change ("Rate changed by …"), a change of how
   * the rate is updated (the ZiG rate action's, audited on its own), and the
   * page's last save ("Last changed by …").
   */
  async lastChanged(companyId, saved) {
    const [zig, source] = await Promise.all([latestZigRate(companyId), lastSourceChange(companyId)]);
    const changes: SettingsLastChanged[] = [
      ...(saved ? [saved] : []),
      ...(source ? [source] : []),
      ...(zig ? [{ by: zig.setBy ?? "the RBZ", at: zig.setAt.toISOString(), what: "rate" as const }] : []),
    ];
    return changes.reduce<SettingsLastChanged | null>(
      (newest, change) => (!newest || new Date(change.at).getTime() > new Date(newest.at).getTime() ? change : newest),
      null,
    );
  },
};

/** Who last changed how the rate is updated, and when: `RETAIL_ZIG_RATE.SET { source }`. */
async function lastSourceChange(companyId: string): Promise<SettingsLastChanged | null> {
  const event = await prisma.platformAuditEvent.findFirst({
    where: {
      companyId,
      eventType: RETAIL_AUDIT_EVENTS.zigRateSet,
      entityType: "RetailSettings",
      entityId: "payments",
      payloadJson: { contains: '"previousSource"' },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true, actor: true, payloadJson: true },
  });
  if (!event) return null;
  const carried = /"actorName":"([^"]+)"/.exec(event.payloadJson ?? "")?.[1] ?? null;
  const user =
    !carried && event.actor ? await prisma.user.findFirst({ where: { id: event.actor }, select: { name: true } }) : null;
  return { by: carried ?? user?.name ?? "Someone", at: event.createdAt.toISOString() };
}
