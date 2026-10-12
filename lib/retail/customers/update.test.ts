/**
 * Changing a customer (CUS-03, W-62), against the test database: each
 * field's rule, the tier held for a year and let go, a card another customer
 * holds, a customer in the bin, and one Activity line per changed field.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { moveToBin, restoreFromBin } from "@/lib/retail/bin";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { CustomerRefusal } from "./create";
import { updateCustomer } from "./update";

let shop: TestShop;
let tapiwa: string;
let nyasha: string;
let retail: string;
const NOW = new Date("2026-10-03T10:00:00+02:00");

beforeAll(async () => {
  shop = await makeTestShop("CustomerEdit");
  const make = (name: string, phone: string, cardNo: string) =>
    prisma.customer.create({ data: { companyId: shop.companyId, name, phone, cardNo, area: "Mbare, Harare" }, select: { id: true } });
  tapiwa = (await make("Tapiwa Marange", "+263774123388", "600914000141")).id;
  nyasha = (await make("Nyasha Gwenzi", "+263712209014", "600914000142")).id;
  retail = (await prisma.priceList.create({ data: { companyId: shop.companyId, name: "Wholesale" }, select: { id: true } })).id;
  // US$800 in 12 months: Silver by spend.
  await prisma.retailSale.create({
    data: { companyId: shop.companyId, saleNo: `T-${Date.now()}-edit`, siteId: shop.mainId, customerId: tapiwa, totalAmount: "800.00", baseAmount: "800.00", postedAt: new Date(NOW.getTime() - 86_400_000) },
  });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
}, 60_000);

const edit = (id: string, body: unknown) => prisma.$transaction((tx) => updateCustomer(tx, shop.manager(), id, body, NOW));

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CustomerRefusal) return { status: error.status, message: error.message, fieldErrors: error.fieldErrors };
    throw error;
  }
  return null;
}

const edited = (id: string) =>
  prisma.platformAuditEvent.findMany({
    where: { companyId: shop.companyId, entityId: id, eventType: "RETAIL_RECORD.EDITED" },
    orderBy: { createdAt: "asc" },
    select: { payloadJson: true },
  });

describe("changing a customer", () => {
  it("changes several fields in one go, one Activity line each", async () => {
    const before = (await edited(tapiwa)).length;
    const changed = await edit(tapiwa, { area: "Mbare", email: " Tapiwa@Example.com ", dateOfBirth: "14 March 1988", name: "Tapiwa Marange" });
    expect(changed).toEqual([
      { field: "email", from: null, to: "tapiwa@example.com" },
      { field: "area", from: "Mbare, Harare", to: "Mbare" },
      { field: "dateOfBirth", from: null, to: "14 March 1988" },
    ]);
    const events = (await edited(tapiwa)).slice(before).map((event) => JSON.parse(String(event.payloadJson)));
    expect(events.map((event) => event.label)).toEqual(["Email", "Area", "Date of birth"]);
    expect(events[1]).toMatchObject({ from: "Mbare, Harare", to: "Mbare" });
  });

  it("refuses each field's wrong value under the field, all at once", async () => {
    expect(await refusal(edit(tapiwa, { email: "tapiwa@", name: "  ", dateOfBirth: "31 February 1990", phone: "12" }))).toEqual({
      status: 400,
      message: "Add their name.",
      fieldErrors: {
        name: "Add their name.",
        phone: "That is not a phone number.",
        email: "That is not an email address.",
        dateOfBirth: "Write it as 14 March 1988.",
      },
    });
    expect(await refusal(edit(tapiwa, {}))).toMatchObject({ status: 400, message: "Change something first." });
  });

  it("keeps WhatsApp as the same number, and refuses another customer's phone", async () => {
    expect(await edit(tapiwa, { whatsapp: "0774 123 388" })).toEqual([]);
    expect(await edit(tapiwa, { whatsapp: "0712 345 678" })).toEqual([{ field: "whatsapp", from: "Same number", to: "+263 71 234 5678" }]);
    expect(await edit(tapiwa, { whatsapp: null })).toEqual([{ field: "whatsapp", from: "+263 71 234 5678", to: "Same number" }]);
    expect(await refusal(edit(tapiwa, { phone: "+263 71 220 9014" }))).toMatchObject({
      status: 409,
      fieldErrors: { phone: "Nyasha Gwenzi already has this number." },
    });
  });

  it("takes a card of 12 digits nobody else holds", async () => {
    expect(await refusal(edit(tapiwa, { cardNo: "6009 1400" }))).toMatchObject({ status: 400, fieldErrors: { cardNo: "A card number is 12 digits." } });
    expect(await refusal(edit(tapiwa, { cardNo: "6009 1400 0142" }))).toMatchObject({
      status: 409,
      fieldErrors: { cardNo: "That card is Nyasha Gwenzi’s." },
    });
    expect(await edit(tapiwa, { cardNo: "6009 1400 0999" })).toEqual([{ field: "cardNo", from: "6009 1400 0141", to: "6009 1400 0999" }]);
  });

  it("holds a tier for a year, and lets it go for the one spend gives", async () => {
    expect(await refusal(edit(tapiwa, { tier: "Platinum" }))).toMatchObject({ status: 400, fieldErrors: { tier: "That is not a tier." } });
    await edit(tapiwa, { tier: "Gold" });
    let row = await prisma.customer.findUniqueOrThrow({ where: { id: tapiwa }, select: { tierHeld: true, tierHeldUntil: true } });
    expect(row.tierHeld).toBe("Gold");
    expect(row.tierHeldUntil?.toISOString().slice(0, 10)).toBe("2027-10-03");
    const set = await prisma.platformAuditEvent.findFirst({
      where: { companyId: shop.companyId, entityId: tapiwa, eventType: "RETAIL_CUSTOMER.TIER_SET" },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.parse(String(set?.payloadJson))).toMatchObject({ tier: "Gold", until: "2027-10-03" });

    await edit(tapiwa, { tier: "Silver" });
    row = await prisma.customer.findUniqueOrThrow({ where: { id: tapiwa }, select: { tierHeld: true, tierHeldUntil: true } });
    expect(row).toEqual({ tierHeld: null, tierHeldUntil: null });
  });

  it("writes consent with when and how, and takes only this shop's live price lists", async () => {
    await edit(tapiwa, { marketingConsent: true, via: "sheet" });
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: tapiwa }, select: { marketingConsent: true, consentChangedAt: true } });
    expect(row).toEqual({ marketingConsent: true, consentChangedAt: NOW });
    const consent = await prisma.platformAuditEvent.findFirst({ where: { companyId: shop.companyId, entityId: tapiwa, eventType: "RETAIL_CUSTOMER.CONSENT_CHANGED" } });
    expect(JSON.parse(String(consent?.payloadJson))).toMatchObject({ agreed: true, via: "sheet" });

    expect(await refusal(edit(tapiwa, { priceListId: "00000000-0000-4000-8000-000000000000" }))).toMatchObject({
      status: 400,
      fieldErrors: { priceListId: "That price list is not this shop’s." },
    });
    expect(await edit(tapiwa, { priceListId: retail })).toEqual([{ field: "priceListId", from: null, to: "Wholesale" }]);
  });

  it("changes nothing on a customer in the bin", async () => {
    await moveToBin(shop.manager(), { kind: "customer", id: nyasha });
    expect(await refusal(edit(nyasha, { area: "Avondale" }))).toEqual({ status: 409, message: "Restore it to change it", fieldErrors: {} });
    await restoreFromBin(shop.owner(), { kind: "customer", id: nyasha });
  });
});
