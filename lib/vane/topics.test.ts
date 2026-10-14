/**
 * "Stop it for me", against the test database: after a person sets one topic
 * aside three times this month, Vane offers to stop it for them; stopped, its
 * cards leave their For you and its count, and not anyone else's; Show it
 * again brings them back.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { vanePanel } from "./panel";
import { monthBounds } from "./settings";
import { vaneStatus } from "./status";
import { startTopic, stopOffers, stoppedTopics, stopTopic } from "./topics";

const suffix = randomUUID().slice(0, 8);
const ids = { company: "", rudo: "", tendai: "" };
const now = new Date();

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `Vane topics ${suffix}`, slug: `vane-topics-${suffix}` } });
  const user = (name: string) =>
    prisma.user.create({ data: { email: `${name}-${suffix}@vane.test`, name, password: "x", role: "MANAGER", companyId: company.id }, select: { id: true } });
  Object.assign(ids, { company: company.id, rudo: (await user("rudo")).id, tendai: (await user("tendai")).id });
  const card = (headline: string, status: "OPEN" | "MUTED") =>
    prisma.vaneItem.create({
      data: {
        companyId: company.id,
        kind: "ISSUE",
        sourceModule: "retail",
        topic: "Short cash-up",
        headline,
        body: "Let's look at it.",
        action: {},
        status,
        ...(status === "MUTED" ? { resolvedById: ids.rudo, resolvedAt: now, mutedReason: "Not mine" } : {}),
      },
    });
  for (const day of ["Monday", "Tuesday", "Wednesday"]) await card(`${day}'s cash-up was short`, "MUTED");
  await card("Thursday's cash-up was short", "OPEN");
});

afterAll(async () => {
  await prisma.vaneTopicStop.deleteMany({ where: { companyId: ids.company } });
  await prisma.vaneItem.deleteMany({ where: { companyId: ids.company } });
  await prisma.user.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
});

describe("Stop it for me", () => {
  it("is offered once a person has set a topic aside three times this month", async () => {
    expect(await stopOffers(prisma, { companyId: ids.company, userId: ids.rudo }, monthBounds(now).start)).toEqual([{ topic: "Short cash-up", times: 3 }]);
    expect(await stopOffers(prisma, { companyId: ids.company, userId: ids.tendai }, monthBounds(now).start)).toEqual([]);
  });

  it("takes the topic's cards off that person's For you and count only, until they show it again", async () => {
    const who = { companyId: ids.company, userId: ids.rudo, role: "MANAGER" };
    await stopTopic(prisma, who, "Short cash-up");
    expect(await stoppedTopics(prisma, who)).toEqual(["Short cash-up"]);
    expect((await vanePanel(prisma, who)).items).toEqual([]);
    expect((await vaneStatus(prisma, who)).open).toBe(0);
    expect(await stopOffers(prisma, who, monthBounds(now).start)).toEqual([]);

    const other = { companyId: ids.company, userId: ids.tendai, role: "MANAGER" };
    expect((await vanePanel(prisma, other)).items.map((card) => card.headline)).toEqual(["Thursday's cash-up was short"]);

    await startTopic(prisma, who, "Short cash-up");
    expect((await vaneStatus(prisma, who)).open).toBe(1);
  });
});
