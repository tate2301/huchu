/**
 * Adding a customer (CUS-02, W-45), against the test database: a Zimbabwean
 * number written one way, a number a live customer has refused with who has
 * it, two adds of one number at once let only one through, and two of
 * different numbers take their own codes and cards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { createCustomer, CustomerRefusal, parseBirthday, type CustomerInput } from "./create";

let shop: TestShop;

beforeAll(async () => {
  shop = await makeTestShop("CustomerNew");
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
}, 60_000);

const add = (input: CustomerInput) => prisma.$transaction((tx) => createCustomer(tx, shop.manager(), input));

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CustomerRefusal) return { status: error.status, message: error.message, fieldErrors: error.fieldErrors, existing: error.existing };
    throw error;
  }
  return null;
}

describe("adding a customer", () => {
  it("writes the number one way, numbers them and their card, and says so in Activity", async () => {
    const made = await add({ phone: "0774 123 388", name: " Tapiwa Marange ", marketingConsent: true, dateOfBirth: "14 March 1988", area: "Mbare, Harare" });
    expect(made).toMatchObject({ name: "Tapiwa Marange", phone: "+263774123388" });
    expect(made.code).toMatch(/^CUS-\d{5}$/);
    expect(made.cardNo).toBe(`600914${made.code.slice(4).padStart(6, "0")}`);
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: made.id } });
    expect(row).toMatchObject({ marketingConsent: true, area: "Mbare, Harare", createdById: shop.managerId });
    expect(row.consentChangedAt).not.toBeNull();
    expect(row.dateOfBirth?.toISOString().slice(0, 10)).toBe("1988-03-14");
    const event = await prisma.platformAuditEvent.findFirst({ where: { companyId: shop.companyId, entityId: made.id, eventType: "RETAIL_CUSTOMER.CREATED" } });
    expect(JSON.parse(String(event?.payloadJson))).toMatchObject({ code: made.code, name: "Tapiwa Marange", consent: true, via: "sheet" });
  });

  it("refuses a number a live customer has, naming them", async () => {
    const tapiwa = await prisma.customer.findFirstOrThrow({ where: { companyId: shop.companyId, phone: "+263774123388" }, select: { id: true } });
    expect(await refusal(add({ phone: "+263 77 412 3388", name: "Simba Nkomo" }))).toEqual({
      status: 409,
      message: "Tapiwa Marange already has this number.",
      fieldErrors: { phone: "Tapiwa Marange already has this number." },
      existing: { id: tapiwa.id, name: "Tapiwa Marange" },
    });
  });

  it("refuses what is not a number, no name, and a birthday it cannot read", async () => {
    expect(await refusal(add({ phone: "12", name: "Simba" }))).toMatchObject({ status: 400, fieldErrors: { phone: "That is not a phone number." } });
    expect(await refusal(add({ phone: "0715540912", name: "  " }))).toMatchObject({ status: 400, fieldErrors: { name: "Add their name." } });
    expect(await refusal(add({ phone: "0715540912", name: "Simba", dateOfBirth: "next Tuesday" }))).toMatchObject({
      status: 400,
      fieldErrors: { dob: "Write it as 14 March 1988." },
    });
    expect(await refusal(add({ phone: "0715540912", name: "Simba", dateOfBirth: "14/03/2999" }))).toMatchObject({ status: 400 });
    expect(await prisma.customer.count({ where: { companyId: shop.companyId, name: "Simba" } })).toBe(0);
  });

  it("lets one of two adds of one number at once through", async () => {
    const results = await Promise.allSettled([
      add({ phone: "+263 71 554 0912", name: "Simba Nkomo", via: "till" }),
      add({ phone: "0715540912", name: "Simba N.", via: "lookup" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((result): result is PromiseRejectedResult => result.status === "rejected")!;
    expect(refused.reason).toBeInstanceOf(CustomerRefusal);
    expect((refused.reason as CustomerRefusal).status).toBe(409);
    expect(await prisma.customer.count({ where: { companyId: shop.companyId, phone: "+263715540912" } })).toBe(1);
  });

  it("gives two adds of different numbers at once their own codes and cards", async () => {
    const [a, b] = await Promise.all([add({ phone: "0773000001", name: "Rudo Chirwa" }), add({ phone: "0773000002", name: "Kudzai Zhou" })]);
    expect(a.code).not.toBe(b.code);
    expect(a.cardNo).not.toBe(b.cardNo);
  });
});

describe("a birthday as typed", () => {
  it("reads the three ways it is written", () => {
    expect(parseBirthday("14 March 1988")?.toISOString().slice(0, 10)).toBe("1988-03-14");
    expect(parseBirthday("14/03/1988")?.toISOString().slice(0, 10)).toBe("1988-03-14");
    expect(parseBirthday("1988-03-14")?.toISOString().slice(0, 10)).toBe("1988-03-14");
    expect(parseBirthday("31 February 1988")).toBeNull();
  });
});
