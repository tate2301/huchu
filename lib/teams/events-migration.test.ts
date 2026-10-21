/**
 * Witness for `teams_events`.
 *
 * Activities and comments carry a source and a module, defaulting to the web
 * and the CRM; the backfill gave every old activity the source its type implies;
 * and the loader reads one record's comments, activities, files and field
 * changes into the timeline, with the machine roll-up and the edit roll-up
 * working on real rows.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { createMember } from "./members";
import { loadTimeline } from "./timeline";

const run = crypto.randomUUID().slice(0, 8);
let companyId: string;
let userId: string;
let dealId: string;
let otherDealId: string;

function backfill(): string {
  const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261021150000_teams_events/migration.sql"), "utf8");
  const start = sql.indexOf("UPDATE");
  return sql.slice(start, sql.indexOf(";", start));
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Events ${run}`, slug: `events-${run}` }, select: { id: true } })).id;
  userId = (await createMember(prisma, { data: { companyId, name: "Sean", email: `sean-${run}@events.test`, role: "MANAGER" }, select: { id: true } })).id;
  const pipeline = await prisma.crmPipeline.create({ data: { companyId, name: "Sales", isDefault: true } });
  const stage = await prisma.crmPipelineStage.create({ data: { companyId, pipelineId: pipeline.id, name: "Quoted", position: 1 } });
  const make = (dealNo: string) => prisma.crmDeal.create({ data: { companyId, dealNo, title: dealNo, pipelineId: pipeline.id, stageId: stage.id }, select: { id: true } });
  dealId = (await make("D-1")).id;
  otherDealId = (await make("D-2")).id;
});

afterAll(async () => {
  await prisma.crmFieldChange.deleteMany({ where: { companyId } });
  await prisma.crmRecordFile.deleteMany({ where: { companyId } });
  await prisma.crmComment.deleteMany({ where: { companyId } });
  await prisma.crmActivity.deleteMany({ where: { companyId } });
  await prisma.crmDeal.deleteMany({ where: { companyId } });
  await prisma.crmPipeline.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("the migration", () => {
  it("adds source and module to activities and comments, defaulting to the web and the CRM", async () => {
    for (const table of ["CrmActivity", "CrmComment"]) {
      const columns = await prisma.$queryRaw<Array<{ column_name: string; udt_name: string; is_nullable: string; column_default: string }>>`
        SELECT column_name, udt_name, is_nullable, column_default FROM information_schema.columns
        WHERE table_name = ${table} AND column_name IN ('source', 'module') ORDER BY column_name`;
      expect(columns.map((c) => [c.column_name, c.udt_name, c.is_nullable])).toEqual([["module", "EventModule", "NO"], ["source", "EventSource", "NO"]]);
      expect(columns.map((c) => c.column_default)).toEqual([`'CRM'::"EventModule"`, `'WEB'::"EventSource"`]);
    }
  });

  it("backfills an activity's source from its type, and again changes nothing", async () => {
    const make = (type: "WHATSAPP" | "SYSTEM" | "INTAKE_SUBMISSION" | "CALL" | "NOTE") =>
      prisma.crmActivity.create({ data: { companyId, dealId: otherDealId, type, subject: type, createdById: userId }, select: { id: true } });
    const rows = { WHATSAPP: await make("WHATSAPP"), SYSTEM: await make("SYSTEM"), INTAKE_SUBMISSION: await make("INTAKE_SUBMISSION"), CALL: await make("CALL"), NOTE: await make("NOTE") };
    await prisma.$executeRawUnsafe(backfill());
    await prisma.$executeRawUnsafe(backfill());
    const sources = Object.fromEntries(
      await Promise.all(Object.entries(rows).map(async ([type, row]) => [type, (await prisma.crmActivity.findUniqueOrThrow({ where: { id: row.id } })).source])),
    );
    expect(sources).toEqual({ WHATSAPP: "WHATSAPP", SYSTEM: "SYSTEM", INTAKE_SUBMISSION: "SYSTEM", CALL: "WEB", NOTE: "WEB" });
  });
});

describe("loading a record's timeline", () => {
  it("reads comments, activities, files and field changes of that record only, rolled up", async () => {
    const at = (iso: string) => new Date(`2026-10-19T${iso}:00Z`);
    await prisma.crmComment.create({ data: { companyId, dealId, subjectType: "DEAL", subjectId: dealId, body: "Rang the bursar", createdById: userId, source: "PHONE", createdAt: at("09:00") } });
    await prisma.crmComment.create({ data: { companyId, dealId: otherDealId, subjectType: "DEAL", subjectId: otherDealId, body: "Another deal", createdById: userId } });
    for (const [time, amount] of [["08:00", 10], ["09:00", 15.5], ["10:00", 4.5]] as const) {
      await prisma.crmActivity.create({
        data: { companyId, dealId, type: "PAYMENT_RECORDED", subject: "Payment", metadata: { amount }, source: "BANK", module: "BOOKS", occurredAt: at(time) },
      });
    }
    await prisma.crmActivity.create({ data: { companyId, dealId, type: "CALL", subject: "Called the school", createdById: userId, source: "PHONE", occurredAt: at("11:00") } });
    await prisma.crmRecordFile.create({ data: { companyId, dealId, subjectType: "DEAL", subjectId: dealId, name: "Quote.pdf", url: "https://files.test/quote.pdf", uploadedById: userId, createdAt: at("12:00") } });
    for (const [time, field] of [["13:00", "stage"], ["13:20", "value"]] as const) {
      await prisma.crmFieldChange.create({ data: { companyId, entity: "DEAL", recordId: dealId, field, oldValue: "a", newValue: "b", changedById: userId, createdAt: at(time) } });
    }

    const all = await loadTimeline(prisma, companyId, { type: "DEAL", id: dealId });
    expect(all.map((entry) => entry.kind)).toEqual(["edits", "file", "activity", "machine", "comment"]);
    expect(all.find((entry) => entry.kind === "machine")).toMatchObject({ count: 3, total: 30, source: "BANK", module: "BOOKS" });
    expect(all.find((entry) => entry.kind === "edits")).toMatchObject({ edits: [{ field: "stage" }, { field: "value" }], actor: { name: "Sean" } });
    expect(all.find((entry) => entry.kind === "file")).toMatchObject({ name: "Quote.pdf", module: "CRM" });
    expect(all.find((entry) => entry.kind === "comment")).toMatchObject({ source: "PHONE", body: "Rang the bursar" });

    expect((await loadTimeline(prisma, companyId, { type: "DEAL", id: dealId }, { filter: "comments" })).map((e) => e.kind)).toEqual(["comment"]);
    expect((await loadTimeline(prisma, companyId, { type: "DEAL", id: dealId }, { filter: "calls" })).map((e) => e.kind)).toEqual(["activity"]);
    expect((await loadTimeline(prisma, companyId, { type: "DEAL", id: dealId }, { filter: "documents" })).map((e) => e.kind)).toEqual(["file"]);
    expect((await loadTimeline(prisma, companyId, { type: "DEAL", id: dealId }, { filter: "changes" })).map((e) => e.kind)).toEqual(["edits"]);
    expect((await loadTimeline(prisma, companyId, { type: "DEAL", id: dealId }, { limit: 2 })).length).toBe(2);
  });

  it("reads a retail record's files and comments through the subject pair", async () => {
    const product = crypto.randomUUID();
    await prisma.crmComment.create({ data: { companyId, subjectType: "RETAIL_PRODUCT", subjectId: product, body: "Supplier changed the pack size", createdById: userId, module: "RETAIL" } });
    const entries = await loadTimeline(prisma, companyId, { type: "RETAIL_PRODUCT", id: product });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "comment", module: "RETAIL" });
  });
});
