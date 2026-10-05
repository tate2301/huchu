import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { readRecordActivity, type ActivityPage } from "@/lib/retail/record-activity";
import {
  checkSettingsChanges,
  settingsFieldLabel,
  settingsPage,
  type SettingsLastChanged,
  type SettingsPage,
  type SettingsResponse,
  type SettingsSaved,
} from "@/lib/retail/settings-pages";

import { companySettings } from "./company";
import { paymentsSettings } from "./payments";
import type { SettingsStore } from "./types";

/**
 * The SettingsFrame contract on the server (00-foundations 4.10, C-14): one
 * `GET` and one `PATCH` per settings page, every save in one transaction with
 * one `RETAIL_SETTINGS.CHANGED` (entity `RetailSettings`, id the page).
 */

const STORES: Record<string, SettingsStore> = {
  company: companySettings,
  payments: paymentsSettings,
};

export const SETTINGS_ENTITY = "RetailSettings";

export function settingsHandler(key: string): { page: SettingsPage; store: SettingsStore } | null {
  const page = settingsPage(key);
  const store = Object.prototype.hasOwnProperty.call(STORES, key) ? STORES[key]! : null;
  return page && store ? { page, store } : null;
}

type Payload = Record<string, unknown>;

/**
 * Who may change what on a page: every field with the page's `change`
 * grant; with only its `partly` grant, those fields; else nothing.
 */
export type SettingsAccess = { all: boolean; fields: string[] };

export function settingsAccess(page: SettingsPage, can: (grant: SettingsPage["change"]) => boolean): SettingsAccess {
  if (can(page.change)) return { all: true, fields: [] };
  if (page.partly && can(page.partly.can)) return { all: false, fields: page.partly.fields };
  return { all: false, fields: [] };
}

function mayChange(access: SettingsAccess, field: string): boolean {
  return access.all || access.fields.includes(field);
}

/** The latest save of the page: who and when, or null when nobody has saved it. */
async function lastSave(companyId: string, key: string): Promise<SettingsLastChanged | null> {
  const event = await prisma.platformAuditEvent.findFirst({
    where: { companyId, eventType: RETAIL_AUDIT_EVENTS.settingsChanged, entityType: SETTINGS_ENTITY, entityId: key },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true, actor: true, payloadJson: true },
  });
  if (!event) return null;
  let payload: Payload = {};
  try {
    payload = event.payloadJson ? (JSON.parse(event.payloadJson) as Payload) : {};
  } catch {
    payload = {};
  }
  const carried = typeof payload.actorName === "string" && payload.actorName ? payload.actorName : null;
  const user =
    !carried && event.actor
      ? await prisma.user.findFirst({ where: { id: event.actor }, select: { name: true } })
      : null;
  return { by: carried ?? user?.name ?? "Someone", at: event.createdAt.toISOString() };
}

/** Who last changed the page: its last save, or the store's own latest change when that is newer. */
export async function settingsLastChanged(companyId: string, key: string): Promise<SettingsLastChanged | null> {
  const saved = await lastSave(companyId, key);
  const store = settingsHandler(key)?.store;
  return store?.lastChanged ? store.lastChanged(companyId, saved) : saved;
}

export async function readSettings(companyId: string, key: string, access: SettingsAccess): Promise<SettingsResponse | null> {
  const handler = settingsHandler(key);
  if (!handler) return null;
  const [values, lastChanged] = await Promise.all([handler.store.load(companyId), settingsLastChanged(companyId, key)]);
  return {
    values,
    canEdit: access.all || access.fields.length > 0,
    ...(access.all ? {} : { editable: access.fields }),
    lastChanged,
  };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export type SettingsSaveResult =
  | ({ ok: true } & SettingsSaved)
  | { ok: false; fieldErrors: Record<string, string> }
  | { ok: false; forbidden: string };

/**
 * Save a page's changed fields. Each is checked against the page's rule;
 * fields equal to what is stored are dropped. What remains is written and
 * audited in one transaction; nothing changed writes nothing.
 */
export async function saveSettings(
  actor: RetailAuditActor,
  key: string,
  changes: Record<string, unknown>,
  access: SettingsAccess = { all: true, fields: [] },
): Promise<SettingsSaveResult | null> {
  const handler = settingsHandler(key);
  if (!handler) return null;
  const { page, store } = handler;

  const before = await store.load(actor.companyId);
  // A role may send only what it may change (the manager: the ZiG rate), whatever else it says.
  if (Object.entries(changes).some(([field, value]) => !same(before[field], value) && !mayChange(access, field))) {
    return { ok: false, forbidden: page.partly?.refused ?? "Your role cannot change these settings." };
  }

  const checked = checkSettingsChanges(page, changes);
  if (!checked.ok) return checked;

  const changed = Object.entries(checked.values).filter(([field, value]) => !same(before[field], value));
  // A change the store records itself (a new ZiG rate) is not repeated in the page's event.
  const audited = changed.filter(([field]) => !store.auditsOwn?.includes(field));
  if (changed.length > 0) {
    const applied = Object.fromEntries(changed);
    await prisma.$transaction(async (tx) => {
      await store.save(tx, actor, applied);
      if (audited.length === 0) return;
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.settingsChanged,
        entityType: SETTINGS_ENTITY,
        entityId: key,
        payload: {
          page: key,
          changes: audited.map(([field, to]) => ({
            field,
            label: settingsFieldLabel(page, field),
            from: before[field] ?? null,
            to,
          })),
        },
      });
    });
  }

  const [values, lastChanged] = await Promise.all([
    store.load(actor.companyId),
    settingsLastChanged(actor.companyId, key),
  ]);
  return { ok: true, values, lastChanged };
}

/** One page of the settings page's Activity: its saves and its related rows' events. */
export async function readSettingsActivity(
  companyId: string,
  key: string,
  paging: { page: number; size: number },
): Promise<ActivityPage | null> {
  const handler = settingsHandler(key);
  if (!handler) return null;
  return readRecordActivity(
    companyId,
    SETTINGS_ENTITY,
    key,
    {
      read: handler.page.read,
      exists: async () => true,
      related: async (company) => handler.store.related?.(company) ?? [],
    },
    paging,
  );
}
