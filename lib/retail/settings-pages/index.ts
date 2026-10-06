import { companyPage } from "./company";
import { fiscalPage } from "./fiscal";
import { paymentsPage } from "./payments";
import { postingPage } from "./posting";
import { receiptsPage } from "./receipts";
import { tillRulesPage } from "./till-rules";
import type { SettingsPage } from "./types";

export type {
  SettingsAsideSection,
  SettingsLastChanged,
  SettingsPage,
  SettingsResponse,
  SettingsSaved,
  SettingsSection,
} from "./types";

/**
 * Every settings page, by the `[page]` of `/api/v2/retail/settings/[page]`.
 * The setup and admin units add theirs (`payments`, `till-rules`, …).
 */
export const SETTINGS_PAGES: Record<string, SettingsPage> = {
  company: companyPage,
  fiscal: fiscalPage,
  payments: paymentsPage,
  posting: postingPage,
  receipts: receiptsPage,
  "till-rules": tillRulesPage,
};

export function settingsPage(key: string): SettingsPage | null {
  return Object.prototype.hasOwnProperty.call(SETTINGS_PAGES, key) ? SETTINGS_PAGES[key]! : null;
}

/** Every field the page draws, by id. */
export function settingsFields(page: SettingsPage) {
  return page.sections.flatMap((section) => section.fields);
}

/** "Cases and singles", for an audit line or a message. */
export function settingsFieldLabel(page: SettingsPage, id: string): string {
  return settingsFields(page).find((field) => field.id === id)?.l ?? page.labels?.[id] ?? id;
}

/** Whether the page changes this field (anything else it draws is `read`). */
export function isSettingsFieldEditable(page: SettingsPage, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(page.schema.shape, id);
}

/**
 * Check a save's changes against the page: each must be a field the page
 * changes and pass its rule. Returns the parsed values, or a sentence per
 * refused field.
 */
export function checkSettingsChanges(
  page: SettingsPage,
  changes: Record<string, unknown>,
): { ok: true; values: Record<string, unknown> } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(changes)) {
    if (!isSettingsFieldEditable(page, id)) {
      const drawn = settingsFields(page).some((field) => field.id === id);
      fieldErrors[id] = drawn
        ? `${settingsFieldLabel(page, id)} is not changed on this page.`
        : "This page has no such field.";
      continue;
    }
    const parsed = page.schema.shape[id]!.safeParse(value);
    if (parsed.success) values[id] = parsed.data;
    else fieldErrors[id] = parsed.error.issues[0]?.message ?? `Check ${settingsFieldLabel(page, id).toLowerCase()}.`;
  }
  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: true, values };
}
