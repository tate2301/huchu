import type { PrismaClient } from "@prisma/client";

/** How many times a person sets a topic aside in a month before Vane offers to stop it for them. */
export const STOP_AFTER = 3;

type Db = Pick<PrismaClient, "vaneTopicStop" | "vaneItem">;
type Who = { companyId: string; userId: string };

/** The topics this person stopped for themselves: their For you leaves those cards out. */
export async function stoppedTopics(db: Pick<PrismaClient, "vaneTopicStop">, { companyId, userId }: Who): Promise<string[]> {
  const rows = await db.vaneTopicStop.findMany({ where: { companyId, userId }, orderBy: { createdAt: "desc" }, select: { topic: true } });
  return rows.map((row) => row.topic);
}

/** A card query's condition for a person's stopped topics: a card with no topic, or one they did not stop. */
export function notStopped(stopped: string[]) {
  return stopped.length ? { OR: [{ topic: null }, { topic: { notIn: stopped } }] } : {};
}

export type StopOffer = { topic: string; times: number };

/**
 * "You set aside “Short cash-up” 3 times this month. Shall I stop showing it
 * to you?": the topics this person set aside at least `STOP_AFTER` times since
 * the month began, that they have not stopped already.
 */
export async function stopOffers(db: Db, who: Who, monthStart: Date): Promise<StopOffer[]> {
  const [grouped, stopped] = await Promise.all([
    db.vaneItem.groupBy({
      by: ["topic"],
      where: { companyId: who.companyId, status: "MUTED", resolvedById: who.userId, resolvedAt: { gte: monthStart }, topic: { not: null } },
      _count: { _all: true },
    }),
    stoppedTopics(db, who),
  ]);
  return grouped
    .filter((row) => row.topic && row._count._all >= STOP_AFTER && !stopped.includes(row.topic))
    .map((row) => ({ topic: row.topic!, times: row._count._all }))
    .sort((a, b) => b.times - a.times);
}

/** "Stop it for me": this person no longer sees cards on this topic; everyone else who would, still does. */
export async function stopTopic(db: Pick<PrismaClient, "vaneTopicStop">, who: Who, topic: string): Promise<void> {
  await db.vaneTopicStop.upsert({
    where: { companyId_userId_topic: { companyId: who.companyId, userId: who.userId, topic } },
    create: { companyId: who.companyId, userId: who.userId, topic },
    update: {},
  });
}

/** "Show it again": the topic's cards come back to this person's For you. */
export async function startTopic(db: Pick<PrismaClient, "vaneTopicStop">, who: Who, topic: string): Promise<void> {
  await db.vaneTopicStop.deleteMany({ where: { companyId: who.companyId, userId: who.userId, topic } });
}
