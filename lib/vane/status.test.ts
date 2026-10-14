import { describe, expect, it } from "vitest";

import { startOfWorkspaceDay, vaneStatus } from "./status";

type Job = {
  status: "QUEUED" | "RUNNING" | "WAITING" | "DONE" | "FAILED";
  kind?: string;
  label?: string;
  error?: string | null;
  tools?: unknown;
  createdAt: Date;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  runAfter?: Date;
};

const NOW = new Date("2026-10-13T08:00:00Z");
const at = (iso: string) => new Date(iso);

/** A stand-in for the four Vane tables, answering the queries `vaneStatus` makes from a list of jobs. */
function fakeDb(jobs: Job[], settings: { paused: boolean; updatedAt: Date; monthlyAllowance: number } | null) {
  const full = jobs.map((job) => ({ label: "A job", error: null, tools: [], startedAt: null, finishedAt: null, runAfter: job.createdAt, ...job }));
  const matches = (job: (typeof full)[number], where: Record<string, unknown>) => {
    const status = where.status as string | { in: string[] } | undefined;
    if (typeof status === "string" && job.status !== status) return false;
    if (status && typeof status === "object" && !status.in.includes(job.status)) return false;
    const startedAt = where.startedAt as { gte: Date } | undefined;
    if (startedAt && !(job.startedAt && job.startedAt >= startedAt.gte)) return false;
    const finishedAt = where.finishedAt as { gte?: Date; not?: null } | undefined;
    if (finishedAt?.gte && !(job.finishedAt && job.finishedAt >= finishedAt.gte)) return false;
    if (finishedAt && "not" in finishedAt && !job.finishedAt) return false;
    const kind = where.kind as { not: string } | undefined;
    if (kind && job.kind === kind.not) return false;
    return true;
  };
  const newest = (key: "createdAt" | "startedAt" | "finishedAt") => (a: (typeof full)[number], b: (typeof full)[number]) =>
    (b[key]?.getTime() ?? 0) - (a[key]?.getTime() ?? 0);
  return {
    vaneItem: { count: async () => 0 },
    vaneCardChoice: { findMany: async () => [] },
    vanePlan: { count: async () => 1 },
    vaneSettings: { findUnique: async () => settings },
    vaneJob: {
      count: async ({ where }: { where: Record<string, unknown> }) => full.filter((job) => matches(job, where)).length,
      findFirst: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy: Record<string, string> }) => {
        const key = Object.keys(orderBy)[0] as "createdAt" | "startedAt" | "finishedAt";
        return full.filter((job) => matches(job, where)).sort(newest(key))[0] ?? null;
      },
    },
  } as unknown as Parameters<typeof vaneStatus>[0];
}

const who = { companyId: "c", userId: "u", role: "MANAGER" };
const on = { paused: false, updatedAt: at("2026-10-13T07:20:00Z"), monthlyAllowance: 5000 };

describe("Vane's state", () => {
  it("starts the workspace's day at midnight in Harare", () => {
    expect(startOfWorkspaceDay(NOW).toISOString()).toBe("2026-10-12T22:00:00.000Z");
    expect(startOfWorkspaceDay(at("2026-10-12T23:30:00Z")).toISOString()).toBe("2026-10-12T22:00:00.000Z");
  });

  it("counts the work in progress, the open plans and what finished today", async () => {
    const status = await vaneStatus(
      fakeDb(
        [
          { status: "RUNNING", label: "Matching CBZ lines", createdAt: at("2026-10-13T07:58:00Z"), startedAt: at("2026-10-13T07:58:00Z") },
          { status: "QUEUED", createdAt: at("2026-10-13T07:59:00Z") },
          { status: "DONE", createdAt: at("2026-10-13T04:00:00Z"), startedAt: at("2026-10-13T04:00:00Z"), finishedAt: at("2026-10-13T04:01:00Z") },
          // Yesterday, in Harare: not today's.
          { status: "DONE", createdAt: at("2026-10-12T21:00:00Z"), startedAt: at("2026-10-12T21:00:00Z"), finishedAt: at("2026-10-12T21:30:00Z") },
        ],
        on,
      ),
      who,
      NOW,
    );
    expect(status.counts).toEqual({ working: 2, plans: 1, doneToday: 1, muted: 0 });
    expect(status.working).toBe(true);
    expect(status.overAllowance).toBeNull();
    expect(status.stuck).toBeNull();
  });

  it("says when it was paused", async () => {
    const status = await vaneStatus(fakeDb([], { ...on, paused: true }), who, NOW);
    expect(status.paused).toBe(true);
    expect(status.pausedAt).toBe("2026-10-13T07:20:00.000Z");
  });

  it("is over the allowance once this month's started jobs reach it, until the first of next month", async () => {
    const started = (day: number): Job => ({
      status: "DONE",
      createdAt: at(`2026-10-0${day}T06:00:00Z`),
      startedAt: at(`2026-10-0${day}T06:00:00Z`),
      finishedAt: at(`2026-10-0${day}T06:01:00Z`),
    });
    const status = await vaneStatus(fakeDb([started(1), started(2), started(3)], { ...on, monthlyAllowance: 3 }), who, NOW);
    expect(status.overAllowance).toEqual({ used: 3, allowance: 3, resetsOn: "2026-11-01" });
  });

  it("could not work out its last job: says what it was, why and what it tried", async () => {
    const status = await vaneStatus(
      fakeDb(
        [
          { status: "DONE", createdAt: at("2026-10-13T05:00:00Z"), finishedAt: at("2026-10-13T05:01:00Z") },
          {
            status: "FAILED",
            label: "Fuel spend in September",
            error: "3 receipts have no amount, so the total would be a guess.",
            tools: [{ name: "describe_table", ok: true }, { name: "run_sql", ok: false }, { name: "run_sql", ok: true }],
            createdAt: at("2026-10-13T06:00:00Z"),
            finishedAt: at("2026-10-13T06:02:00Z"),
          },
        ],
        on,
      ),
      who,
      NOW,
    );
    expect(status.stuck).toEqual({
      label: "Fuel spend in September",
      error: "3 receipts have no amount, so the total would be a guess.",
      tried: ["describe_table", "run_sql"],
      at: "2026-10-13T06:02:00.000Z",
    });
  });

  it("is not stuck once a later job finishes", async () => {
    const status = await vaneStatus(
      fakeDb(
        [
          { status: "FAILED", createdAt: at("2026-10-13T05:00:00Z"), finishedAt: at("2026-10-13T05:01:00Z"), error: "No." },
          { status: "DONE", createdAt: at("2026-10-13T06:00:00Z"), finishedAt: at("2026-10-13T06:01:00Z") },
        ],
        on,
      ),
      who,
      NOW,
    );
    expect(status.stuck).toBeNull();
  });

  it("is not stuck over a chat turn that failed; the conversation said why", async () => {
    const status = await vaneStatus(
      fakeDb(
        [
          { status: "DONE", createdAt: at("2026-10-13T05:00:00Z"), finishedAt: at("2026-10-13T05:01:00Z") },
          { status: "FAILED", kind: "chat", createdAt: at("2026-10-13T06:00:00Z"), finishedAt: at("2026-10-13T06:01:00Z"), error: "VANE_MODEL is not set." },
        ],
        on,
      ),
      who,
      NOW,
    );
    expect(status.stuck).toBeNull();
  });

  it("cannot reach the service: the newest job waits, with when it tries again and when Vane last worked", async () => {
    const status = await vaneStatus(
      fakeDb(
        [
          { status: "DONE", createdAt: at("2026-10-13T07:00:00Z"), finishedAt: at("2026-10-13T07:12:00Z") },
          { status: "WAITING", createdAt: at("2026-10-13T07:30:00Z"), runAfter: at("2026-10-13T07:46:00Z") },
        ],
        on,
      ),
      who,
      NOW,
    );
    expect(status.unreachable).toBe(true);
    expect(status.nextTryAt).toBe("2026-10-13T07:46:00.000Z");
    expect(status.lastWorkedAt).toBe("2026-10-13T07:12:00.000Z");
  });
});
