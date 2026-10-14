/**
 * The live stream's Vane signature against the test database: it stays put
 * while nothing happens, and moves when a card is set aside, a job moves on,
 * a plan's step is ticked or Vane is paused. Another workspace's changes
 * leave it alone.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { vaneSignature } from "./live";

const suffix = randomUUID().slice(0, 8);
const ids = { company: "", other: "" };

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `Vane live ${suffix}`, slug: `vane-live-${suffix}` } });
  const other = await prisma.company.create({ data: { name: `Vane live other ${suffix}`, slug: `vane-live-other-${suffix}` } });
  Object.assign(ids, { company: company.id, other: other.id });
});

afterAll(async () => {
  await prisma.vaneItem.deleteMany({ where: { companyId: { in: [ids.company, ids.other] } } });
  await prisma.vaneJob.deleteMany({ where: { companyId: { in: [ids.company, ids.other] } } });
  await prisma.vanePlan.deleteMany({ where: { companyId: { in: [ids.company, ids.other] } } });
  await prisma.vaneSettings.deleteMany({ where: { companyId: { in: [ids.company, ids.other] } } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.company, ids.other] } } });
});

describe("Vane's live signature", () => {
  it("moves with each change in the workspace, and only then", async () => {
    const signature = () => vaneSignature(prisma, ids.company);
    const card = await prisma.vaneItem.create({
      data: { companyId: ids.company, kind: "ISSUE", sourceModule: "books", headline: "3 invoices are overdue.", body: ".", action: {} },
    });
    const job = await prisma.vaneJob.create({
      data: { companyId: ids.company, key: `running:${suffix}`, kind: "nightly", label: "Matching CBZ lines", trigger: "NIGHTLY", status: "RUNNING", progressDone: 3, progressTotal: 61 },
    });
    const plan = await prisma.vanePlan.create({
      data: { companyId: ids.company, title: "VAT", steps: { create: [{ position: 1, label: "File it", owner: "PERSON" }] } },
      include: { steps: true },
    });
    await prisma.vaneSettings.create({ data: { companyId: ids.company } });

    let last = await signature();
    expect(await signature()).toBe(last);

    const changes: Array<[string, () => Promise<unknown>]> = [
      ["a card set aside", () => prisma.vaneItem.update({ where: { id: card.id }, data: { status: "MUTED", resolvedAt: new Date() } })],
      ["a job moved on", () => prisma.vaneJob.update({ where: { id: job.id }, data: { progressDone: 38 } })],
      ["a step ticked", () => prisma.vanePlanStep.update({ where: { id: plan.steps[0].id }, data: { status: "DONE", doneAt: new Date() } })],
      ["Vane paused", () => prisma.vaneSettings.update({ where: { companyId: ids.company }, data: { paused: true } })],
    ];
    for (const [what, change] of changes) {
      await change();
      const next = await signature();
      expect(next, what).not.toBe(last);
      last = next;
    }

    await prisma.vaneItem.create({
      data: { companyId: ids.other, kind: "ISSUE", sourceModule: "books", headline: "Another workspace's.", body: ".", action: {} },
    });
    expect(await signature()).toBe(last);
  });
});
