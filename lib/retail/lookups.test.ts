import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { addLookupOption, rankOptions, searchLookup, type LookupCtx } from "./lookups";
import { categorySub, parseVat, parseYesNo } from "./lookups/products";
import { nextTillCode } from "./tills";

/**
 * The lookups behind every `auto` field (00-foundations 4.4) and their inline
 * add (F-3), against the test database.
 */

let companyId: string;
let siteId: string;

const as = (role: string): LookupCtx => ({
  companyId,
  userId: "00000000-0000-0000-0000-000000000000",
  userName: "Test",
  session: { user: { role } },
});

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const company = await prisma.company.create({
    data: { name: `Lookups ${stamp}`, slug: `lookups-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;
  const site = await prisma.site.create({
    data: { companyId, name: "Harare Main Branch", code: "MAIN" },
    select: { id: true },
  });
  siteId = site.id;
  await prisma.retailRegister.createMany({
    data: [
      { companyId, siteId, code: "TILL-1", name: "Front till" },
      { companyId, siteId, code: "TILL-2", name: "Back till" },
    ],
  });
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.retailCategory.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("category quick add", () => {
  it("creates a category with VAT 15% and the age check from the panel's defaults", async () => {
    const answer = await addLookupOption(as("MANAGER"), "category", { name: "Mixers", vat: "15%", age: "Yes" });
    expect(answer.status).toBe(201);
    if (answer.status !== 201) return;
    expect(answer.body.option).toMatchObject({ label: "Mixers", sub: "VAT 15%, age check" });

    const row = await prisma.retailCategory.findUniqueOrThrow({ where: { id: answer.body.option.id } });
    expect(row.companyId).toBe(companyId);
    expect(row.vatRate.toFixed(2)).toBe("15.00");
    expect(row.ageRestricted).toBe(true);
  });

  it("refuses a duplicate name with a field error", async () => {
    const answer = await addLookupOption(as("SUPERADMIN"), "category", { name: "Mixers", vat: "15%", age: "No" });
    expect(answer).toEqual({
      status: 400,
      body: {
        error: "There is already a category called Mixers.",
        fieldErrors: { name: "There is already a category called Mixers." },
      },
    });
  });

  it("refuses a cashier with 403", async () => {
    const answer = await addLookupOption(as("CASHIER"), "category", { name: "Snacks 2", vat: "15%", age: "No" });
    expect(answer).toEqual({ status: 403, body: { error: "Your role cannot create categories" } });
    expect(await prisma.retailCategory.count({ where: { companyId, name: "Snacks 2" } })).toBe(0);
  });

  it("says which quick field is wrong", async () => {
    const answer = await addLookupOption(as("MANAGER"), "category", { name: "", vat: "lots", age: "maybe" });
    expect(answer.status).toBe(400);
    if (answer.status !== 400) return;
    expect(answer.body.fieldErrors).toEqual({
      name: "Name is needed.",
      vat: "Give VAT as 15%, Zero-rated or Exempt.",
      age: "Say Yes or No.",
    });
  });

  it("finds it again, prefix matches first, with the add panel for a manager", async () => {
    const answer = await searchLookup(as("MANAGER"), "category", { q: "mi" });
    expect(answer.status).toBe(200);
    if (answer.status !== 200) return;
    expect(answer.body.options[0]).toMatchObject({ label: "Mixers", sub: "VAT 15%, age check" });
    expect(answer.body.add?.quick.map((field) => field.label)).toEqual(["Name", "VAT", "18+ check"]);
  });
});

describe("till lookup", () => {
  it("reads Open while a shift is open on the till, else Closed", async () => {
    const cashier = await prisma.user.create({
      data: {
        companyId,
        name: "Farai Moyo",
        email: `farai-${companyId}@lookups.test`,
        password: "x",
        role: "CASHIER",
      },
      select: { id: true },
    });
    const shift = await prisma.retailShift.create({
      data: {
        companyId,
        siteId,
        shiftNo: "SH-00001",
        registerCode: "TILL-2",
        registerName: "Back till",
        registerId: (await prisma.retailRegister.findFirstOrThrow({ where: { companyId, code: "TILL-2" } })).id,
        cashierId: cashier.id,
        cashierName: "Farai Moyo",
      },
      select: { id: true },
    });
    try {
      const answer = await searchLookup(as("MANAGER"), "till", {});
      expect(answer.status).toBe(200);
      if (answer.status !== 200) return;
      expect(answer.body.options.map((option) => [option.label, option.sub])).toEqual([
        ["Front till", "Closed"],
        ["Back till", "Open"],
      ]);

      const sellers = await searchLookup(as("MANAGER"), "person", { context: { sells: true } });
      expect(sellers.status === 200 && sellers.body.options).toEqual([
        { id: cashier.id, label: "Farai Moyo", sub: "Cashier" },
      ]);
    } finally {
      await prisma.retailShift.delete({ where: { id: shift.id } });
      await prisma.user.delete({ where: { id: cashier.id } });
    }
  });

  it("adds a till with the next TILL-<n> code, closed, and refuses its name twice", async () => {
    const answer = await addLookupOption(as("MANAGER"), "till", { name: "Kora" });
    expect(answer.status).toBe(201);
    if (answer.status !== 201) return;
    expect(answer.body.option).toMatchObject({ label: "Kora", sub: "Closed" });
    const row = await prisma.retailRegister.findUniqueOrThrow({ where: { id: answer.body.option.id } });
    expect(row).toMatchObject({ companyId, siteId, code: "TILL-3", name: "Kora", isActive: true });

    expect(await addLookupOption(as("MANAGER"), "till", { name: "kora" })).toMatchObject({
      status: 400,
      body: { fieldErrors: { name: "There is already a till called kora." } },
    });
  });

  it("is closed to a stock clerk, and a cashier sees no add option", async () => {
    expect(await searchLookup(as("STOCK_CLERK"), "till", {})).toEqual({
      status: 403,
      body: { error: "Your role cannot view tills and devices" },
    });
    const cashier = await searchLookup(as("CASHIER"), "till", {});
    expect(cashier.status === 200 && cashier.body.add).toBeNull();
    expect((await addLookupOption(as("CASHIER"), "till", { name: "Mine" })).status).toBe(403);
  });

  it("answers 404 for a noun nobody registered", async () => {
    expect((await searchLookup(as("SUPERADMIN"), "spaceship", {})).status).toBe(404);
  });
});

describe("supplier, contact and contact role lookups", () => {
  let manager: LookupCtx;
  let deltaId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `tafara-${companyId}@lookups.test`, name: "Tafara Nyathi", role: "MANAGER", companyId },
      select: { id: true },
    });
    manager = { ...as("MANAGER"), userId: user.id, userName: "Tafara Nyathi" };
  });

  it("adds a supplier from the panel, then finds it with its terms", async () => {
    const answer = await addLookupOption(manager, "supplier", { name: "Delta Beverages", phone: "0772149080" });
    expect(answer.status).toBe(201);
    if (answer.status !== 201) return;
    expect(answer.body).toMatchObject({ option: { label: "Delta Beverages" }, notice: "Delta Beverages added. It is in every supplier field now." });
    deltaId = answer.body.option.id;
    expect(await prisma.vendor.findUniqueOrThrow({ where: { id: deltaId } })).toMatchObject({ code: "SUP-0001", whatsapp: "+263 77 214 9080" });

    const found = await searchLookup(manager, "supplier", { q: "delta" });
    expect(found.status === 200 && found.body.options).toEqual([{ id: deltaId, label: "Delta Beverages", sub: "on delivery" }]);
  });

  it("refuses the same name from the panel under Name", async () => {
    expect(await addLookupOption(manager, "supplier", { name: "delta beverages", phone: "" })).toMatchObject({
      status: 400,
      body: { fieldErrors: { name: "There is already a supplier called Delta Beverages." } },
    });
  });

  it("adds the first contact as the rep and lists them by the supplier", async () => {
    const answer = await addLookupOption(manager, "contact", { name: "Tinashe Moyo", phone: "0773012290" }, { supplierId: deltaId });
    expect(answer.status === 201 && answer.body.option).toMatchObject({ label: "Tinashe Moyo, rep", sub: "+263 77 301 2290" });
    const found = await searchLookup(manager, "contact", { context: { supplierId: deltaId } });
    expect(found.status === 200 && found.body.options.map((option) => option.label)).toEqual(["Tinashe Moyo, rep"]);
  });

  it("offers the four roles, and gives back a new word as typed", async () => {
    const found = await searchLookup(manager, "contact role", {});
    expect(found.status === 200 && found.body.options.map((option) => option.label)).toEqual(["Sales rep", "Accounts", "Orders desk", "Driver"]);
    const added = await addLookupOption(manager, "contact role", { name: " Credit  controller " });
    expect(added.status === 201 && added.body.option).toEqual({ id: "Credit controller", label: "Credit controller", sub: null });
  });

  it("is closed to a cashier, and a stock clerk reads but cannot add", async () => {
    for (const noun of ["supplier", "contact", "contact role"]) {
      expect(await searchLookup(as("CASHIER"), noun, { context: { supplierId: deltaId } })).toEqual({
        status: 403,
        body: { error: "Your role cannot view suppliers" },
      });
      const clerk = await searchLookup(as("STOCK_CLERK"), noun, { context: { supplierId: deltaId } });
      expect(clerk.status === 200 && clerk.body.add).toBeNull();
    }
    expect(await addLookupOption(as("STOCK_CLERK"), "supplier", { name: "Natbrew", phone: "" })).toEqual({
      status: 403,
      body: { error: "Your role cannot create suppliers" },
    });
    expect(await addLookupOption(as("STOCK_CLERK"), "contact", { name: "Rumbi Chari", phone: "0772000000" }, { supplierId: deltaId })).toEqual({
      status: 403,
      body: { error: "Your role cannot change suppliers" },
    });
    expect(await prisma.vendor.count({ where: { companyId, name: "Natbrew" } })).toBe(0);
  });
});

describe("the small rules", () => {
  it("ranks prefix matches before the rest", () => {
    const options = ["Ice and mixers", "Mixers", "Spirits"].map((label) => ({ id: label, label, sub: null }));
    expect(rankOptions(options, "mix").map((option) => option.label)).toEqual(["Mixers", "Ice and mixers"]);
  });

  it("counts the next till code from TILL-<n> codes only", () => {
    expect(nextTillCode([])).toBe("TILL-1");
    expect(nextTillCode(["TILL-1", "TILL-2", "REG-0009"])).toBe("TILL-3");
  });

  it("reads VAT and yes/no the way people type them", () => {
    expect(parseVat("15%")).toBe("STANDARD");
    expect(parseVat("0%")).toBe("ZERO_RATED");
    expect(parseVat("Zero-rated")).toBe("ZERO_RATED");
    expect(parseVat("Exempt")).toBe("EXEMPT");
    expect(parseVat("7.5")).toBeNull();
    expect(parseVat("lots")).toBeNull();
    expect(parseYesNo("yes")).toBe(true);
    expect(parseYesNo("No")).toBe(false);
    expect(categorySub({ vatRate: "15.00", ageRestricted: false })).toBe("VAT 15%");
    expect(categorySub({ vatRate: "0.00", vatExempt: false, ageRestricted: false })).toBe("VAT 0%");
    expect(categorySub({ vatRate: "0.00", vatExempt: true, ageRestricted: false })).toBe("VAT exempt");
  });
});
