/**
 * Vane's actions against the test database, with a stand-in action so no
 * module is touched: proposals are checked against their kind; nothing runs
 * until a person approves; a person changes only the inputs the action lets
 * them; their role is checked first; a failure says why and can be approved
 * again; an action is not decided twice; and a card is taken further once its
 * actions are done.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";

import { OperationRefused, type Operation } from "@/lib/operations/types";

import { decideAction, proposeActions, type ApproverContext } from "./engine";

const suffix = randomUUID().slice(0, 8);
const ids = { company: "", user: "", item: "" };
const ran: Array<{ by: string; via: unknown; params: unknown }> = [];
let failNext = false;

const stamp = {
  key: "test.stamp",
  product: "test",
  name: "Stamp a record",
  risk: "change",
  description: "Stamps a record.",
  input: z.object({ recordId: z.string(), label: z.string(), on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().optional() }),
  fields: [{ name: "on", label: "On", type: "date" }],
  pageFields: ["note"],
  verb: () => "Stamp it",
  title: (p) => `Stamp ${p.label} on ${p.on}`,
  target: (p) => `/records?q=${p.label}`,
  authorize: async (actor) => (actor.role === "CASHIER" ? "Your role cannot stamp." : null),
  async run(context, p) {
    if (failNext) {
      failNext = false;
      throw new OperationRefused("The record is locked.");
    }
    ran.push({ by: context.userId, via: context.via, params: p });
    return `Stamped ${p.label}.`;
  },
} satisfies Operation<{ recordId: string; label: string; on: string; note?: string }>;

const registry = [stamp] as unknown as readonly Operation<never>[];

const context = (role = "MANAGER"): ApproverContext => ({
  companyId: ids.company,
  userId: ids.user,
  role,
  session: { user: { id: ids.user, companyId: ids.company, role } } as unknown as AuthenticatedSession,
  requestUrl: "http://vane.test/api/vane/actions/x",
});

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `Vane actions ${suffix}`, slug: `vane-actions-${suffix}` } });
  const user = await prisma.user.create({
    data: { email: `rudo-${suffix}@vane.test`, name: "Rudo", password: "x", role: "MANAGER", companyId: company.id },
  });
  const item = await prisma.vaneItem.create({
    data: { companyId: company.id, kind: "ISSUE", sourceModule: "books", headline: "2 invoices have no due date.", body: ".", action: {} },
  });
  Object.assign(ids, { company: company.id, user: user.id, item: item.id });
});

afterAll(async () => {
  await prisma.vaneAction.deleteMany({ where: { companyId: ids.company } });
  await prisma.vaneItem.deleteMany({ where: { companyId: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
});

describe("Vane's actions", () => {
  it("checks each proposal against its kind, and runs nothing", async () => {
    const outcome = await proposeActions(
      prisma,
      { companyId: ids.company, itemId: ids.item },
      [
        { kind: "test.stamp", params: { recordId: "r1", label: "INV-0142", on: "2026-10-30" } },
        { kind: "test.stamp", params: { recordId: "r2", label: "INV-0150", on: "2026-11-02" } },
        { kind: "test.stamp", params: { recordId: "r3", label: "INV-0151", on: "next week" } },
        { kind: "test.nothing", params: {} },
      ],
      registry,
    );
    expect(outcome.proposed.map((row) => row.title)).toEqual(["Stamp INV-0142 on 2026-10-30", "Stamp INV-0150 on 2026-11-02"]);
    expect(outcome.refused.map((row) => row.kind)).toEqual(["test.stamp", "test.nothing"]);
    expect(ran).toEqual([]);
  });

  it("refuses a person whose role could not do it, and leaves it waiting", async () => {
    const [first] = await prisma.vaneAction.findMany({ where: { itemId: ids.item }, orderBy: { createdAt: "asc" } });
    const outcome = await decideAction(prisma, context("CASHIER"), first.id, { approve: true }, registry);
    expect(outcome).toEqual({ ok: false, status: 403, error: "Your role cannot stamp." });
    expect((await prisma.vaneAction.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("PROPOSED");
  });

  it("runs it as the person once approved, with only the inputs they may change, on the card or its page", async () => {
    const [first] = await prisma.vaneAction.findMany({ where: { itemId: ids.item }, orderBy: { createdAt: "asc" } });
    const outcome = await decideAction(prisma, context(), first.id, { approve: true, changes: { on: "2026-11-15", recordId: "someone-else", note: "From its page" } }, registry);
    expect(outcome.ok && outcome.action).toMatchObject({ status: "done", result: "Stamped INV-0142.", title: "Stamp INV-0142 on 2026-11-15", decidedBy: "Rudo" });
    expect(ran).toEqual([{ by: ids.user, via: { kind: "integration", integration: "vane" }, params: { recordId: "r1", label: "INV-0142", on: "2026-11-15", note: "From its page" } }]);
    expect(await decideAction(prisma, context(), first.id, { approve: true }, registry)).toMatchObject({ ok: false, status: 409 });
  });

  it("says why it failed, lets it be approved again, and closes the card once all are done", async () => {
    const [, second] = await prisma.vaneAction.findMany({ where: { itemId: ids.item }, orderBy: { createdAt: "asc" } });
    failNext = true;
    const failed = await decideAction(prisma, context(), second.id, { approve: true }, registry);
    expect(failed.ok && failed.action).toMatchObject({ status: "failed", result: "The record is locked." });
    expect((await prisma.vaneItem.findUniqueOrThrow({ where: { id: ids.item } })).status).toBe("OPEN");

    const retried = await decideAction(prisma, context(), second.id, { approve: true }, registry);
    expect(retried.ok && retried.action.status).toBe("done");
    expect(await prisma.vaneItem.findUniqueOrThrow({ where: { id: ids.item }, select: { status: true, resolvedById: true } })).toEqual({
      status: "DONE",
      resolvedById: ids.user,
    });
  });

  it("keeps a denied action, denied, and never runs it", async () => {
    const { proposed } = await proposeActions(
      prisma,
      { companyId: ids.company },
      [{ kind: "test.stamp", params: { recordId: "r9", label: "INV-0199", on: "2026-12-01" } }],
      registry,
    );
    const before = ran.length;
    const outcome = await decideAction(prisma, context(), proposed[0].id, { approve: false }, registry);
    expect(outcome.ok && outcome.action).toMatchObject({ status: "denied", decidedBy: "Rudo" });
    expect(ran.length).toBe(before);
    expect(await decideAction(prisma, context(), proposed[0].id, { approve: true }, registry)).toMatchObject({ ok: false, status: 409 });
  });
});
