import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { planShiftOpen } from "./shift-open";
import { openShiftSchema, shiftOpenedSentence, tillWords } from "./shift-open-rules";

/**
 * Opening a shift for somebody else (00-foundations 5.7.8): who may, for whom,
 * on which till.
 */

let companyId: string;
let siteId: string;
let backTillId: string;
const people: Record<string, { id: string; name: string; role: string }> = {};

const sessionOf = (who: keyof typeof people) => ({
  user: { id: people[who]!.id, companyId, role: people[who]!.role, name: people[who]!.name },
});

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  companyId = (await prisma.company.create({ data: { name: `Shift open ${stamp}`, slug: `shift-open-${stamp}` } })).id;
  siteId = (await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "MAIN" } })).id;
  backTillId = (await prisma.retailRegister.create({ data: { companyId, siteId, code: "TILL-2", name: "Back till" } })).id;
  for (const [key, name, role] of [
    ["manager", "Tafara Nyathi", "MANAGER"],
    ["farai", "Farai Moyo", "CASHIER"],
    ["chipo", "Chipo Dube", "CASHIER"],
    ["clerk", "Tendai Sibanda", "STOCK_CLERK"],
  ] as const) {
    const user = await prisma.user.create({
      data: { companyId, name, role, email: `${key}-${stamp}@shift-open.test`, password: "x" },
      select: { id: true },
    });
    people[key] = { id: user.id, name, role };
  }
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("planShiftOpen", () => {
  it("lets a manager open the back till for Farai Moyo", async () => {
    const planned = await planShiftOpen({
      session: sessionOf("manager"),
      registerId: backTillId,
      cashierId: people.farai!.id,
    });
    expect(planned).toEqual({
      plan: {
        register: { id: backTillId, code: "TILL-2", name: "Back till", siteId },
        cashier: { id: people.farai!.id, name: "Farai Moyo" },
      },
    });
  });

  it("refuses a cashier opening one for somebody else, but not for themselves", async () => {
    expect(
      await planShiftOpen({ session: sessionOf("chipo"), registerId: backTillId, cashierId: people.farai!.id }),
    ).toEqual({ refused: { status: 403, error: "Your role cannot change shifts and cash" } });
    const own = await planShiftOpen({ session: sessionOf("chipo"), registerId: backTillId });
    expect("plan" in own && own.plan.cashier.name).toBe("Chipo Dube");
  });

  it("refuses a person who cannot sell", async () => {
    expect(
      await planShiftOpen({ session: sessionOf("manager"), registerId: backTillId, cashierId: people.clerk!.id }),
    ).toEqual({ refused: { status: 400, error: "Tendai Sibanda cannot sell at a till.", field: "who" } });
  });

  it("refuses a till that already has an open shift, and a cashier who has one", async () => {
    const shift = await prisma.retailShift.create({
      data: {
        companyId,
        siteId,
        shiftNo: "SH-00001",
        registerCode: "TILL-2",
        registerName: "Back till",
        cashierId: people.farai!.id,
        cashierName: "Farai Moyo",
      },
    });
    expect(
      await planShiftOpen({ session: sessionOf("manager"), registerId: backTillId, cashierId: people.chipo!.id }),
    ).toEqual({ refused: { status: 409, error: "Back till already has an open shift." } });

    const front = await prisma.retailRegister.create({ data: { companyId, siteId, code: "TILL-1", name: "Front till" } });
    expect(
      await planShiftOpen({ session: sessionOf("manager"), registerId: front.id, cashierId: people.farai!.id }),
    ).toEqual({ refused: { status: 409, error: "Farai Moyo already has a shift open on the back till." } });
    await prisma.retailShift.delete({ where: { id: shift.id } });
  });

  it("answers 404 for a till of another company", async () => {
    expect(
      await planShiftOpen({
        session: sessionOf("manager"),
        registerId: "00000000-0000-4000-8000-000000000000",
        cashierId: people.farai!.id,
      }),
    ).toEqual({ refused: { status: 404, error: "Till not found", field: "till" } });
  });
});

describe("the words", () => {
  it("says the till the way people do", () => {
    expect(tillWords("Back till")).toBe("the back till");
    expect(tillWords("Handheld 1")).toBe("Handheld 1");
    expect(shiftOpenedSentence({ shiftNo: "SH-00243", registerName: "Back till", cashierName: "Farai Moyo" })).toBe(
      "SH-00243 open on the back till for Farai Moyo.",
    );
  });

  it("takes the float as the sheet sends it", () => {
    expect(openShiftSchema.parse({ registerId: "00000000-0000-4000-8000-000000000000", openingFloat: "100.00" }).openingFloat).toBe(100);
    expect(openShiftSchema.safeParse({ registerId: "00000000-0000-4000-8000-000000000000", openingFloat: "1.234" }).success).toBe(false);
    expect(openShiftSchema.safeParse({ registerId: "00000000-0000-4000-8000-000000000000", openingFloat: "-1" }).success).toBe(false);
  });
});
