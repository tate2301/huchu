/**
 * Retail's search arm, against a real Postgres.
 *
 * One arm, so this file is short. The case worth having is the ordering: a sale
 * that never posted has `postedAt` null, and a single-key `orderBy` would sink
 * every abandoned cart to the bottom of the list regardless of when it happened.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@corelithzw/db/client";

import { searchRetail } from "./search";

let companyId: string;
let otherCompanyId: string;
let saleId: string;
let refundId: string;

beforeAll(async () => {
  const stamp = String(Date.now());
  const shop = await prisma.company.create({
    data: { name: `Retail search ${stamp}`, slug: `retail-search-${stamp}` },
    select: { id: true },
  });
  const rival = await prisma.company.create({
    data: { name: `Retail rival ${stamp}`, slug: `retail-rival-${stamp}` },
    select: { id: true },
  });
  companyId = shop.id;
  otherCompanyId = rival.id;

  const site = await prisma.site.create({
    data: { companyId, name: "Avondale branch", code: `AV-${stamp}` },
    select: { id: true },
  });

  const sale = await prisma.retailSale.create({
    data: {
      companyId,
      siteId: site.id,
      saleNo: `RS-${stamp}`,
      customerName: "Farai Moyo",
      cashierName: "Tsitsi",
      totalAmount: 84.5,
      status: "POSTED",
      postedAt: new Date("2026-08-05T14:00:00Z"),
    },
    select: { id: true },
  });
  saleId = sale.id;

  // The refund that reverses it: consecutive number, same customer, and nothing
  // but the type and the total to tell them apart.
  const refund = await prisma.retailSale.create({
    data: {
      companyId,
      siteId: site.id,
      saleNo: `RS-R-${stamp}`,
      customerName: "Farai Moyo",
      cashierName: "Tsitsi",
      saleType: "REFUND",
      totalAmount: -84.5,
      status: "POSTED",
      postedAt: new Date("2026-08-06T09:00:00Z"),
    },
    select: { id: true },
  });
  refundId = refund.id;

  await prisma.retailSale.create({
    data: {
      companyId: otherCompanyId,
      siteId: site.id,
      saleNo: `RS-X-${stamp}`,
      customerName: "Farai Moyo",
      totalAmount: 12,
    },
  });
});

afterAll(async () => {
  // Filter before querying. These ids are assigned in `beforeAll`, so if setup
  // dies partway one of them is still `undefined` — and Prisma answers an
  // `undefined` inside an `in` array with a validation error thrown from the
  // teardown, which is then the only failure reported. The real cause is buried
  // and the message points at the wrong hook entirely.
  const ids = [companyId, otherCompanyId].filter(Boolean);
  if (ids.length === 0) return;

  const companies = { in: ids };
  await prisma.retailSale.deleteMany({ where: { companyId: companies } });
  await prisma.site.deleteMany({ where: { companyId: companies } });
  await prisma.company.deleteMany({ where: { id: companies } });
});

describe("searchRetail", () => {
  it("finds a sale by the number printed on the slip", async () => {
    const results = await searchRetail(prisma, {
      companyId,
      query: "RS-",
      types: ["RETAIL_SALE"],
    });

    expect(results.map((row) => row.id)).toContain(saleId);
  });

  it("tells a refund from the sale it reverses", async () => {
    const results = await searchRetail(prisma, {
      companyId,
      query: "farai moyo",
      types: ["RETAIL_SALE"],
    });

    const refund = results.find((row) => row.id === refundId);
    expect(refund?.facts).toEqual(
      expect.arrayContaining([{ label: "Type", value: "REFUND" }]),
    );
    expect(refund?.subtitle).toContain("-84.50");
  });

  it("puts the most recent first", async () => {
    const results = await searchRetail(prisma, {
      companyId,
      query: "farai moyo",
      types: ["RETAIL_SALE"],
    });

    expect(results.map((row) => row.id)).toEqual([refundId, saleId]);
  });

  it("never crosses tenants", async () => {
    const results = await searchRetail(prisma, {
      companyId,
      query: "farai moyo",
      types: ["RETAIL_SALE"],
    });

    expect(results).toHaveLength(2);
  });

  it("does nothing when the till arm was not granted", async () => {
    const results = await searchRetail(prisma, {
      companyId,
      query: "farai moyo",
      types: [],
    });

    expect(results).toEqual([]);
  });
});
