import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { peekIdentifier, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";

/**
 * A shift's, a sale's, a till's, an order's and a receipt's number is unique in
 * the company, so the next one counts across every site. Counted per site, a
 * second shop's till offered SH-00014 while the first shop already had it, and
 * every try to open the shift collided: "Unable to generate shift number".
 */

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId = "";
let mainId = "";
let counterId = "";

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Retail numbers ${stamp}`, slug: `retailno-${stamp}` }, select: { id: true } })).id;
  mainId = (await prisma.site.create({ data: { companyId, name: "Main", code: "MAIN" }, select: { id: true } })).id;
  counterId = (await prisma.site.create({ data: { companyId, name: "Counter", code: "CTR" }, select: { id: true } })).id;
  const till = await prisma.retailRegister.create({ data: { companyId, siteId: mainId, code: "REG-0001", name: "Till 1" } });
  const cashier = await prisma.user.create({
    data: { companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@retailno.test`, password: "x" },
    select: { id: true },
  });
  for (const shiftNo of ["SH-00012", "SH-00013"]) {
    await prisma.retailShift.create({
      data: {
        companyId,
        shiftNo,
        registerCode: till.code,
        registerName: till.name,
        registerId: till.id,
        siteId: mainId,
        cashierId: cashier.id,
        cashierName: "Chipo Dube",
        status: "CLOSED",
      },
    });
  }
});

afterAll(async () => {
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("retail numbers across a company's sites", () => {
  it("offers a second site the next shift number in the company, not its own first", async () => {
    expect(await peekIdentifier(prisma, { companyId, entity: "RETAIL_SHIFT", siteId: counterId })).toBe("SH-00014");
    expect(await reserveIdentifier(prisma, { companyId, entity: "RETAIL_SHIFT", siteId: counterId })).toBe("SH-00014");
    expect(await reserveIdentifier(prisma, { companyId, entity: "RETAIL_SHIFT", siteId: mainId })).toBe("SH-00015");
    expect(await peekIdentifier(prisma, { companyId, entity: "RETAIL_SHIFT", siteId: counterId })).toBe("SH-00016");
  });

  it("counts a till's code across the company too", async () => {
    expect(await reserveIdentifier(prisma, { companyId, entity: "RETAIL_REGISTER", siteId: counterId })).toBe("REG-0002");
  });

  it("skips a number no sequence could have handed out, like a till's old clock-named offline sale", async () => {
    // Checkout failed with "value 1787005857220984 is out of range for type integer".
    await prisma.retailRegister.create({ data: { companyId, siteId: counterId, code: "REG-1787005857220984", name: "Old till" } });
    await prisma.idSequence.deleteMany({ where: { companyId, entityKey: "RETAIL_REGISTER" } });
    expect(await reserveIdentifier(prisma, { companyId, entity: "RETAIL_REGISTER", siteId: counterId })).toBe("REG-0002");
  });
});
