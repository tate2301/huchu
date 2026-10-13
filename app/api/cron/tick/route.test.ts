/**
 * The tick end to end: it refuses a caller without the scheduler's secret, and
 * with it runs the real retail jobs against the test database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { RETAIL_JOBS } from "@/lib/retail/jobs";

import { GET } from "./route";

const SECRET = "tick-test-secret";
const previous = process.env.CRON_SECRET;

beforeAll(() => {
  process.env.CRON_SECRET = SECRET;
});

afterAll(async () => {
  process.env.CRON_SECRET = previous;
  await prisma.scheduledJobRun.deleteMany({ where: { name: { in: RETAIL_JOBS.map((job) => job.name) } } });
});

const tick = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/tick", { headers: authorization ? { authorization } : {} }));

describe("GET /api/cron/tick", () => {
  it("refuses a caller without the secret", async () => {
    expect((await tick()).status).toBe(401);
    expect((await tick("Bearer not-it")).status).toBe(401);
  });

  it("runs the due retail jobs for the scheduler", async () => {
    const response = await tick(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    const { outcomes } = (await response.json()) as { outcomes: Array<{ job: string; result: string }> };
    // The interval jobs are always due on a first tick; none of them fails on an empty workspace.
    for (const name of ["price-changes", "message-outbox", "fiscal-days"]) {
      expect(outcomes).toContainEqual(expect.objectContaining({ job: name, result: "ran" }));
    }
    expect(outcomes.filter((outcome) => outcome.result === "failed")).toEqual([]);
  }, 60_000);
});
