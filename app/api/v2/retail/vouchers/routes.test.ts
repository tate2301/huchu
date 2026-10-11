import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { expireVouchers } from "@/lib/retail/vouchers/expire";
import { issueVoucher } from "@/lib/retail/vouchers/issue";
import { checkVoucher, LOCKED, WRONG_SECRET } from "@/lib/retail/vouchers/redeem";

/**
 * Vouchers' back-office routes (PRD-10, W-18) against the test database: a
 * cashier, a bookkeeper and a stock clerk cannot issue one, and a stock clerk
 * cannot read one; a bad expiry and WhatsApp with nobody to send to are
 * refused under their fields; a manager issues gift vouchers, sees the secret
 * a cashier does not, and prints the cards a cashier and a bookkeeper cannot;
 * the books owe what was given (Dr 5450 / Cr 2250);
 * a void needs a reason, writes off what was left back off promotions, and a
 * voided voucher cannot be changed or sent; a sold one lapsing writes its
 * money to other income once, however often the job runs; five wrong secrets
 * lock a code for fifteen minutes.
 */

let shop: TestShop;
const who = { role: "MANAGER" };
const ids: Record<string, string> = {};

vi.mock("@/app/api/v2/retail/_helpers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/api/v2/retail/_helpers")>();
  return {
    ...real,
    requireRetailSession: async () => ({
      response: null,
      session: { user: { id: shop.managerId, companyId: shop.companyId, name: "Tafara Nyathi", role: who.role } },
    }),
  };
});

const { POST: issue } = await import("./route");
const { GET: read, PATCH: change } = await import("./[id]/route");
const { POST: send } = await import("./[id]/send/route");
const { POST: voidThem } = await import("./void/route");
const { POST: extend } = await import("./extend/route");
const { GET: print } = await import("./print/route");

const request = (path: string, method: string, body?: unknown) =>
  new NextRequest(`http://shop.test/api/v2/retail${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (response: Response) => ({ status: response.status, body: (await response.json()) as Record<string, unknown> & { data?: Record<string, unknown> } });

async function as<T>(role: string, run: () => Promise<T>): Promise<T> {
  who.role = role;
  try {
    return await run();
  } finally {
    who.role = "MANAGER";
  }
}

const gift = (extra: Record<string, unknown> = {}) => ({ kind: "GIFT", value: "50.00", howMany: 2, holder: null, expires: "3 October 2027", minSale: null, sendBy: "PRINT", ...extra });

/** A journal's lines netted by account: debit less credit. */
async function books(sourceType: "RETAIL_VOUCHER_ISSUE" | "RETAIL_VOUCHER_VOID" | "RETAIL_VOUCHER_EXPIRY", sourceId: string) {
  const entries = await prisma.journalEntry.findMany({
    where: { companyId: shop.companyId, sourceType, sourceId },
    select: { lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } },
  });
  const byAccount: Record<string, number> = {};
  for (const line of entries.flatMap((entry) => entry.lines)) {
    byAccount[line.account.code] = Number(((byAccount[line.account.code] ?? 0) + Number(line.debit) - Number(line.credit)).toFixed(2));
  }
  return byAccount;
}

beforeAll(async () => {
  shop = await makeTestShop("Voucher routes");
  await prisma.retailPostingSettings.create({ data: { companyId: shop.companyId, schedule: "EVERY_SALE" } });
  await prisma.customer.create({ data: { companyId: shop.companyId, name: "Tapiwa Marange", phone: null } });
  // A product, so the shop's chart and posting rules are in place as a trading shop's are.
  await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.80" }, { siteId: shop.mainId, onHand: 10 });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.journalEntry.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailVoucher.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("who may do what", () => {
  it("refuses a cashier, a bookkeeper and a stock clerk a new voucher; a stock clerk cannot read one", async () => {
    for (const role of ["CASHIER", "FINANCE_OFFICER", "STOCK_CLERK"]) {
      expect((await as(role, () => issue(request("/vouchers", "POST", gift())))).status).toBe(403);
    }
    expect(await prisma.retailVoucher.count({ where: { companyId: shop.companyId } })).toBe(0);
    const someone = "00000000-0000-4000-8000-000000000000";
    expect((await as("STOCK_CLERK", () => read(request(`/vouchers/${someone}`, "GET"), params(someone)))).status).toBe(403);
    expect((await as("CASHIER", () => voidThem(request("/vouchers/void", "POST", { ids: [someone], reason: "Lost" })))).status).toBe(403);
  });
});

describe("issuing", () => {
  it("refuses an expiry in the past and WhatsApp with nobody to send to, under their fields", async () => {
    expect(await json(await issue(request("/vouchers", "POST", gift({ expires: "1 January 2020" }))))).toMatchObject({
      status: 400,
      body: { fieldErrors: { expires: "Pick a date after today, within 3 years." } },
    });
    expect(await json(await issue(request("/vouchers", "POST", gift({ sendBy: "WHATSAPP" }))))).toMatchObject({
      status: 400,
      body: { fieldErrors: { send: "Anyone holding it has no one to send to." } },
    });
    expect(await json(await issue(request("/vouchers", "POST", gift({ holder: "Tapiwa Marange", sendBy: "BOTH" }))))).toMatchObject({
      status: 400,
      body: { fieldErrors: { send: "Tapiwa Marange has no WhatsApp number." } },
    });
    expect(await json(await issue(request("/vouchers", "POST", gift({ value: "nothing" }))))).toMatchObject({
      status: 400,
      body: { fieldErrors: { value: "Write the value as a figure, like 50.00." } },
    });
    expect(await prisma.retailVoucher.count({ where: { companyId: shop.companyId } })).toBe(0);
  });

  it("issues two gift vouchers given in the back office, owed in the books, the secret for the manager only", async () => {
    const made = await json(await issue(request("/vouchers", "POST", gift({ holder: "Tapiwa Marange" }))));
    expect(made).toMatchObject({ status: 201, body: { message: "2 gift vouchers for US$50.00 are ready to print." } });
    const vouchers = (made.body.data as { vouchers: Array<{ id: string; code: string }>; printUrl: string }).vouchers;
    expect(vouchers.map((voucher) => voucher.code)).toEqual(["GV-0001", "GV-0002"]);
    expect((made.body.data as { printUrl: string }).printUrl).toBe(`/api/v2/retail/vouchers/print?ids=${vouchers.map((voucher) => voucher.id).join(",")}`);
    ids.first = vouchers[0]!.id;
    ids.second = vouchers[1]!.id;

    const stored = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: ids.first }, include: { customer: { select: { name: true } } } });
    expect([stored.kind, stored.funding, stored.balance.toFixed(2), stored.customer?.name, stored.secret]).toEqual([
      "GIFT",
      "GIVEN",
      "50.00",
      "Tapiwa Marange",
      expect.stringMatching(/^[A-HJ-NP-Z2-9]{6}$/),
    ]);
    // Given: Dr Promotions and gifts / Cr Vouchers owed, both vouchers in one journal.
    expect(await books("RETAIL_VOUCHER_ISSUE", ids.first)).toEqual({ "5450": 100, "2250": -100 });

    const managerView = await json(await read(request(`/vouchers/${ids.first}`, "GET"), params(ids.first)));
    expect(managerView).toMatchObject({ status: 200, body: { data: { code: "GV-0001", secret: stored.secret, holderName: "Tapiwa Marange", left: 50 } } });
    const cashierView = await json(await as("CASHIER", () => read(request(`/vouchers/${ids.first}`, "GET"), params(ids.first!))));
    expect(cashierView.status).toBe(200);
    expect(cashierView.body.data?.secret ?? null).toBeNull();

    // The printed card carries the secret and a barcode of it: printed by those who see the secret only.
    const printed = (role: string) => as(role, () => print(request(`/vouchers/print?ids=${ids.first}`, "GET")));
    for (const role of ["CASHIER", "FINANCE_OFFICER"]) expect((await printed(role)).status).toBe(403);
    const card = await printed("MANAGER");
    expect([card.status, card.headers.get("content-type")]).toEqual([200, "application/pdf"]);
  });

  it("keeps who it is for as typed when no customer has that name, and prints one discount voucher that many times", async () => {
    const made = await json(await issue(request("/vouchers", "POST", { ...gift({ kind: "DISCOUNT", value: "10%", howMany: 20, holder: "Delta reps" }) })));
    expect(made).toMatchObject({ status: 201, body: { message: "DV-0001, 10% off, 20 printed." } });
    const stored = await prisma.retailVoucher.findFirstOrThrow({ where: { companyId: shop.companyId, code: "DV-0001" } });
    expect([stored.copies, stored.usesLeft, stored.percentOff?.toString(), stored.holderNote, stored.customerId]).toEqual([20, 20, "10", "Delta reps", null]);
  });
});

describe("changing, extending and voiding", () => {
  it("extends and changes an open voucher; refuses a date past three years", async () => {
    expect(await json(await extend(request("/vouchers/extend", "POST", { ids: [ids.second], expiresOn: "28 September 2028" })))).toMatchObject({
      status: 200,
      body: { changed: 1 },
    });
    expect(await json(await change(request(`/vouchers/${ids.second}`, "PATCH", { expiresOn: "1 January 2031" }), params(ids.second!)))).toMatchObject({
      status: 400,
      body: { fieldErrors: { expiresOn: "Pick a date after today, within 3 years." } },
    });
    const events = await prisma.platformAuditEvent.findMany({ where: { entityId: ids.second }, select: { eventType: true } });
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining(["RETAIL_VOUCHER.ISSUED", "RETAIL_VOUCHER.CHANGED"]));
  });

  it("refuses a void without a reason; voids with one, writes off what was left, and refuses a change or a send after", async () => {
    expect(await json(await voidThem(request("/vouchers/void", "POST", { ids: [ids.first] })))).toMatchObject({
      status: 400,
      body: { fieldErrors: { reason: "Say why you are voiding it." } },
    });
    expect(await json(await voidThem(request("/vouchers/void", "POST", { ids: [ids.first], reason: "Printed twice" })))).toMatchObject({
      status: 200,
      body: { voided: 1 },
    });
    // A second void of the same voucher voids nothing.
    expect((await json(await voidThem(request("/vouchers/void", "POST", { ids: [ids.first], reason: "Printed twice" })))).body).toMatchObject({ voided: 0 });
    // Given, so what was left comes back off promotions: Dr Vouchers owed / Cr Promotions and gifts.
    expect(await books("RETAIL_VOUCHER_VOID", ids.first!)).toEqual({ "2250": 50, "5450": -50 });
    expect(await json(await change(request(`/vouchers/${ids.first}`, "PATCH", { expiresOn: "1 March 2027" }), params(ids.first!)))).toMatchObject({
      status: 409,
      body: { error: "It was voided." },
    });
    expect(await json(await send(request(`/vouchers/${ids.first}/send`, "POST"), params(ids.first!)))).toMatchObject({ status: 409 });
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: ids.first, eventType: "RETAIL_VOUCHER.VOIDED" } });
    expect(event.reason).toBe("Printed twice");
  });
});

describe("the worker and the till's check", () => {
  it("lapses a sold voucher past its day once, its money to other income", async () => {
    const sold = await prisma.$transaction((tx) =>
      issueVoucher(tx, { actor: shop.owner(), kind: "GIFT", funding: "SOLD", valueCents: 2000, expiresOn: "2026-10-12", sendBy: "PRINT" }),
    );
    expect(await expireVouchers(new Date("2026-10-12T20:00:00Z"), shop.companyId)).toBe(0);
    // 00:10 on 13 October in Harare.
    const lapsed = await expireVouchers(new Date("2026-10-12T22:10:00Z"), shop.companyId);
    expect(lapsed).toBeGreaterThanOrEqual(1);
    expect(await expireVouchers(new Date("2026-10-12T22:20:00Z"), shop.companyId)).toBe(0);
    expect(await books("RETAIL_VOUCHER_EXPIRY", sold.id)).toEqual({ "2250": 20, "4200": -20 });
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: sold.id, eventType: "RETAIL_VOUCHER.EXPIRED" } });
    expect([event.actor, JSON.parse(event.payloadJson ?? "{}").automatic]).toEqual([null, true]);
  });

  it("locks a code for fifteen minutes after five wrong secrets, the right one included", async () => {
    const voucher = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: ids.second } });
    const now = new Date();
    const check = (secret: string, at = now) => checkVoucher(shop.companyId, { code: "gv-0002 ", secret, siteId: shop.mainId, now: at });
    expect((await check(voucher.secret)).reason).toBeNull();
    for (let attempt = 1; attempt <= 4; attempt += 1) expect((await check("AAAAAA")).reason).toBe(WRONG_SECRET);
    expect((await check("AAAAAA")).reason).toBe(LOCKED);
    expect((await check(voucher.secret)).reason).toBe(LOCKED);
    expect((await check(voucher.secret, new Date(now.getTime() + 16 * 60_000))).reason).toBeNull();
    // A code that is not the shop's reads as a wrong secret.
    expect((await checkVoucher(shop.companyId, { code: "GV-9999", secret: "AAAAAA", siteId: shop.mainId })).reason).toBe(WRONG_SECRET);
  });
});
