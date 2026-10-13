import type { PrismaClient } from "@prisma/client";

/**
 * What has to change for Vane's pages to be out of date: a card raised,
 * pressed, set aside or brought back; a job queued, started, moved on or
 * finished; a plan's step ticked; Vane paused or resumed. Four aggregates,
 * cheap enough for the live stream to ask every few seconds; when the answer
 * differs from last time, the pages read again (`app/api/live`).
 */
export async function vaneSignature(
  db: Pick<PrismaClient, "vaneItem" | "vaneJob" | "vanePlanStep" | "vaneSettings">,
  companyId: string,
): Promise<string> {
  const [items, jobs, steps, settings] = await Promise.all([
    db.vaneItem.groupBy({
      by: ["status"],
      where: { companyId },
      _count: { _all: true },
      _max: { createdAt: true, resolvedAt: true },
      orderBy: { status: "asc" },
    }),
    db.vaneJob.groupBy({
      by: ["status"],
      where: { companyId },
      _count: { _all: true },
      _max: { createdAt: true, startedAt: true, finishedAt: true, runAfter: true },
      _sum: { progressDone: true },
      orderBy: { status: "asc" },
    }),
    db.vanePlanStep.groupBy({
      by: ["status"],
      where: { plan: { companyId } },
      _count: { _all: true },
      _max: { doneAt: true },
      orderBy: { status: "asc" },
    }),
    db.vaneSettings.findUnique({ where: { companyId }, select: { paused: true, updatedAt: true } }),
  ]);
  return JSON.stringify([items, jobs, steps, settings]);
}
