/**
 * The deals list, asked through the engine against a real database: every
 * filter narrows what it says — "Gone quiet" by each stage's own idle budget —
 * the sorts and Group by order what they say, and the board is the table's
 * deals laid out by stage, one pipeline at a time.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { readState } from "../codec";
import type { ViewState } from "../types";
import { registerContext } from "./context";
import { dealsRegister } from "./deals";
import type { RegisterContext } from "./types";

const SLUG = "register-deals-test";
const OTHER = "register-deals-test-other";

let companyId: string;
let tendai: string;
let rudo: string;
let ctx: RegisterContext;
const ids: Record<string, string> = {};

function state(query: string): ViewState {
  return readState(dealsRegister.def, new URLSearchParams(query)).state;
}

/** Titles in the order the list gives them. */
async function titles(query: string) {
  const { rows } = await dealsRegister.page(ctx, state(query), { skip: 0, take: 50 });
  return rows.map((row) => row.title);
}

/** Titles A–Z, for filters whose order is not the question. */
async function which(query: string) {
  return titles(query ? `${query}&sort=title` : "sort=title");
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const [company, other] = await Promise.all(
    [SLUG, OTHER].map((slug) => prisma.company.create({ data: { name: slug, slug } })),
  );
  companyId = company.id;
  const users = await Promise.all(
    ["tendai", "rudo"].map((name) =>
      prisma.user.upsert({
        where: { email: `${SLUG}-${name}@example.invalid` },
        update: { companyId, role: "SALES_REP" },
        create: { email: `${SLUG}-${name}@example.invalid`, name, companyId, role: "SALES_REP" },
      }),
    ),
  );
  [tendai, rudo] = users.map((user) => user.id);
  ctx = await registerContext({ id: tendai, role: "SALES_REP", companyId }, "Africa/Harare", new Date("2026-09-27T08:00:00Z"));

  const sales = await prisma.crmPipeline.create({
    data: {
      companyId,
      name: "Sales",
      isDefault: true,
      position: 0,
      stages: {
        create: [
          { companyId, name: "New", position: 0, status: "OPEN", inactivityDays: 3 },
          { companyId, name: "Quoted", position: 1, status: "OPEN", inactivityDays: 7 },
          { companyId, name: "Won", position: 2, status: "WON" },
          { companyId, name: "Lost", position: 3, status: "LOST" },
        ],
      },
    },
    include: { stages: true },
  });
  const supply = await prisma.crmPipeline.create({
    data: {
      companyId,
      name: "Supply only",
      position: 1,
      stages: {
        create: [
          // No idle budget: nothing here ever goes quiet.
          { companyId, name: "Order", position: 0, status: "OPEN" },
          { companyId, name: "Won", position: 1, status: "WON" },
          { companyId, name: "Lost", position: 2, status: "LOST" },
        ],
      },
    },
    include: { stages: true },
  });
  ids.sales = sales.id;
  ids.supply = supply.id;
  const stage = (pipeline: typeof sales, name: string) => pipeline.stages.find((entry) => entry.name === name)!.id;
  ids.new = stage(sales, "New");
  ids.quoted = stage(sales, "Quoted");
  ids.won = stage(sales, "Won");
  ids.order = stage(supply, "Order");

  const acme = await prisma.crmClient.create({ data: { companyId, clientNo: "C-1", name: "Acme Roofing" } });
  const beta = await prisma.crmClient.create({ data: { companyId, clientNo: "C-2", name: "Beta Builders" } });
  ids.acme = acme.id;
  ids.beta = beta.id;

  const deal = (data: Record<string, unknown>) =>
    prisma.crmDeal.create({ data: { companyId, pipelineId: sales.id, ...data } as never });

  ids.roof = (
    await deal({
      dealNo: "D-1",
      title: "Acme roof",
      stageId: ids.new,
      assignedToId: tendai,
      clientId: acme.id,
      value: 1000,
      expectedCloseDate: new Date("2026-09-30T10:00:00Z"),
      // A week in New, whose budget is three days.
      stageEnteredAt: new Date("2026-09-20T08:00:00Z"),
    })
  ).id;
  ids.gutters = (
    await deal({
      dealNo: "D-2",
      title: "Beta gutters",
      stageId: ids.quoted,
      assignedToId: rudo,
      clientId: beta.id,
      value: 5000,
      probability: 70,
      forecastCategory: "COMMIT",
      expectedCloseDate: new Date("2026-10-15T10:00:00Z"),
      // Two days in Quoted, whose budget is seven.
      stageEnteredAt: new Date("2026-09-25T08:00:00Z"),
    })
  ).id;
  ids.shed = (
    await deal({
      dealNo: "D-3",
      title: "Won shed",
      stageId: ids.won,
      status: "WON",
      assignedToId: tendai,
      value: 2000,
      expectedCloseDate: new Date("2026-09-10T10:00:00Z"),
      // Long in its stage, but a won deal is finished, not forgotten.
      stageEnteredAt: new Date("2026-08-01T08:00:00Z"),
    })
  ).id;
  ids.supplyDeal = (
    await deal({
      dealNo: "D-4",
      title: "Supply order",
      pipelineId: supply.id,
      stageId: ids.order,
      currency: "ZAR",
      stageEnteredAt: new Date("2026-08-05T08:00:00Z"),
    })
  ).id;
  ids.archived = (
    await deal({ dealNo: "D-5", title: "Archived deal", stageId: ids.new, archivedAt: new Date("2026-09-01T00:00:00Z") })
  ).id;

  // The otherwise identical deal next door is never anybody's answer here.
  const otherPipeline = await prisma.crmPipeline.create({
    data: {
      companyId: other.id,
      name: "Sales",
      isDefault: true,
      stages: { create: [{ companyId: other.id, name: "New", status: "OPEN", inactivityDays: 1 }] },
    },
    include: { stages: true },
  });
  await prisma.crmDeal.create({
    data: {
      companyId: other.id,
      dealNo: "D-1",
      title: "Acme roof next door",
      pipelineId: otherPipeline.id,
      stageId: otherPipeline.stages[0].id,
      stageEnteredAt: new Date("2026-01-01T00:00:00Z"),
    },
  });

  await prisma.crmFollowUp.create({
    data: {
      companyId,
      dealId: ids.gutters,
      assignedToId: rudo,
      title: "Chase the quote",
      dueAt: new Date("2026-09-26T09:00:00Z"),
    },
  });
  await prisma.crmProject.create({
    data: { companyId, projectNo: "PRJ-1", name: "The shed", dealId: ids.shed },
  });
  ids.group = (
    await prisma.crmList.create({
      data: {
        companyId,
        entity: "DEAL",
        name: "Follow up this week",
        isShared: true,
        createdById: rudo,
        members: { create: [{ companyId, recordId: ids.roof }, { companyId, recordId: ids.supplyDeal }] },
      },
    })
  ).id;
});

afterAll(async () => {
  const company = { slug: { in: [SLUG, OTHER] } };
  await prisma.crmList.deleteMany({ where: { company } });
  await prisma.crmProject.deleteMany({ where: { company } });
  await prisma.crmFollowUp.deleteMany({ where: { company } });
  await prisma.crmDeal.deleteMany({ where: { company } });
  await prisma.crmPipeline.deleteMany({ where: { company } });
  await prisma.crmClient.deleteMany({ where: { company } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: company });
});

describe("deals", () => {
  it("opens on every pipeline's deals, none archived", async () => {
    expect(await which("")).toEqual(["Acme roof", "Beta gutters", "Supply order", "Won shed"]);
    expect(await which("archived=1")).toEqual(["Archived deal"]);
  });

  it("narrows by pipeline, status and stage", async () => {
    expect(await which(`pipeline=${ids.supply}`)).toEqual(["Supply order"]);
    expect(await which(`pipeline=${ids.sales}`)).toEqual(["Acme roof", "Beta gutters", "Won shed"]);
    expect(await which("status=WON")).toEqual(["Won shed"]);
    expect(await which("status=OPEN")).toEqual(["Acme roof", "Beta gutters", "Supply order"]);
    expect(await which(`stage=${ids.quoted}`)).toEqual(["Beta gutters"]);
  });

  it("reads me and nobody as the reader and no one", async () => {
    expect(await which("owner=me")).toEqual(["Acme roof", "Won shed"]);
    expect(await which("owner=none")).toEqual(["Supply order"]);
    expect(await which(`owner=${rudo}`)).toEqual(["Beta gutters"]);
  });

  it("narrows by company, forecast, value and search", async () => {
    expect(await which(`company=${ids.acme}`)).toEqual(["Acme roof"]);
    expect(await which("forecast=COMMIT")).toEqual(["Beta gutters"]);
    expect(await which("value=1500..")).toEqual(["Beta gutters", "Won shed"]);
    expect(await which("value=..1000")).toEqual(["Acme roof"]);
    // The company's name finds its deals, and so does the number.
    expect(await which("q=beta")).toEqual(["Beta gutters"]);
    expect(await which("q=D-4")).toEqual(["Supply order"]);
  });

  it("reads expected close in the reader's month, and overdue as before today", async () => {
    expect(await which("close=this-month")).toEqual(["Acme roof", "Won shed"]);
    expect(await which("close=overdue")).toEqual(["Won shed"]);
  });

  it("finds the deals gone quiet by each stage's own idle budget", async () => {
    // A week in New (three days allowed) is quiet; two days in Quoted (seven
    // allowed) is not; a won deal and a stage with no budget never are.
    expect(await which("stale=1")).toEqual(["Acme roof"]);
  });

  it("finds deals with an overdue task, and deals with no project yet", async () => {
    expect(await which("overdue=1")).toEqual(["Beta gutters"]);
    expect(await which("noProject=1")).toEqual(["Acme roof", "Beta gutters", "Supply order"]);
  });

  it("narrows to a group", async () => {
    expect(await which(`group=${ids.group}`)).toEqual(["Acme roof", "Supply order"]);
  });

  it("sorts by value and by expected close, the unknown last either way", async () => {
    expect(await titles("sort=-value")).toEqual(["Beta gutters", "Won shed", "Acme roof", "Supply order"]);
    expect(await titles("sort=value")).toEqual(["Acme roof", "Won shed", "Beta gutters", "Supply order"]);
    expect(await titles("sort=close")).toEqual(["Won shed", "Acme roof", "Beta gutters", "Supply order"]);
    expect(await titles("sort=entered")).toEqual(["Won shed", "Supply order", "Acme roof", "Beta gutters"]);
  });

  it("groups by stage, down the default pipeline first, and names another pipeline's stages", async () => {
    const { rows, groups } = await dealsRegister.page(ctx, state("by=stage&sort=title"), { skip: 0, take: 50 });
    expect(rows.map((row) => row.title)).toEqual(["Acme roof", "Beta gutters", "Won shed", "Supply order"]);
    expect(groups?.map((group) => [group.label, group.count])).toEqual([
      ["New", 1],
      ["Quoted", 1],
      ["Won", 1],
      ["Order · Supply only", 1],
    ]);
  });

  it("groups by owner, with the unassigned last", async () => {
    const { groups } = await dealsRegister.page(ctx, state("by=owner&sort=title"), { skip: 0, take: 50 });
    expect(groups?.map((group) => [group.label, group.count])).toEqual([
      ["rudo", 1],
      ["tendai", 2],
      ["Unassigned", 1],
    ]);
  });

  it("writes each deal's figures into its export cells", async () => {
    const { rows } = await dealsRegister.page(ctx, state(`stage=${ids.quoted}`), { skip: 0, take: 50 });
    expect(dealsRegister.cells(rows[0], ctx)).toMatchObject({
      name: "Beta gutters",
      ref: "D-2",
      company: "Beta Builders",
      stage: "Quoted",
      pipeline: "Sales",
      value: 5000,
      currency: "USD",
      probability: 70,
      forecast: "Commit",
      status: "Open",
      owner: "rudo",
      next: "Chase the quote",
      close: "2026-10-15",
    });
  });

  it("agrees between the page, the count and the scan", async () => {
    const query = state("status=OPEN");
    expect((await dealsRegister.page(ctx, query, { skip: 0, take: 1 })).total).toBe(3);
    expect(await dealsRegister.count(ctx, query)).toBe(3);
    const scanned: string[] = [];
    for await (const batch of dealsRegister.scan(ctx, query, { batch: 2 })) scanned.push(...batch.map((row) => row.id));
    expect(scanned).toHaveLength(3);
  });
});

describe("the deals board", () => {
  async function board(query: string) {
    return dealsRegister.board!(ctx, state(query));
  }

  it("draws the default pipeline when none is chosen, a column per stage", async () => {
    const drawn = await board("");
    expect(drawn?.pipeline.name).toBe("Sales");
    expect(drawn?.columns.map((column) => [column.stage.name, column.count, column.totalValue])).toEqual([
      ["New", 1, 1000],
      ["Quoted", 1, 5000],
      ["Won", 1, 2000],
      ["Lost", 0, 0],
    ]);
    expect(drawn?.columns[0].cards.map((card) => card.title)).toEqual(["Acme roof"]);
  });

  it("draws the chosen pipeline, and nothing for one that is not there", async () => {
    const drawn = await board(`pipeline=${ids.supply}`);
    expect(drawn?.columns.map((column) => [column.stage.name, column.count])).toEqual([
      ["Order", 1],
      ["Won", 0],
      ["Lost", 0],
    ]);
    expect(await board("pipeline=00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("lets the status and stage filters choose its columns", async () => {
    expect((await board("status=OPEN"))?.columns.map((column) => column.stage.name)).toEqual(["New", "Quoted"]);
    expect((await board(`stage=${ids.quoted}`))?.columns.map((column) => column.stage.name)).toEqual(["Quoted"]);
  });

  it("holds the same deals as the table narrowed to the same pipeline", async () => {
    const drawn = await board("owner=me");
    for (const column of drawn!.columns) {
      expect(column.count).toBe(await dealsRegister.count(ctx, state(`owner=me&pipeline=${ids.sales}&stage=${column.stage.id}`)));
    }
    expect(drawn!.columns.flatMap((column) => column.cards.map((card) => card.title)).sort()).toEqual(
      await which(`owner=me&pipeline=${ids.sales}`),
    );
  });
});
