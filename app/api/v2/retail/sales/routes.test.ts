import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import { addTestSale, destroySalesShop, makeSalesShop, type SalesShop } from "@/lib/retail/floor/test-fixtures";

/**
 * The sale routes (FLR-01) against the test database: who may read and
 * change a sale, what a change refuses (another shop's customer, a voided
 * sale), "Mark as looked at" once only, and a receipt sent on WhatsApp that
 * waits in the outbox while WhatsApp is not connected (98-decisions C-04).
 */

let shop: SalesShop;
let other: SalesShop;
let sale: { id: string };
let voided: { id: string };
let flagged: { id: string };
let theirs: { id: string };
const as = { role: "SUPERADMIN", userId: "" };

vi.mock("@/app/api/v2/retail/_helpers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/api/v2/retail/_helpers")>();
  return {
    ...real,
    requireRetailSession: async () => ({
      response: null,
      session: { user: { id: as.userId || shop.ownerId, companyId: shop.companyId, name: "Tafara Nyathi", role: as.role } },
    }),
  };
});

const { GET: readSale, PATCH: patchSale } = await import("./[id]/route");
const { POST: send } = await import("./[id]/send/route");
const { POST: reviewed } = await import("./[id]/reviewed/route");
const { POST: sendMany } = await import("./send/route");

const call = (id: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://shop.test/api/v2/retail/sales/${id}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function asRole<T>(role: string, run: () => Promise<T>, userId = ""): Promise<T> {
  const before = { ...as };
  as.role = role;
  as.userId = userId;
  try {
    return await run();
  } finally {
    Object.assign(as, before);
  }
}

beforeAll(async () => {
  vi.stubEnv("META_WHATSAPP_TOKEN", "");
  vi.stubEnv("META_WHATSAPP_PHONE_NUMBER_ID", "");
  shop = await makeSalesShop("SaleRoutes");
  other = await makeSalesShop("SaleRoutesOther");
  const ice = { item: shop.ice, name: "Ice 2kg bag", quantity: 1, price: "2.20", cost: "1.10" };
  const at = new Date();
  sale = await addTestSale(shop, {
    saleNo: "SALE-31869",
    at,
    lines: [ice],
    customerId: shop.tapiwa,
    payments: [{ tender: "CARD", amount: "2.20", reference: "CBZ 4412" }],
  });
  voided = await addTestSale(shop, { saleNo: "SALE-31858", at, lines: [ice], status: "VOIDED" });
  flagged = await addTestSale(shop, { saleNo: "SALE-31862", at, lines: [ice], reviewReason: "Price changed at the till." });
  theirs = await addTestSale(shop, { saleNo: "SALE-31870", at, lines: [ice], cashierId: shop.farai });
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await destroySalesShop(shop);
  await destroySalesShop(other);
}, 60_000);

describe("GET /sales/[id]", () => {
  it("tells a stock clerk their role cannot view sales", async () => {
    const answer = await asRole("STOCK_CLERK", () => readSale(call(sale.id, undefined, "GET"), params(sale.id)));
    expect(answer.status).toBe(403);
    expect(await answer.json()).toEqual({ error: "Your role cannot view sales" });
  });

  it("shows a cashier their own sale and not someone else's", async () => {
    const mine = await asRole("CASHIER", () => readSale(call(sale.id, undefined, "GET"), params(sale.id)), shop.chipo);
    expect(mine.status).toBe(200);
    const notMine = await asRole("CASHIER", () => readSale(call(theirs.id, undefined, "GET"), params(theirs.id)), shop.chipo);
    expect(notMine.status).toBe(404);
    expect(await notMine.json()).toEqual({ error: "Sale not found" });
  });
});

describe("PATCH /sales/[id]", () => {
  it("refuses a customer from another shop under the field", async () => {
    const answer = await patchSale(call(sale.id, { customerId: other.tapiwa }, "PATCH"), params(sale.id));
    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ fieldErrors: { customer: "That customer is not this shop’s." } });
  });

  it("refuses any change to a voided sale", async () => {
    const answer = await patchSale(call(voided.id, { customerId: shop.tinashe }, "PATCH"), params(voided.id));
    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({ error: "SALE-31858 was voided." });
  });

  it("refuses a cashier and a bookkeeper", async () => {
    for (const role of ["CASHIER", "FINANCE_OFFICER"]) {
      const answer = await asRole(role, () => patchSale(call(sale.id, { customerId: shop.tinashe }, "PATCH"), params(sale.id)));
      expect(answer.status, role).toBe(403);
    }
  });

  it("links a customer and fixes a payment's reference, each in Activity", async () => {
    const payment = await prisma.retailSalePayment.findFirstOrThrow({ where: { saleId: sale.id }, select: { id: true } });
    const answer = await patchSale(
      call(sale.id, { customerId: shop.tinashe, paymentReference: { paymentId: payment.id, reference: "CBZ 4412 0988" } }, "PATCH"),
      params(sale.id),
    );
    expect(answer.status).toBe(200);
    const body = await answer.json();
    expect(body.changed).toEqual([
      { field: "customer", from: "Tapiwa Marange", to: "Tinashe Mavhunga" },
      { field: "reference", from: "CBZ 4412", to: "CBZ 4412 0988" },
    ]);
    expect(body.data).toMatchObject({ customer: { name: "Tinashe Mavhunga" }, payments: [{ reference: "CBZ 4412 0988" }] });
    const stored = await prisma.retailSale.findUniqueOrThrow({ where: { id: sale.id }, select: { customerId: true, customerName: true } });
    expect(stored).toEqual({ customerId: shop.tinashe, customerName: "Tinashe Mavhunga" });
    const edits = await prisma.platformAuditEvent.count({ where: { companyId: shop.companyId, entityId: sale.id, eventType: RETAIL_AUDIT_EVENTS.recordEdited } });
    expect(edits).toBe(2);
  });
});

describe("POST /sales/[id]/reviewed", () => {
  it("marks a flagged sale looked at once, then has nothing to look at", async () => {
    const first = await reviewed(call(`${flagged.id}/reviewed`), params(flagged.id));
    expect(first.status).toBe(200);
    expect((await prisma.retailSale.findUniqueOrThrow({ where: { id: flagged.id } })).reviewedAt).not.toBeNull();
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: flagged.id, eventType: RETAIL_AUDIT_EVENTS.saleReviewed } });
    expect(audit.payloadJson).toContain("Price changed at the till.");
    const again = await reviewed(call(`${flagged.id}/reviewed`), params(flagged.id));
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "Nothing to look at on SALE-31862." });
  });

  it("is a manager's: a cashier cannot", async () => {
    const answer = await asRole("CASHIER", () => reviewed(call(`${sale.id}/reviewed`), params(sale.id)), shop.chipo);
    expect(answer.status).toBe(403);
  });
});

describe("POST /sales/[id]/send", () => {
  it("asks for a number when the sale has none", async () => {
    const answer = await send(call(`${voided.id}/send`, {}), params(voided.id));
    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ fieldErrors: { to: "Give a WhatsApp number, like +263 77 412 3388." } });
  });

  it("queues the receipt while WhatsApp is not connected, and says it waits", async () => {
    const answer = await send(call(`${voided.id}/send`, { to: "077 412 3388" }), params(voided.id));
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ queued: true, to: "••• 3388", waiting: true });
    const message = await prisma.retailMessage.findFirstOrThrow({ where: { saleId: voided.id } });
    expect(message).toMatchObject({ channel: "WHATSAPP", to: "+263774123388", status: "QUEUED", template: "receipt" });
    expect(await prisma.platformAuditEvent.count({ where: { entityId: voided.id, eventType: RETAIL_AUDIT_EVENTS.saleSent } })).toBe(1);
  });

  it("sends receipts for ticked sales with a customer's number and counts the rest", async () => {
    await prisma.customer.update({ where: { id: shop.tinashe }, data: { phone: "+263713308826" } });
    const answer = await sendMany(
      new NextRequest("http://shop.test/api/v2/retail/sales/send", {
        method: "POST",
        body: JSON.stringify({ ids: [sale.id, flagged.id, theirs.id] }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ sent: 1, noNumber: 2 });
    expect(await prisma.retailMessage.count({ where: { saleId: sale.id, to: "+263713308826" } })).toBe(1);
  });
});
