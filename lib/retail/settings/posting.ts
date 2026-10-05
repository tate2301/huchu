import { TENDER_OPTIONS, type TenderKey } from "@/lib/retail/payment-words";
import { loadPostingState, PostingRefused, savePosting, type PostingPatch } from "@/lib/retail/posting-settings";
import { lastPostedWords, ROLE_OPTIONS, scheduleOf, SCHEDULE_WORDS } from "@/lib/retail/posting-words";

import { SettingsRefused, type SettingsStore } from "./types";

/**
 * The Posting page's values (W-65): the tender and role accounts as the
 * account fields' picked options, when it posts, "Last posted", and what the
 * aside's checks say. Saved by `savePosting` inside the settings save.
 */

const pickedId = (value: unknown): string | null =>
  value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string"
    ? (value as { id: string }).id
    : null;

export const postingSettings: SettingsStore = {
  async load(companyId) {
    const state = await loadPostingState(companyId);
    return {
      ...Object.fromEntries(state.tenders.map((tender) => [tender.key, tender.account])),
      ...Object.fromEntries(state.roles.map((role) => [role.field, role.account])),
      tendersOn: state.tenders.filter((tender) => tender.on).map((tender) => tender.key),
      rolesShown: state.roles.filter((role) => role.shown).map((role) => role.field),
      schedule: SCHEDULE_WORDS[state.schedule],
      lastPosted: lastPostedWords(state.lastRun, new Date()),
      checks: state.checks,
    };
  },

  async save(tx, actor, changes) {
    const patch: PostingPatch = {};
    for (const option of TENDER_OPTIONS) {
      const accountId = pickedId(changes[option.key]);
      if (accountId) {
        (patch.tenders ??= []).push({ key: option.key as TenderKey, accountId, field: option.key, label: option.label });
      }
    }
    for (const option of ROLE_OPTIONS) {
      const accountId = pickedId(changes[option.field]);
      if (accountId) (patch.roles ??= []).push({ role: option.role, accountId, field: option.field, label: option.label });
    }
    if (typeof changes.schedule === "string") patch.schedule = scheduleOf(changes.schedule) ?? undefined;
    try {
      await savePosting(tx, actor, patch);
    } catch (error) {
      if (error instanceof PostingRefused) throw new SettingsRefused(error.message, { status: 400, field: error.field });
      throw error;
    }
  },
};
