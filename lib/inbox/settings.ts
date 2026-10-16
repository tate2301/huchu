import type { NotificationChannel, PrismaClient } from "@prisma/client";

import { ROUTING_KINDS, type RoutingKind } from "./routing";

/**
 * Who hears about what, and where (approved 15 Oct, `NotificationSetting`):
 * a kind on a channel is on or off for the whole workspace (its rule, set in
 * Management → Notifications, `userId` null) and for each person (their own,
 * set in My account → Notifications). A kind reaches a person on a channel
 * only when neither the workspace nor they turned it off; with no row it is
 * on. The senders (`lib/notifications.ts`) ask `allows` for each recipient.
 *
 * Notifications go in the app and by email. WhatsApp and the phone are
 * channels the schema knows and nothing sends by yet, so they are shown and
 * cannot be turned on.
 */

export const SENT_CHANNELS = ["IN_APP", "EMAIL"] as const satisfies readonly NotificationChannel[];
export type SentChannel = (typeof SENT_CHANNELS)[number];

export function isSentChannel(value: unknown): value is SentChannel {
  return value === "IN_APP" || value === "EMAIL";
}

export type SettingRow = { userId: string | null; kind: string; channel: NotificationChannel; enabled: boolean };

/** Whether a kind reaches this person on this channel: the workspace's rule, then their own. */
export function allows(rows: readonly SettingRow[], userId: string, kind: string, channel: NotificationChannel): boolean {
  for (const row of rows) {
    if (row.kind !== kind || row.channel !== channel || row.enabled) continue;
    if (row.userId === null || row.userId === userId) return false;
  }
  return true;
}

/** The kinds a workspace with these features can have, in the page's order. */
export function kindsFor(enabledFeatures: readonly string[]): RoutingKind[] {
  return ROUTING_KINDS.filter(
    (kind) => kind.features === null || kind.features.some((prefix) => enabledFeatures.some((feature) => feature.startsWith(prefix))),
  );
}

export type MatrixRow = RoutingKind & {
  /** Per channel sent: on for this reader. */
  on: Record<SentChannel, boolean>;
  /** Per channel sent, on a person's page: the workspace turned it off, so their switch does nothing. */
  offForAll?: Record<SentChannel, boolean>;
};

/** The workspace's rules, kind by kind. */
export function workspaceMatrix(rows: readonly SettingRow[], enabledFeatures: readonly string[]): MatrixRow[] {
  const workspace = rows.filter((row) => row.userId === null);
  return kindsFor(enabledFeatures).map((kind) => ({
    ...kind,
    on: { IN_APP: allows(workspace, "", kind.key, "IN_APP"), EMAIL: allows(workspace, "", kind.key, "EMAIL") },
  }));
}

/** One person's own choices, kind by kind, with what the workspace turned off for everyone. */
export function personalMatrix(rows: readonly SettingRow[], userId: string, enabledFeatures: readonly string[]): MatrixRow[] {
  const workspace = rows.filter((row) => row.userId === null);
  const own = rows.filter((row) => row.userId === userId);
  return kindsFor(enabledFeatures).map((kind) => ({
    ...kind,
    on: { IN_APP: allows(own, userId, kind.key, "IN_APP"), EMAIL: allows(own, userId, kind.key, "EMAIL") },
    offForAll: { IN_APP: !allows(workspace, userId, kind.key, "IN_APP"), EMAIL: !allows(workspace, userId, kind.key, "EMAIL") },
  }));
}

type Db = Pick<PrismaClient, "notificationSetting" | "$executeRaw">;

/** The workspace's rules and these people's own, for a send or a page. */
export function readSettings(db: Pick<PrismaClient, "notificationSetting">, companyId: string, userIds: readonly string[] = []): Promise<SettingRow[]> {
  return db.notificationSetting.findMany({
    where: { companyId, OR: [{ userId: null }, ...(userIds.length ? [{ userId: { in: [...userIds] } }] : [])] },
    select: { userId: true, kind: true, channel: true, enabled: true },
  });
}

/** Turns a kind on a channel on or off, for the workspace (`userId` null) or one person. One row each. */
export async function saveSetting(
  db: Db,
  input: { companyId: string; userId: string | null; kind: string; channel: SentChannel; enabled: boolean; updatedById: string },
): Promise<void> {
  // The unique index treats a null person as one value (NULLS NOT DISTINCT), so this upserts the workspace's rule too.
  await db.$executeRaw`
    INSERT INTO "NotificationSetting" ("id", "companyId", "userId", "kind", "channel", "enabled", "updatedById", "updatedAt")
    VALUES (gen_random_uuid()::text, ${input.companyId}, ${input.userId}, ${input.kind}, ${input.channel}::"NotificationChannel", ${input.enabled}, ${input.updatedById}, now())
    ON CONFLICT ("companyId", "userId", "kind", "channel")
    DO UPDATE SET "enabled" = EXCLUDED."enabled", "updatedById" = EXCLUDED."updatedById", "updatedAt" = now()`;
}

export type Policy = { quietFrom: string; quietTo: string; morningMessage: boolean; groupRepeats: boolean };

export const DEFAULT_POLICY: Policy = { quietFrom: "20:00", quietTo: "06:00", morningMessage: false, groupRepeats: true };

export async function readPolicy(db: Pick<PrismaClient, "notificationPolicy">, companyId: string): Promise<Policy> {
  const policy = await db.notificationPolicy.findUnique({
    where: { companyId },
    select: { quietFrom: true, quietTo: true, morningMessage: true, groupRepeats: true },
  });
  return policy ?? DEFAULT_POLICY;
}
