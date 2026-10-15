/**
 * Vane's jobs on the tick: the nightly run queues one job per workspace with
 * Vane on, a job is a conversation with Claude that ends DONE with what it
 * cost, an unavailable Claude makes it wait and a misconfigured one fails it,
 * and paused workspaces, used-up allowances and dead ticks are handled. No
 * request leaves the test: a stand-in plays Claude.
 */
import { randomUUID } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import type { MessagesClient } from "./claude";
import { queueNightlyJobs, runNextJob } from "./jobs";
import { useTestReaderLogins } from "./test-reader-logins";

const suffix = randomUUID().slice(0, 8);
const made = { on: "", paused: "", off: "" };

function reply(content: Anthropic.ContentBlock[], stop: Anthropic.Message["stop_reason"], usage = { input: 1000, output: 100 }) {
  return {
    id: `msg_${randomUUID()}`,
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: usage.input, output_tokens: usage.output, cache_read_input_tokens: 500, cache_creation_input_tokens: 50 },
  } as unknown as Anthropic.Message;
}

const toolUse = (id: string, name: string, input: unknown) =>
  ({ type: "tool_use", id, name, input }) as unknown as Anthropic.ContentBlock;
const text = (value: string) => ({ type: "text", text: value, citations: null }) as unknown as Anthropic.ContentBlock;

function claude(...turns: Array<Anthropic.Message | Error>) {
  const create = vi.fn(async () => {
    const next = turns.shift();
    if (!next) throw new Error("Claude was asked more than the test expected");
    if (next instanceof Error) throw next;
    return next;
  });
  return { client: { messages: { create } } as unknown as MessagesClient, create };
}

async function job(companyId: string, overrides: Partial<{ status: "QUEUED" | "WAITING" | "RUNNING"; startedAt: Date }> = {}) {
  return prisma.vaneJob.create({
    data: {
      companyId,
      key: `test:${randomUUID()}`,
      kind: "ask",
      label: "Which employees do we have?",
      trigger: "PERSON",
      runAfter: new Date("2026-10-13T08:00:00Z"),
      ...overrides,
    },
  });
}

const NOW = new Date("2026-10-13T08:05:00Z");

beforeAll(async () => {
  await useTestReaderLogins();
  for (const which of ["on", "paused", "off"] as const) {
    const company = await prisma.company.create({ data: { name: `Vane jobs ${which} ${suffix}`, slug: `vane-jobs-${which}-${suffix}` } });
    made[which] = company.id;
  }
  await prisma.vaneSettings.create({ data: { companyId: made.on } });
  await prisma.vaneSettings.create({ data: { companyId: made.paused, paused: true } });
  await prisma.employee.create({
    data: {
      companyId: made.on,
      employeeId: `J-${suffix}`,
      name: "Chipo",
      phone: "+263 77 000 0000",
      nextOfKinName: "Rudo",
      nextOfKinPhone: "+263 77 000 0001",
      passportPhotoUrl: "",
      villageOfOrigin: "Mazowe",
      nationalIdNumber: `63-${suffix}`,
    },
  });
});

beforeEach(() => {
  vi.stubEnv("VANE_MODEL", "claude-sonnet-5-5");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await prisma.vaneJob.deleteMany({ where: { companyId: { in: Object.values(made) } } });
});

afterAll(async () => {
  const companies = { slug: { startsWith: "vane-jobs-" } };
  await prisma.employee.deleteMany({ where: { company: companies } });
  await prisma.company.deleteMany({ where: companies });
});

describe("the nightly run", () => {
  it("queues one look a day for each workspace with Vane on, and none for paused ones or ones without it", async () => {
    await queueNightlyJobs(NOW);
    await queueNightlyJobs(new Date(NOW.getTime() + 60_000));
    const jobs = await prisma.vaneJob.findMany({ where: { companyId: { in: Object.values(made) } } });
    expect(jobs.map((j) => [j.companyId, j.key, j.trigger])).toEqual([[made.on, "nightly:2026-10-13", "NIGHTLY"]]);
  });
});

describe("running a job", () => {
  it("talks with Claude through the tools until it is done, and keeps what it cost", async () => {
    const queued = await job(made.on);
    const { client, create } = claude(
      reply([toolUse("t1", "run_sql", { sql: `SELECT "name" FROM "Employee"` })], "tool_use"),
      reply(
        [
          toolUse("t2", "propose_item", {
            kind: "SUGGESTION",
            sourceModule: "people",
            headline: `1 employee on the books ${suffix}`,
            body: "Chipo is the only employee. Let's add the rest.",
            action: { type: "open", label: "Open People" },
            sql: `SELECT "name" FROM "Employee"`,
            readFrom: [{ table: "Employee", rows: 1 }],
          }),
        ],
        "tool_use",
      ),
      reply([text("I read the employee list and raised one card.")], "end_turn"),
    );

    expect(await runNextJob(NOW, { client, companyId: made.on })).toMatch(/done/);

    const done = await prisma.vaneJob.findUniqueOrThrow({ where: { id: queued.id } });
    expect(done).toMatchObject({
      status: "DONE",
      attempts: 1,
      result: "I read the employee list and raised one card.",
      model: "claude-sonnet-5-5",
      tokensIn: 3000,
      tokensOut: 300,
      cacheReadTokens: 1500,
      cacheWriteTokens: 150,
    });
    expect((done.tools as Array<{ name: string; ok: boolean }>).map((t) => [t.name, t.ok])).toEqual([
      ["run_sql", true],
      ["propose_item", true],
    ]);
    const card = await prisma.vaneItem.findFirstOrThrow({ where: { jobId: queued.id } });
    expect(card).toMatchObject({ companyId: made.on, kind: "SUGGESTION" });

    // The tool's answer went back to Claude, with the employee it read: the conversation is
    // the instructions, Claude's call, then its result.
    const second = create.mock.calls[1] as unknown as [{ messages: Anthropic.MessageParam[]; tools: Anthropic.Tool[] }];
    expect(second[0].messages[2]!.role).toBe("user");
    const toolResult = JSON.stringify(second[0].messages[2]);
    expect(toolResult).toContain("Chipo");
    expect(second[0].tools.map((t) => t.name)).toContain("propose_item");

    // Cached as the prompt-caching guide lays it out: the tools and Vane's shared instructions
    // for an hour (the same for every workspace reading these tables), then the job's own words,
    // then the conversation, which the request's own cache_control follows.
    const sent = create.mock.calls[0] as unknown as [
      { tools: Array<{ cache_control?: unknown }>; system: Array<{ text: string; cache_control?: unknown }>; cache_control: unknown },
    ];
    const { tools, system, cache_control } = sent[0];
    expect(tools.at(-1)!.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(tools.slice(0, -1).every((tool) => tool.cache_control === undefined)).toBe(true);
    expect(system.map((block) => block.cache_control ?? null)).toEqual([{ type: "ephemeral", ttl: "1h" }, null]);
    expect(system[0]!.text).toContain("You are Vane");
    expect(system[1]!.text).toContain("When you are done");
    expect(cache_control).toEqual({ type: "ephemeral" });
  });

  it("ends the job on what Vane could not work out, keeping the question behind it", async () => {
    const queued = await job(made.on);
    const { client } = claude(
      reply(
        [
          toolUse("p1", "report_problem", {
            problem: "3 receipts have no amount, so the total would be a guess.",
            sql: `SELECT "id" FROM "Employee"`,
          }),
        ],
        "tool_use",
      ),
      reply([text("I could not work out September's fuel spend.")], "end_turn"),
    );
    expect(await runNextJob(NOW, { client, companyId: made.on })).toMatch(/could not work it out/);
    const failed = await prisma.vaneJob.findUniqueOrThrow({ where: { id: queued.id } });
    expect(failed).toMatchObject({ status: "FAILED", error: "3 receipts have no amount, so the total would be a guess.", problemSql: `SELECT "id" FROM "Employee"` });
    await prisma.vaneJob.delete({ where: { id: queued.id } });
  });

  it("waits and tries again later when Claude cannot be reached", async () => {
    const queued = await job(made.on);
    const { client } = claude(new Anthropic.APIConnectionError({ message: "socket hang up" }));
    expect(await runNextJob(NOW, { client, companyId: made.on })).toMatch(/waiting 2 min/);
    const waiting = await prisma.vaneJob.findUniqueOrThrow({ where: { id: queued.id } });
    expect(waiting).toMatchObject({ status: "WAITING", attempts: 1, runAfter: new Date(NOW.getTime() + 2 * 60_000) });
    // Not due again until then.
    expect(await runNextJob(new Date(NOW.getTime() + 60_000), { client, companyId: made.on })).toBe("nothing due");
  });

  it("fails a job when Vane is not set up, with the reason", async () => {
    vi.stubEnv("VANE_MODEL", "");
    const queued = await job(made.on);
    const { client, create } = claude();
    expect(await runNextJob(NOW, { client, companyId: made.on })).toMatch(/failed/);
    expect(await prisma.vaneJob.findUniqueOrThrow({ where: { id: queued.id } })).toMatchObject({
      status: "FAILED",
      error: expect.stringContaining("VANE_MODEL"),
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("leaves a paused workspace's jobs alone, and a workspace past its allowance", async () => {
    await job(made.paused);
    const { client } = claude();
    expect(await runNextJob(NOW, { client, companyId: made.paused })).toBe("nothing due");

    await prisma.vaneSettings.update({ where: { companyId: made.on }, data: { monthlyAllowance: 0 } });
    try {
      await job(made.on);
      expect(await runNextJob(NOW, { client, companyId: made.on })).toBe("nothing due");
    } finally {
      await prisma.vaneSettings.update({ where: { companyId: made.on }, data: { monthlyAllowance: 5000 } });
    }
  });

  it("takes back a job whose tick died", async () => {
    const stuck = await job(made.on, { status: "RUNNING", startedAt: new Date(NOW.getTime() - 11 * 60_000) });
    const { client } = claude(reply([text("Nothing needs doing today.")], "end_turn"));
    expect(await runNextJob(NOW, { client, companyId: made.on })).toMatch(/done/);
    expect(await prisma.vaneJob.findUniqueOrThrow({ where: { id: stuck.id } })).toMatchObject({ status: "DONE", attempts: 1 });
  });
});
