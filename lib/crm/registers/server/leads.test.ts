/**
 * The leads list, asked through the engine against a real database: every
 * filter narrows what it says, the sorts and Group by order what they say, a
 * lead's time in its stage comes from its latest stage change, and the board
 * is the table's leads laid out by stage.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { readState } from "../codec";
import type { ViewState } from "../types";
import { registerContext } from "./context";
import { leadsRegister } from "./leads";
import type { RegisterContext } from "./types";

const SLUG = "register-leads-test";
const OTHER = "register-leads-test-other";

let companyId: string;
let tendai: string;
let rudo: string;
let ctx: RegisterContext;
const ids: Record<string, string> = {};

function state(query: string): ViewState {
  return readState(leadsRegister.def, new URLSearchParams(query)).state;
}

/** Titles in the order the list gives them. */
async function titles(query: string) {
  const { rows } = await leadsRegister.page(ctx, state(query), { skip: 0, take: 50 });
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

  const acme = await prisma.crmClient.create({ data: { companyId, clientNo: "C-1", name: "Acme Roofing" } });
  const beta = await prisma.crmClient.create({ data: { companyId, clientNo: "C-2", name: "Beta Builders" } });
  ids.acme = acme.id;

  const lead = (data: Record<string, unknown>) => prisma.crmLead.create({ data: { companyId, ...data } as never });

  ids.borehole = (
    await lead({
      leadNo: "L-1",
      title: "Acme borehole",
      stage: "NEW",
      assignedToId: tendai,
      clientId: acme.id,
      contactName: "Chipo Moyo",
      estimatedValue: 1000,
      sourceChannel: "WEB_FORM",
      source: "Facebook",
      createdAt: new Date("2026-09-20T08:00:00Z"),
    })
  ).id;
  ids.roof = (
    await lead({
      leadNo: "L-2",
      title: "Beta roof",
      stage: "QUOTED",
      assignedToId: rudo,
      clientId: beta.id,
      estimatedValue: 5000,
      sourceChannel: "REFERRAL",
      source: "Word of mouth",
      createdAt: new Date("2026-09-05T08:00:00Z"),
    })
  ).id;
  ids.solar = (
    await lead({
      leadNo: "L-3",
      title: "Won solar",
      stage: "WON",
      assignedToId: tendai,
      estimatedValue: 2000,
      sourceChannel: "MANUAL",
      createdAt: new Date("2026-08-15T08:00:00Z"),
    })
  ).id;
  ids.enquiry = (
    await lead({
      leadNo: "L-4",
      title: "Unassigned enquiry",
      stage: "CONTACTED",
      sourceChannel: "SOCIAL",
      source: "Instagram",
      customFields: { region: "north" },
      createdAt: new Date("2026-09-26T08:00:00Z"),
    })
  ).id;
  await lead({ leadNo: "L-5", title: "Archived lead", stage: "LOST", archivedAt: new Date("2026-09-01T00:00:00Z") });

  // The otherwise identical lead next door is never anybody's answer here.
  await prisma.crmLead.create({
    data: { companyId: other.id, leadNo: "L-1", title: "Acme borehole next door", stage: "NEW" },
  });

  // Beta roof moved to Quoted on the 22nd, and has a chase that is overdue.
  await prisma.crmActivity.create({
    data: {
      companyId,
      leadId: ids.roof,
      type: "STAGE_CHANGE",
      subject: "Stage: Contacted → Quoted",
      occurredAt: new Date("2026-09-22T10:00:00Z"),
    },
  });
  await prisma.crmFollowUp.create({
    data: { companyId, leadId: ids.roof, assignedToId: rudo, title: "Chase the quote", dueAt: new Date("2026-09-26T09:00:00Z") },
  });

  ids.group = (
    await prisma.crmList.create({
      data: {
        companyId,
        entity: "LEAD",
        name: "Call back this week",
        isShared: true,
        createdById: rudo,
        members: { create: [{ companyId, recordId: ids.borehole }, { companyId, recordId: ids.enquiry }] },
      },
    })
  ).id;
});

afterAll(async () => {
  const company = { slug: { in: [SLUG, OTHER] } };
  await prisma.crmList.deleteMany({ where: { company } });
  await prisma.crmFollowUp.deleteMany({ where: { company } });
  await prisma.crmActivity.deleteMany({ where: { company } });
  await prisma.crmLead.deleteMany({ where: { company } });
  await prisma.crmClient.deleteMany({ where: { company } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: company });
});

describe("leads", () => {
  it("opens on every live lead, none archived", async () => {
    expect(await which("")).toEqual(["Acme borehole", "Beta roof", "Unassigned enquiry", "Won solar"]);
    expect(await which("archived=1")).toEqual(["Archived lead"]);
  });

  it("narrows by stage, channel and source", async () => {
    expect(await which("stage=NEW,QUOTED")).toEqual(["Acme borehole", "Beta roof"]);
    expect(await which("channel=WEB_FORM,SOCIAL")).toEqual(["Acme borehole", "Unassigned enquiry"]);
    expect(await which("source=Instagram")).toEqual(["Unassigned enquiry"]);
  });

  it("reads me and nobody as the reader and no one", async () => {
    expect(await which("owner=me")).toEqual(["Acme borehole", "Won solar"]);
    expect(await which("owner=none")).toEqual(["Unassigned enquiry"]);
    expect(await which(`owner=${rudo},none`)).toEqual(["Beta roof", "Unassigned enquiry"]);
  });

  it("narrows by company, value and search", async () => {
    expect(await which(`company=${ids.acme}`)).toEqual(["Acme borehole"]);
    expect(await which("value=1500..")).toEqual(["Beta roof", "Won solar"]);
    expect(await which("value=..1000")).toEqual(["Acme borehole"]);
    // The contact, the company's name and the number all find a lead.
    expect(await which("q=chipo")).toEqual(["Acme borehole"]);
    expect(await which("q=beta")).toEqual(["Beta roof"]);
    expect(await which("q=L-3")).toEqual(["Won solar"]);
  });

  it("reads the day it was added in the reader's month", async () => {
    expect(await which("created=this-month")).toEqual(["Acme borehole", "Beta roof", "Unassigned enquiry"]);
    expect(await which("created=2026-08-01..2026-08-31")).toEqual(["Won solar"]);
  });

  it("finds leads with an overdue follow-up, a group's leads, and the company's own fields", async () => {
    expect(await which("overdue=1")).toEqual(["Beta roof"]);
    expect(await which(`group=${ids.group}`)).toEqual(["Acme borehole", "Unassigned enquiry"]);
    expect(await which("cf.region=north")).toEqual(["Unassigned enquiry"]);
  });

  it("sorts by value, the unknown last either way", async () => {
    expect(await titles("sort=-value")).toEqual(["Beta roof", "Won solar", "Acme borehole", "Unassigned enquiry"]);
    expect(await titles("sort=value")).toEqual(["Acme borehole", "Won solar", "Beta roof", "Unassigned enquiry"]);
    expect(await titles("sort=created")).toEqual(["Won solar", "Beta roof", "Acme borehole", "Unassigned enquiry"]);
  });

  it("dates a lead's stage from its latest stage change, or from when it arrived", async () => {
    const { rows } = await leadsRegister.page(ctx, state("sort=ref"), { skip: 0, take: 50 });
    const entered = Object.fromEntries(rows.map((row) => [row.title, row.stageEnteredAt.toISOString()]));
    expect(entered["Beta roof"]).toBe("2026-09-22T10:00:00.000Z");
    expect(entered["Acme borehole"]).toBe("2026-09-20T08:00:00.000Z");
    expect(rows.find((row) => row.title === "Beta roof")?.nextFollowUp?.title).toBe("Chase the quote");
  });

  it("groups by stage in the pipeline's own order, and by owner with the unassigned last", async () => {
    const byStage = await leadsRegister.page(ctx, state("by=stage&sort=title"), { skip: 0, take: 50 });
    expect(byStage.groups?.map((group) => [group.label, group.count])).toEqual([
      ["New", 1],
      ["Contacted", 1],
      ["Quoted", 1],
      ["Won", 1],
    ]);
    const byOwner = await leadsRegister.page(ctx, state("by=owner&sort=title"), { skip: 0, take: 50 });
    expect(byOwner.groups?.map((group) => [group.label, group.count])).toEqual([
      ["rudo", 1],
      ["tendai", 2],
      ["Unassigned", 1],
    ]);
  });

  it("offers the sources the leads have come from", async () => {
    const options = await leadsRegister.facet!(ctx, state(""), "source");
    expect(options.map((option) => option.value)).toEqual(["Facebook", "Instagram", "Word of mouth"]);
  });

  it("writes each lead's figures into its export cells", async () => {
    const { rows } = await leadsRegister.page(ctx, state("stage=QUOTED"), { skip: 0, take: 50 });
    expect(leadsRegister.cells(rows[0], ctx)).toMatchObject({
      name: "Beta roof",
      ref: "L-2",
      company: "Beta Builders",
      stage: "Quoted",
      value: 5000,
      owner: "rudo",
      next: "Chase the quote",
      source: "Word of mouth",
      channel: "Referral",
      created: "2026-09-05",
      currency: "USD",
    });
  });

  it("agrees between the page, the count and the scan", async () => {
    const query = state("owner=me,none");
    expect((await leadsRegister.page(ctx, query, { skip: 0, take: 1 })).total).toBe(3);
    expect(await leadsRegister.count(ctx, query)).toBe(3);
    const scanned: string[] = [];
    for await (const batch of leadsRegister.scan(ctx, query, { batch: 2 })) scanned.push(...batch.map((row) => row.id));
    expect(scanned).toHaveLength(3);
  });
});

describe("the leads board", () => {
  async function board(query: string) {
    return leadsRegister.board!(ctx, state(query));
  }

  it("draws a column per stage, with every lead's count and value", async () => {
    const drawn = await board("");
    expect(drawn?.pipeline).toBeNull();
    expect(drawn?.columns.map((column) => [column.stage.id, column.count, column.totalValue])).toEqual([
      ["NEW", 1, 1000],
      ["CONTACTED", 1, 0],
      ["QUALIFIED", 0, 0],
      ["SITE_VISIT", 0, 0],
      ["QUOTED", 1, 5000],
      ["INVOICED", 0, 0],
      ["WON", 1, 2000],
      ["LOST", 0, 0],
    ]);
  });

  it("lets the stage filter choose its columns", async () => {
    expect((await board("stage=NEW,WON"))?.columns.map((column) => column.stage.name)).toEqual(["New", "Won"]);
  });

  it("holds the same leads as the table", async () => {
    const drawn = await board("owner=me");
    for (const column of drawn!.columns) {
      expect(column.count).toBe(await leadsRegister.count(ctx, state(`owner=me&stage=${column.stage.id}`)));
    }
    expect(drawn!.columns.flatMap((column) => column.cards.map((card) => card.title)).sort()).toEqual(
      await which("owner=me"),
    );
  });
});
