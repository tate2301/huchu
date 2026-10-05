import {
  checkSettingsChanges,
  isSettingsFieldEditable,
  type SettingsPage,
  type SettingsResponse,
  type SettingsSection,
} from "@/lib/retail/settings-pages";
import { formatDay } from "@/lib/workspace/format";

/**
 * The rules of a settings page that are not drawing (00-foundations 5.10):
 * what changed, which sections show, what the save bar says.
 */

/** The React Query key of a page's `GET`; every reader of the page's values shares it. */
export const settingsQueryKey = (page: string) => ["retail-settings", page] as const;

/** "Saved just now." holds for this long after a save. */
export const JUST_SAVED_MS = 60_000;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** The fields this page changes whose value differs from what is saved, as `{ field: value }`. */
export function changedValues(
  page: SettingsPage,
  saved: Record<string, unknown>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(values)) {
    if (isSettingsFieldEditable(page, field) && !same(saved[field], value)) changes[field] = value;
  }
  return changes;
}

/** Sections whose `when` holds. Values in a hidden section are kept, and still saved. */
export function shownSettingsSections(page: SettingsPage, values: Record<string, unknown>): SettingsSection[] {
  return page.sections.filter((section) => !section.when || values[section.when[0]] === section.when[1]);
}

/** The client's check before sending: the page's own rules, one sentence per field. */
export function checkBeforeSave(page: SettingsPage, changes: Record<string, unknown>): Record<string, string> {
  const checked = checkSettingsChanges(page, changes);
  return checked.ok ? {} : checked.fieldErrors;
}

/** "2 October" this year, "2 October 2025" before it. */
function dayWords(at: string, now: Date): string {
  const day = formatDay(at);
  const year = formatDay(now).split(" ").pop();
  return day.endsWith(` ${year}`) ? day.slice(0, -(year!.length + 1)) : day;
}

/**
 * The clean save bar's line: the page's "who can change this" for a role
 * that cannot, "Saved just now." for a minute after a save, else who last
 * changed it and when, or nothing when nobody has.
 */
export function cleanLine(input: {
  page: SettingsPage;
  canEdit: boolean;
  lastChanged: SettingsResponse["lastChanged"];
  savedAt: number | null;
  now: Date;
}): string | null {
  if (!input.canEdit) return input.page.whoCanChange;
  if (input.savedAt !== null && input.now.getTime() - input.savedAt < JUST_SAVED_MS) return "Saved just now.";
  if (!input.lastChanged) return null;
  return `Last changed by ${input.lastChanged.by}, ${dayWords(input.lastChanged.at, input.now)}.`;
}
