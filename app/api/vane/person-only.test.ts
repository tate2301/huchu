/**
 * The witness that Vane changes nothing by itself: every Vane route that
 * changes data (Not now, Give Vane a job, ticking a plan step, Pause and
 * Resume) answers only a signed-in person. A request with no person behind
 * it, such as the scheduled-jobs tick calling with its own secret, is refused
 * with 401 and the rows stay as they were. The checks run through the real session guard
 * against the database, nothing mocked.
 */
import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { POST as giveJob } from "./jobs/route";
import { POST as mute } from "./items/[id]/mute/route";
import { PATCH as tickStep } from "./plans/[id]/steps/[stepId]/route";
import { PATCH as changeSettings } from "./settings/route";

const suffix = randomUUID().slice(0, 8);
let companyId = "";
let itemId = "";
const plan = { id: "", personStep: "" };

/** A request as something other than a person makes it: no session cookie, only the tick's bearer secret. */
function notAPerson(path: string, method: string, body: unknown) {
  return new NextRequest(`http://floorcode.apps.pagka.local:3100${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer not-a-person" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `Vane person-only ${suffix}`, slug: `vane-person-only-${suffix}` } });
  companyId = company.id;
  await prisma.vaneSettings.create({ data: { companyId } });
  const item = await prisma.vaneItem.create({
    data: {
      companyId,
      kind: "ISSUE",
      sourceModule: "books",
      headline: "3 invoices are past their terms.",
      body: "Let's call them first.",
      action: { type: "open", label: "Open the invoices", target: "/books/invoices?view=overdue" },
    },
  });
  itemId = item.id;
  const made = await prisma.vanePlan.create({
    data: {
      companyId,
      title: "Collect what is overdue",
      steps: {
        create: [
          { position: 1, label: "List what each customer owes", owner: "VANE", status: "DONE" },
          { position: 2, label: "Call the customers who owe the most", owner: "PERSON", status: "NOW" },
        ],
      },
    },
    include: { steps: true },
  });
  plan.id = made.id;
  plan.personStep = made.steps.find((step) => step.owner === "PERSON")!.id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: "vane-person-only-" } } });
});

describe("Vane's data changes need a person", () => {
  it("refuses Not now without a signed-in person, and the card stays open", async () => {
    const response = await mute(notAPerson(`/api/vane/items/${itemId}/mute`, "POST", { reason: "Wrong" }), {
      params: Promise.resolve({ id: itemId }),
    });
    expect(response.status).toBe(401);
    const item = await prisma.vaneItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item).toMatchObject({ status: "OPEN", mutedReason: null, resolvedById: null, resolvedAt: null });
  });

  it("refuses a job given without a signed-in person, and queues nothing", async () => {
    const response = await giveJob(notAPerson("/api/vane/jobs", "POST", { text: "Send every overdue customer a reminder" }));
    expect(response.status).toBe(401);
    expect(await prisma.vaneJob.count({ where: { companyId } })).toBe(0);
  });

  it("refuses ticking a person's plan step without a signed-in person, and the step stays as it was", async () => {
    const response = await tickStep(notAPerson(`/api/vane/plans/${plan.id}/steps/${plan.personStep}`, "PATCH", { done: true }), {
      params: Promise.resolve({ id: plan.id, stepId: plan.personStep }),
    });
    expect(response.status).toBe(401);
    expect(await prisma.vanePlanStep.findUniqueOrThrow({ where: { id: plan.personStep } })).toMatchObject({ status: "NOW", doneAt: null });
    expect(await prisma.vanePlan.findUniqueOrThrow({ where: { id: plan.id } })).toMatchObject({ status: "OPEN" });
  });

  it("refuses Pause without a signed-in person, and Vane keeps working", async () => {
    const response = await changeSettings(notAPerson("/api/vane/settings", "PATCH", { paused: true }));
    expect(response.status).toBe(401);
    const settings = await prisma.vaneSettings.findUniqueOrThrow({ where: { companyId } });
    expect(settings.paused).toBe(false);
  });
});
