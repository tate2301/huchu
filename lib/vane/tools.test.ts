/**
 * Vane's tools as Claude calls them: what Claude is shown, reading through the
 * reader roles, raising cards and laying out plans, and the errors Claude gets
 * back to correct itself. Reads go through the test logins in
 * `test-reader-logins.ts`.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { useTestReaderLogins } from "./test-reader-logins";
import { callTool, toolDefinitions, type ToolContext } from "./tools";

const suffix = randomUUID().slice(0, 8);
const made = { a: "", b: "", employeeA: "", employeeB: "" };
const context = (companyId: string): ToolContext => ({ companyId, jobId: null });

beforeAll(async () => {
  await useTestReaderLogins();
  for (const which of ["a", "b"] as const) {
    const company = await prisma.company.create({
      data: { name: `Vane tools ${which} ${suffix}`, slug: `vane-tools-${which}-${suffix}` },
    });
    made[which] = company.id;
    const employee = await prisma.employee.create({
      data: {
        companyId: company.id,
        employeeId: `T-${which}-${suffix}`,
        name: `Nyasha ${which}`,
        phone: "+263 77 000 0000",
        nextOfKinName: "Rudo",
        nextOfKinPhone: "+263 77 000 0001",
        passportPhotoUrl: "",
        villageOfOrigin: "Mazowe",
        nationalIdNumber: `63-${suffix}-${which}`,
      },
    });
    made[which === "a" ? "employeeA" : "employeeB"] = employee.id;
  }
});

afterAll(async () => {
  const companies = { slug: { startsWith: "vane-tools-" } };
  await prisma.employee.deleteMany({ where: { company: companies } });
  await prisma.company.deleteMany({ where: companies });
});

describe("what Claude is shown", () => {
  it("names each tool, says what it does, and gives its input as JSON Schema", () => {
    const tools = toolDefinitions();
    expect(tools.map((t) => t.name)).toEqual(["run_sql", "get_record", "propose_item", "propose_plan"]);
    for (const t of tools) {
      expect(t.description?.length).toBeGreaterThan(40);
      expect(t.input_schema).toMatchObject({ type: "object" });
    }
    expect(tools[0]!.input_schema).toMatchObject({ properties: { sql: { type: "string" } }, required: ["sql"] });
  });
});

describe("reading", () => {
  it("runs SQL for the job's workspace only", async () => {
    const result = await callTool(context(made.a), "run_sql", { sql: `SELECT "name" FROM "Employee"` });
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.content)).toMatchObject({ rows: [{ name: "Nyasha a" }], readFrom: ["employee"] });
  });

  it("hands a refused question back for Claude to correct", async () => {
    const result = await callTool(context(made.a), "run_sql", { sql: `DELETE FROM "Employee"` });
    expect(result).toMatchObject({ ok: false, content: expect.stringMatching(/select/i) });
  });

  it("reads a record with what it points at, in readable columns only", async () => {
    const result = await callTool(context(made.a), "get_record", { table: "Employee", id: made.employeeA });
    expect(result.ok).toBe(true);
    const { record, links } = JSON.parse(result.content);
    expect(record).toMatchObject({ id: made.employeeA, name: "Nyasha a" });
    expect(record).not.toHaveProperty("nationalIdNumber");
    expect(links.companyId).toMatchObject({ table: "Company", record: { id: made.a } });
  });

  it("finds nothing of another workspace's, and no table it may not read", async () => {
    const other = await callTool(context(made.a), "get_record", { table: "Employee", id: made.employeeB });
    expect(JSON.parse(other.content)).toMatchObject({ record: null });
    const session = await callTool(context(made.a), "get_record", { table: "Session", id: "x" });
    expect(session).toMatchObject({ ok: false, content: expect.stringContaining("Session") });
  });
});

describe("writing to Vane's own tables", () => {
  const card = {
    kind: "ISSUE",
    sourceModule: "books",
    headline: `$2,480.00 is overdue across 3 invoices ${suffix}`,
    body: "Three customers are past their due date. Let's send the reminders.",
    action: { type: "send_reminders", label: "Send the reminders" },
    sql: `SELECT "id" FROM "SalesInvoice"`,
    readFrom: [{ table: "SalesInvoice", rows: 3 }],
  };

  it("raises a card once, however many times the same fact is found", async () => {
    const first = JSON.parse((await callTool(context(made.a), "propose_item", card)).content);
    expect(first).toMatchObject({ raised: true });
    const again = JSON.parse((await callTool(context(made.a), "propose_item", card)).content);
    expect(again).toEqual({ id: first.id, raised: false, reason: expect.any(String) });
    const stored = await prisma.vaneItem.findUniqueOrThrow({ where: { id: first.id } });
    expect(stored).toMatchObject({ companyId: made.a, kind: "ISSUE", status: "OPEN", readFrom: card.readFrom, sql: card.sql });
  });

  it("turns a card that does not fit back to Claude", async () => {
    const result = await callTool(context(made.a), "propose_item", { ...card, headline: "" });
    expect(result).toMatchObject({ ok: false, content: expect.stringContaining("headline") });
  });

  it("lays out a plan with its steps in order", async () => {
    const result = await callTool(context(made.a), "propose_plan", {
      title: "VAT return for September",
      dueOn: "2026-10-25",
      steps: [
        { label: "Match CBZ lines", owner: "VANE" },
        { label: "Approve the return", owner: "PERSON" },
      ],
    });
    const { id } = JSON.parse(result.content);
    const plan = await prisma.vanePlan.findUniqueOrThrow({ where: { id }, include: { steps: { orderBy: { position: "asc" } } } });
    expect(plan).toMatchObject({ companyId: made.a, title: "VAT return for September", dueOn: new Date("2026-10-25T00:00:00Z") });
    expect(plan.steps.map((s) => [s.position, s.label, s.owner, s.status])).toEqual([
      [1, "Match CBZ lines", "VANE", "TODO"],
      [2, "Approve the return", "PERSON", "TODO"],
    ]);
  });

  it("says so when asked for a tool it does not have", async () => {
    expect(await callTool(context(made.a), "send_payment", {})).toEqual({ ok: false, content: "There is no tool called send_payment." });
  });
});
