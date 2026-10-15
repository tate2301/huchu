import type { PrismaClient } from "@prisma/client";

import { buildRouting, type Preference, type Received, type Routing } from "./routing";

const DAYS = 30;
/** Enough rows to name everyone a kind reached; a busy month past it is read from its newest. */
const MOST = 20_000;

const parse = (json: string | null): Record<string, unknown> | null => {
  if (!json) return null;
  try {
    const value = JSON.parse(json);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Who each kind reached in the workspace over the last 30 days, and who of them is emailed. */
export async function readRouting(
  db: Pick<PrismaClient, "notificationRecipient" | "user" | "userNotificationPreference">,
  companyId: string,
  enabledFeatures: readonly string[],
  now: Date = new Date(),
): Promise<Routing> {
  const since = new Date(now.getTime() - DAYS * 86_400_000);
  const rows = await db.notificationRecipient.findMany({
    where: { notification: { companyId, createdAt: { gte: since } } },
    select: { userId: true, notification: { select: { type: true, payloadJson: true } } },
    orderBy: { createdAt: "desc" },
    take: MOST,
  });
  const ids = [...new Set(rows.map((row) => row.userId))];
  const [users, preferences] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids }, companyId }, select: { id: true, name: true } }),
    db.userNotificationPreference.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, emailEnabled: true, hrEnabled: true, opsEnabled: true, crmEnabled: true },
    }),
  ]);
  const received: Received[] = rows.map((row) => ({
    userId: row.userId,
    type: row.notification.type,
    payload: parse(row.notification.payloadJson),
  }));
  return buildRouting({
    received,
    names: new Map(users.map((user) => [user.id, user.name])),
    preferences: new Map(preferences.map(({ userId, ...pref }): [string, Preference] => [userId, pref])),
    enabledFeatures,
    days: DAYS,
  });
}
