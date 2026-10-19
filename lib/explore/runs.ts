import type { ExploreRunResult, PrismaClient } from "@prisma/client";

import { EXPLORE_ROLES } from "./roles";

/**
 * What Explore keeps (approved 15 Oct): who may use it (`ExploreSettings`)
 * and every question run as `explore_reader` (`ExploreQuestionRun`), read for
 * Management → Explore and for each person's History in Explore's panel.
 */

type Db = Pick<PrismaClient, "exploreSettings" | "exploreQuestionRun">;

/** Owners always use Explore: the role that decides who else may cannot shut itself out. */
const ALWAYS = "SUPERADMIN";

export function withOwners(roles: readonly string[]): string[] {
  return [...new Set([ALWAYS, ...roles])];
}

/** The roles that may use Explore in this workspace: Management → Explore's choice, or owners and managers. */
export async function exploreRoles(db: Pick<PrismaClient, "exploreSettings">, companyId: string): Promise<string[]> {
  const settings = await db.exploreSettings.findUnique({ where: { companyId }, select: { roles: true } });
  return withOwners(settings?.roles ?? EXPLORE_ROLES);
}

export async function saveExploreRoles(db: Pick<PrismaClient, "exploreSettings">, companyId: string, roles: readonly string[], userId: string): Promise<string[]> {
  const kept = withOwners(roles);
  await db.exploreSettings.upsert({
    where: { companyId },
    create: { companyId, roles: kept, updatedById: userId },
    update: { roles: kept, updatedById: userId },
  });
  return kept;
}

/** A question as a list names it: its title, or the first line of its SQL. */
export function questionLine(title: string | null, sql: string): string {
  const named = title?.trim();
  if (named && named !== "Untitled question") return named;
  const first = sql.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("--"));
  return first ?? sql.trim();
}

export type HistoryEntry = {
  id: string;
  line: string;
  title: string | null;
  sql: string;
  /** When it last ran, ISO. */
  at: string;
  rows: number | null;
  result: ExploreRunResult;
};

const HISTORY_LENGTH = 40;

/**
 * A person's own questions in this workspace, newest first. A question run
 * again (the same SQL) is listed once, at its latest run; a question refused
 * before it ran never ran, so it is not listed.
 */
export function historyOf(runs: ReadonlyArray<{ id: string; title: string | null; sql: string; createdAt: Date; rows: number | null; result: ExploreRunResult }>): HistoryEntry[] {
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  for (const run of runs) {
    if (run.result === "REFUSED") continue;
    const key = run.sql.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: run.id, line: questionLine(run.title, run.sql), title: run.title, sql: run.sql, at: run.createdAt.toISOString(), rows: run.rows, result: run.result });
    if (out.length === HISTORY_LENGTH) break;
  }
  return out;
}

export async function readHistory(db: Db, companyId: string, userId: string): Promise<HistoryEntry[]> {
  const runs = await db.exploreQuestionRun.findMany({
    where: { companyId, userId, result: { not: "REFUSED" } },
    orderBy: { createdAt: "desc" },
    take: 400,
    select: { id: true, title: true, sql: true, createdAt: true, rows: true, result: true },
  });
  return historyOf(runs);
}

export type RunRow = {
  id: string;
  at: string;
  who: string;
  whoImage?: string | null;
  line: string;
  readFrom: string[];
  rows: number | null;
  ms: number | null;
  result: ExploreRunResult;
  reason: string | null;
};

/** Management → Explore: today's questions, newest first, and this month's count with the changes refused. */
export async function readRuns(db: Db, companyId: string, now = new Date()): Promise<{ today: RunRow[]; month: { ran: number; refusedChanges: number } }> {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const [today, ran, refusedChanges] = await Promise.all([
    db.exploreQuestionRun.findMany({
      where: { companyId, createdAt: { gte: day } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, createdAt: true, title: true, sql: true, readFrom: true, rows: true, ms: true, result: true, reason: true, user: { select: { name: true, image: true } } },
    }),
    db.exploreQuestionRun.count({ where: { companyId, createdAt: { gte: month } } }),
    db.exploreQuestionRun.count({ where: { companyId, createdAt: { gte: month }, result: "REFUSED", reason: { startsWith: "Explore only reads" } } }),
  ]);
  return {
    today: today.map((run) => ({
      id: run.id,
      at: run.createdAt.toISOString(),
      who: run.user?.name ?? "Someone who has left",
      whoImage: run.user?.image ?? null,
      line: questionLine(run.title, run.sql),
      readFrom: run.readFrom,
      rows: run.rows,
      ms: run.ms,
      result: run.result,
      reason: run.reason,
    })),
    month: { ran, refusedChanges },
  };
}

/** "142 rows · 0.04 s", "refused, a change", "stopped at 10 s". */
export function runResult(run: Pick<RunRow, "rows" | "ms" | "result" | "reason">): { text: string; tone: "plain" | "warning" | "danger" } {
  if (run.result === "OK") {
    const rows = run.rows ?? 0;
    return { text: `${rows.toLocaleString("en-GB")} ${rows === 1 ? "row" : "rows"} · ${((run.ms ?? 0) / 1000).toFixed(2)} s`, tone: "plain" };
  }
  if (run.result === "REFUSED") return { text: run.reason?.startsWith("Explore only reads") ? "refused, a change" : "refused", tone: "warning" };
  if (run.result === "TIMEOUT") return { text: "stopped at the time limit", tone: "danger" };
  return { text: "did not run", tone: "danger" };
}
