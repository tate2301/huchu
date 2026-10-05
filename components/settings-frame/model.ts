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

/**
 * Whether this caller changes the field here: a field the page's action saves
 * (the ZiG rate) with the action's grant, any other the page changes with the
 * page's (`canEdit`).
 */
export function canChangeField(
  page: SettingsPage,
  access: { canEdit: boolean; canAct: boolean },
  id: string,
): boolean {
  if (!isSettingsFieldEditable(page, id)) return false;
  return page.action?.fields.includes(id) ? access.canAct : access.canEdit;
}

/** A save's changes split by where they go: the page's action first, then the settings `PATCH`. */
export function splitChanges(page: SettingsPage, changes: Record<string, unknown>) {
  const action: Record<string, unknown> = {};
  const settings: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(changes)) {
    if (page.action?.fields.includes(id)) action[id] = value;
    else settings[id] = value;
  }
  return { action, settings };
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
  return (
    input.page.lastChangedLine?.(input.lastChanged, input.now) ??
    `Last changed by ${input.lastChanged.by}, ${dayWords(input.lastChanged.at, input.now)}.`
  );
}
