/**
 * Muted's choices: a card's kind, when Vane asks to stop showing a kind, and
 * a person's presses against the database. Stop it for me hides the kind from
 * that person's For you only; Keep showing it stops the asking; Bring back
 * puts the card back and shows its kind again.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { vaneCounts, vaneMuted } from "./pages";
import { audienceFilter } from "./status";
import { bringBack, cardKey, chooseForKind, stopOffer } from "./stops";

const followUps = { type: "open", label: "Open the follow-ups", target: "/crm/follow-ups" };

describe("a card's kind", () => {
  it("is its module and where its button goes, or the button's words when it goes nowhere", () => {
    expect(cardKey({ sourceModule: "crm", action: followUps })).toBe("crm|target|/crm/follow-ups");
    expect(cardKey({ sourceModule: "crm", action: { type: "call", label: "Call them" } })).toBe("crm|label|Call them");
  });
});

describe("when Vane asks", () => {
  const month = new Date("2026-10-01T00:00:00Z");
  const aside = (id: string, day: number, action: unknown = followUps) => ({
    id,
    headline: `${id} follow-ups are overdue.`,
    sourceModule: "crm",
    action,
    resolvedAt: new Date(`2026-10-${String(day).padStart(2, "0")}T09:00:00Z`),
  });

  it("asks after the third time one kind is set aside this month, about the newest", () => {
    const three = [aside("12", 9), aside("11", 5), aside("10", 2)];
    expect(stopOffer(three.slice(0, 2), new Set(), month)).toBeNull();
    expect(stopOffer(three, new Set(), month)).toEqual({ itemId: "12", headline: "12 follow-ups are overdue.", times: 3 });
  });

  it("does not count last month, other kinds, or a kind already answered", () => {
    const old = { ...aside("9", 1), resolvedAt: new Date("2026-09-28T09:00:00Z") };
    expect(stopOffer([aside("12", 9), aside("11", 5), old], new Set(), month)).toBeNull();
    const mixed = [aside("12", 9), aside("11", 5), aside("x", 3, { type: "open", label: "Open the tasks", target: "/crm/tasks" })];
    expect(stopOffer(mixed, new Set(), month)).toBeNull();
    expect(stopOffer([aside("12", 9), aside("11", 5), aside("10", 2)], new Set(["crm|target|/crm/follow-ups"]), month)).toBeNull();
  });
});

const suffix = randomUUID().slice(0, 8);
const made = { company: "", james: "", rudo: "" };

async function card(status: "OPEN" | "MUTED", by?: string) {
  return prisma.vaneItem.create({
    data: {
      companyId: made.company,
      kind: "SUGGESTION",
      sourceModule: "crm",
      headline: `${Math.floor(Math.random() * 90) + 10} follow-ups are overdue.`,
      body: "Let's make the calls today.",
      action: followUps,
      status,
      ...(status === "MUTED" ? { mutedReason: "Not mine", resolvedAt: new Date(), resolvedById: by } : {}),
    },
  });
}

const who = (userId: string) => ({ companyId: made.company, userId, audience: audienceFilter(userId, "MANAGER") });

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `Vane stops ${suffix}`, slug: `vane-stops-${suffix}` } });
  made.company = company.id;
  for (const name of ["james", "rudo"] as const) {
    const user = await prisma.user.create({
      data: { companyId: company.id, name, email: `${name}-${suffix}@vane-stops.test`, password: "x", role: "MANAGER" },
    });
    made[name] = user.id;
  }
});

afterAll(async () => {
  const companies = { slug: { startsWith: "vane-stops-" } };
  await prisma.user.deleteMany({ where: { company: companies } });
  await prisma.company.deleteMany({ where: companies });
});

describe("a person's presses", () => {
  it("Stop it for me hides the kind from that person's For you only, and Bring back shows it again", async () => {
    const open = await card("OPEN");
    const set = [await card("MUTED", made.james), await card("MUTED", made.james), await card("MUTED", made.james)];
    const james = { companyId: made.company, userId: made.james, role: "MANAGER" };
    const rudo = { companyId: made.company, userId: made.rudo, role: "MANAGER" };

    const before = await vaneMuted(prisma, james);
    expect(before.offer).toMatchObject({ times: 3 });
    expect((await vaneMuted(prisma, rudo)).offer).toBeNull();

    expect(await chooseForKind(prisma, { ...who(made.james), itemId: before.offer!.itemId, stopped: true })).toBe(true);
    expect((await vaneCounts(prisma, james)).forYou).toBe(0);
    expect((await vaneCounts(prisma, rudo)).forYou).toBe(1);
    const after = await vaneMuted(prisma, james);
    expect(after.offer).toBeNull();
    expect(after.rows.every((row) => row.stopped)).toBe(true);

    expect(await bringBack(prisma, { ...who(made.james), itemId: set[0]!.id })).toBe(true);
    expect(await prisma.vaneItem.findUniqueOrThrow({ where: { id: set[0]!.id } })).toMatchObject({
      status: "OPEN",
      mutedReason: null,
      resolvedById: null,
    });
    expect((await vaneCounts(prisma, james)).forYou).toBe(2);
    // Brought back once: it is not set aside, so it cannot come back twice.
    expect(await bringBack(prisma, { ...who(made.james), itemId: set[0]!.id })).toBe(false);
    expect(await bringBack(prisma, { ...who(made.james), itemId: open.id })).toBe(false);
  });

  it("Keep showing it stops the asking and hides nothing", async () => {
    await prisma.vaneItem.deleteMany({ where: { companyId: made.company } });
    await prisma.vaneCardChoice.deleteMany({ where: { companyId: made.company } });
    await card("OPEN");
    for (let i = 0; i < 3; i += 1) await card("MUTED", made.rudo);
    const rudo = { companyId: made.company, userId: made.rudo, role: "MANAGER" };
    const { offer } = await vaneMuted(prisma, rudo);
    expect(await chooseForKind(prisma, { ...who(made.rudo), itemId: offer!.itemId, stopped: false })).toBe(true);
    expect((await vaneMuted(prisma, rudo)).offer).toBeNull();
    expect((await vaneCounts(prisma, rudo)).forYou).toBe(1);
  });

  it("refuses a card from another workspace", async () => {
    expect(await chooseForKind(prisma, { ...who(made.james), companyId: randomUUID(), itemId: randomUUID(), stopped: true })).toBe(false);
  });
});
