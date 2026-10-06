import { fiscalRegistration, FiscalRefused, loadFiscalPage, saveFiscalPatch, type FiscalPatch } from "@/lib/retail/fiscal-settings";

import { SettingsRefused, type SettingsStore } from "./types";

/**
 * The Fiscal device page's values (W-06): the device's numbers, the two rules
 * in words, and — read only — the connection line, the open day and the
 * newest five days. Saved by `saveFiscalPatch` inside the settings save; the
 * activation key goes to Connect, never here.
 */

const FIELDS = ["deviceId", "serialNumber", "taxpayerNumber", "vatNumber", "dayClose", "whenUnreachable"] as const;

export const fiscalSettings: SettingsStore = {
  load: (companyId) => loadFiscalPage(companyId),

  async save(tx, actor, changes) {
    const patch: FiscalPatch = {};
    for (const field of FIELDS) {
      if (typeof changes[field] === "string") patch[field] = changes[field] as string;
    }
    try {
      await saveFiscalPatch(tx, actor, patch);
    } catch (error) {
      if (error instanceof FiscalRefused && error.status === 409 && error.code) {
        throw new SettingsRefused(error.message, { status: 409, code: error.code });
      }
      throw error;
    }
  },

  /** The page's last save, or the device's registration when that is newer ("Registered by …"). */
  async lastChanged(companyId, saved) {
    const registered = await fiscalRegistration(companyId);
    if (!registered) return saved;
    if (saved && new Date(saved.at).getTime() >= new Date(registered.at).getTime()) return saved;
    return { ...registered, what: "registered" };
  },
};
