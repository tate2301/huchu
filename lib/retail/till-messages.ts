import { prisma } from "@/lib/prisma";

/**
 * Messages for the person at the till (FLR-09): their unread staff messages
 * (ADM-02's "Send a message", the shift record's "Message the cashier") and
 * cash-up sign-offs (FLR-05). "Who is selling?" shows only how many wait under
 * a person's chip; the text shows once they have signed in with their PIN,
 * because the counter is shared.
 */

export const TILL_MESSAGE_TYPES = ["RETAIL_STAFF_MESSAGE", "RETAIL_SHIFT_SIGNED_OFF"] as const;

export type TillPersonMessage = { id: string; title: string; summary: string; at: string };

const unreadFor = (companyId: string) => ({
  isRead: false,
  isArchived: false,
  notification: { companyId, type: { in: [...TILL_MESSAGE_TYPES] } },
});

/** Unread till messages per person, for the "Who is selling?" chips. */
export async function unreadTillMessages(companyId: string, userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.notificationRecipient.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, ...unreadFor(companyId) },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.userId, row._count._all]));
}

/** The signed-in person's unread till messages, newest first. `id` is the notification's. */
export async function tillMessages(companyId: string, userId: string): Promise<TillPersonMessage[]> {
  const rows = await prisma.notificationRecipient.findMany({
    where: { userId, ...unreadFor(companyId) },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { notification: { select: { id: true, title: true, summary: true, createdAt: true } } },
  });
  return rows.map(({ notification }) => ({
    id: notification.id,
    title: notification.title,
    summary: notification.summary,
    at: notification.createdAt.toISOString(),
  }));
}

/** "Got it": marks the person's own till messages read. Anyone else's, or another kind, is left alone. */
export async function readTillMessages(companyId: string, userId: string, ids: string[], now: Date = new Date()): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await prisma.notificationRecipient.updateMany({
    where: { userId, notificationId: { in: ids }, ...unreadFor(companyId) },
    data: { isRead: true, readAt: now },
  });
  return result.count;
}
