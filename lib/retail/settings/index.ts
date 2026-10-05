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
import { postingSettings } from "./posting";
import { tillRulesSettings } from "./till-rules";
import type { SettingsStore } from "./types";

/**
 * The SettingsFrame contract on the server (00-foundations 4.10, C-14): one
 * `GET` and one `PATCH` per settings page, every save in one transaction with
 * one `RETAIL_SETTINGS.CHANGED` (entity `RetailSettings`, id the page).
 */

const STORES: Record<string, SettingsStore> = {
  company: companySettings,
  payments: paymentsSettings,
  posting: postingSettings,
  "till-rules": tillRulesSettings,
};

export const SETTINGS_ENTITY = "RetailSettings";

export function settingsHandler(key: string): { page: SettingsPage; store: SettingsStore } | null {
  const page = settingsPage(key);
  const store = Object.prototype.hasOwnProperty.call(STORES, key) ? STORES[key]! : null;
  return page && store ? { page, store } : null;
}

type Payload = Record<string, unknown>;

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

export async function readSettings(companyId: string, key: string, canEdit: boolean): Promise<SettingsResponse | null> {
  const handler = settingsHandler(key);
  if (!handler) return null;
  const [values, lastChanged] = await Promise.all([handler.store.load(companyId), settingsLastChanged(companyId, key)]);
  return { values, canEdit, lastChanged };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export type SettingsSaveResult =
  | ({ ok: true } & SettingsSaved)
  | { ok: false; fieldErrors: Record<string, string> };

/**
 * Save a page's changed fields. Each is checked against the page's rule;
 * fields equal to what is stored are dropped. What remains is written and
 * audited in one transaction; nothing changed writes nothing.
 */
export async function saveSettings(
  actor: RetailAuditActor,
  key: string,
  changes: Record<string, unknown>,
): Promise<SettingsSaveResult | null> {
  const handler = settingsHandler(key);
  if (!handler) return null;
  const { page, store } = handler;

  // A field a real action saves (the ZiG rate, C-14) goes to that action's endpoint, never here.
  const actionFields = Object.keys(changes).filter((field) => page.action?.fields.includes(field));
  if (actionFields.length > 0) {
    return {
      ok: false,
      fieldErrors: Object.fromEntries(
        actionFields.map((field) => [field, "This is saved on its own, not with the page."]),
      ),
    };
  }

  const checked = checkSettingsChanges(page, changes);
  if (!checked.ok) return checked;

  const before = await store.load(actor.companyId);
  const changed = Object.entries(checked.values).filter(([field, value]) => !same(before[field], value));
  if (changed.length > 0) {
    const applied = Object.fromEntries(changed);
    await prisma.$transaction(async (tx) => {
      await store.save(tx, actor, applied);
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.settingsChanged,
        entityType: SETTINGS_ENTITY,
        entityId: key,
        payload: {
          page: key,
          changes: changed.map(([field, to]) => ({
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
