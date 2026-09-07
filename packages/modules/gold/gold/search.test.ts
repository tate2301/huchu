/**
 * Gold's search arm, against a real Postgres.
 *
 * Two things here can only be proved against the database. `GoldPour.companyId`
 * and `GoldDispatch.companyId` are **nullable** — so a `where` that forgot them
 * would still typecheck and would still return rows, just somebody else's — and
 * the dispatch arm reaches through a relation named `goldPour`, not `pour`, which
 * a mocked client would happily accept.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@corelithzw/db/client";

import { searchGold } from "./search";

let companyId: string;
let otherCompanyId: string;
let pourId: string;
let dispatchId: string;

async function makeTenant(stamp: string, label: string) {
  const company = await prisma.company.create({
    data: { name: `${label} ${stamp}`, slug: `${label}-${stamp}` },
    select: { id: true },
  });
  const site = await prisma.site.create({
    data: { companyId: company.id, name: "Shamva shaft", code: `SH-${stamp}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      email: `clerk-${label}-${stamp}@example.invalid`,
      name: "Gold clerk",
      role: "CLERK",
    },
    select: { id: true },
  });
  const witnesses = [];
  for (const suffix of ["A", "B"]) {
    const employee = await prisma.employee.create({
      data: {
        companyId: company.id,
        employeeId: `W-${suffix}-${stamp}`,
        name: `Witness ${suffix}`,
        phone: "0770000000",
        nextOfKinName: "Kin",
        nextOfKinPhone: "0770000001",
        passportPhotoUrl: "https://example.invalid/p.jpg",
        villageOfOrigin: "Village",
        position: "OPERATOR",
      },
      select: { id: true },
    });
    witnesses.push(employee.id);
  }
  return { companyId: company.id, siteId: site.id, userId: user.id, witnesses };
}

async function makePour(
  tenant: { companyId: string; siteId: string; witnesses: string[] },
  barId: string,
  storageLocation = "Strongroom",
) {
  const pour = await prisma.goldPour.create({
    data: {
      companyId: tenant.companyId,
      siteId: tenant.siteId,
      pourBarId: barId,
      pourDate: new Date("2026-07-14T08:00:00Z"),
      grossWeight: "412.5500",
      estimatedPurity: "93.20",
      witness1Id: tenant.witnesses[0],
      witness2Id: tenant.witnesses[1],
      storageLocation,
    },
    select: { id: true },
  });
  return pour.id;
}

beforeAll(async () => {
  const stamp = String(Date.now());
  const mine = await makeTenant(stamp, "gold-search");
  const rival = await makeTenant(`${stamp}b`, "gold-rival");
  companyId = mine.companyId;
  otherCompanyId = rival.companyId;

  pourId = await makePour(mine, `BAR-${stamp}`);
  const purchasePour = await makePour(mine, `BAR-P-${stamp}`);

  await prisma.goldPurchase.create({
    data: {
      companyId,
      siteId: mine.siteId,
      goldPourId: purchasePour,
      purchaseNumber: `GP-${stamp}`,
      purchaseDate: new Date("2026-07-15T08:00:00Z"),
      sellerName: "Nyasha Chikafu",
      sellerPhone: "0771234567",
      grossWeight: "88.0000",
      storageLocation: "Strongroom",
      receiver1Id: mine.witnesses[0],
      receiver2Id: mine.witnesses[1],
      paidAmount: "5400.00",
      paymentMethod: "CASH",
      createdById: mine.userId,
    },
  });

  const dispatch = await prisma.goldDispatch.create({
    data: {
      companyId,
      goldPourId: pourId,
      dispatchDate: new Date("2026-07-16T08:00:00Z"),
      courier: "Safeguard",
      vehicle: "AEB 4412",
      destination: "Fidelity Printers",
      sealNumbers: "44817",
      handedOverById: mine.witnesses[0],
    },
    select: { id: true },
  });
  dispatchId = dispatch.id;

  // The same seal number and the same seller, on another tenant.
  const rivalPour = await makePour(rival, `BAR-R-${stamp}`);
  await prisma.goldDispatch.create({
    data: {
      companyId: otherCompanyId,
      goldPourId: rivalPour,
      dispatchDate: new Date("2026-07-16T08:00:00Z"),
      courier: "Safeguard",
      vehicle: "AEB 9999",
      destination: "Fidelity Printers",
      sealNumbers: "44817",
      handedOverById: rival.witnesses[0],
    },
  });
});

afterAll(async () => {
  const companies = { in: [companyId, otherCompanyId] };
  await prisma.goldDispatch.deleteMany({ where: { companyId: companies } });
  await prisma.goldPurchase.deleteMany({ where: { companyId: companies } });
  await prisma.goldPour.deleteMany({ where: { companyId: companies } });
  await prisma.employee.deleteMany({ where: { companyId: companies } });
  await prisma.user.deleteMany({ where: { companyId: companies } });
  await prisma.site.deleteMany({ where: { companyId: companies } });
  await prisma.company.deleteMany({ where: { id: companies } });
});

describe("searchGold", () => {
  it("finds a pour by the id stamped on the bar", async () => {
    const results = await searchGold(prisma, {
      companyId,
      query: "BAR-",
      types: ["GOLD_POUR"],
    });

    expect(results.map((row) => row.id)).toContain(pourId);
    const pour = results.find((row) => row.id === pourId);
    expect(pour?.subtitle).toContain("412.550 g");
    expect(pour?.facts).toEqual(
      expect.arrayContaining([{ label: "Stored at", value: "Strongroom" }]),
    );
  });

  it("finds a purchase by the seller's surname alone", async () => {
    const results = await searchGold(prisma, {
      companyId,
      query: "chikafu",
      types: ["GOLD_PURCHASE"],
    });

    expect(results).toHaveLength(1);
    // The seller leads the row, not the purchase number.
    expect(results[0].title).toBe("Nyasha Chikafu");
    expect(results[0].facts).toEqual(
      expect.arrayContaining([{ label: "Gross weight", value: "88.000 g" }]),
    );
  });

  it("finds a dispatch by its seal number", async () => {
    // The reason this arm exists: a seal number is the only thing written on the
    // outside of a sealed parcel.
    const results = await searchGold(prisma, {
      companyId,
      query: "44817",
      types: ["GOLD_DISPATCH"],
    });

    expect(results.map((row) => row.id)).toEqual([dispatchId]);
    expect(results[0].facts).toEqual(
      expect.arrayContaining([{ label: "Destination", value: "Fidelity Printers" }]),
    );
  });

  it("says nothing about the bar once it has been received", async () => {
    // `receivedBy` is null until the other end signs, and the fact list drops
    // empty entries rather than printing a blank line.
    const results = await searchGold(prisma, {
      companyId,
      query: "44817",
      types: ["GOLD_DISPATCH"],
    });

    expect(results[0].facts.map((fact) => fact.label)).not.toContain("Received by");
  });

  it("never crosses tenants, even though companyId is nullable here", async () => {
    // Both tenants have a dispatch under seal 44817 and a bar id sharing a
    // prefix. A `where` missing its companyId would return four rows.
    const dispatches = await searchGold(prisma, {
      companyId,
      query: "44817",
      types: ["GOLD_DISPATCH"],
    });
    const pours = await searchGold(prisma, {
      companyId,
      query: "BAR-R-",
      types: ["GOLD_POUR"],
    });

    expect(dispatches).toHaveLength(1);
    expect(pours).toEqual([]);
  });

  it("runs only the arms it was given", async () => {
    const poursOnly = await searchGold(prisma, {
      companyId,
      query: "44817",
      types: ["GOLD_POUR"],
    });

    expect(poursOnly).toEqual([]);
  });
});
