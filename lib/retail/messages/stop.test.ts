import { createHmac } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyWhatsAppSignature } from "@/lib/messaging/whatsapp";
import { dispatchWhatsAppEvents, whatsAppEvents } from "@/lib/messaging/whatsapp-webhook";
import { prisma } from "@/lib/prisma";
import { dropLoyaltyShops } from "@/lib/retail/loyalty/test-fixtures";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { isStopReply } from "./stop";

const SECRET = "app-secret";
const shops: TestShop[] = [];

/** A number no other test's customer has: +263 77 then eight digits off the clock. */
const number = `+26377${String(Date.now()).slice(-7)}`;
const digits = number.replace(/\D/g, "");

function signedDelivery(text: string, from = digits) {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { metadata: { phone_number_id: "1" }, messages: [{ id: `wamid.${Math.random()}`, from, timestamp: "1760000000", type: "text", text: { body: text } }] } }] }],
  });
  return { body, signature: `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}` };
}

async function deliver(text: string) {
  const { body, signature } = signedDelivery(text);
  expect(verifyWhatsAppSignature(body, signature, SECRET)).toBe(true);
  await dispatchWhatsAppEvents(whatsAppEvents(JSON.parse(body)));
}

let first: { shop: TestShop; same: string; whatsapp: string; binned: string; other: string };
let second: { shop: TestShop; same: string };

beforeAll(async () => {
  const add = (shop: TestShop, data: { name: string; phone?: string | null; whatsapp?: string | null; archivedAt?: Date | null }) =>
    prisma.customer
      .create({ data: { companyId: shop.companyId, marketingConsent: true, ...data }, select: { id: true } })
      .then((row) => row.id);
  const a = await makeTestShop("Stop A");
  const b = await makeTestShop("Stop B");
  shops.push(a, b);
  first = {
    shop: a,
    same: await add(a, { name: "Tapiwa Marange", phone: "+263779999999", whatsapp: number }),
    whatsapp: await add(a, { name: "Nyasha Gwenzi", phone: number }),
    binned: await add(a, { name: "Munashe Chari", phone: number, archivedAt: new Date() }),
    other: await add(a, { name: "Rudo Chirwa", phone: `${number.slice(0, -1)}${(Number(number.slice(-1)) + 1) % 10}` }),
  };
  second = { shop: b, same: await add(b, { name: "Tapiwa Marange", phone: number }) };
});

afterAll(async () => {
  await dropLoyaltyShops(shops.map((shop) => shop.companyId));
});

describe("STOP on WhatsApp", () => {
  it("reads STOP in any case and spacing, and nothing else", () => {
    expect(isStopReply("STOP")).toBe(true);
    expect(isStopReply("  stop \n")).toBe(true);
    expect(isStopReply("Stop")).toBe(true);
    expect(isStopReply("stop it")).toBe(false);
    expect(isStopReply(null)).toBe(false);
  });

  it("turns consent off for every live customer on that number, in every shop, and writes why", async () => {
    await deliver("  Stop ");
    const consent = (id: string) => prisma.customer.findUniqueOrThrow({ where: { id }, select: { marketingConsent: true, consentChangedAt: true } });
    expect((await consent(first.same)).marketingConsent).toBe(false);
    expect((await consent(first.whatsapp)).marketingConsent).toBe(false);
    expect((await consent(first.same)).consentChangedAt).not.toBeNull();
    expect((await consent(second.same)).marketingConsent).toBe(false);
    expect((await consent(first.binned)).marketingConsent).toBe(true);
    expect((await consent(first.other)).marketingConsent).toBe(true);

    const events = await prisma.platformAuditEvent.findMany({
      where: { eventType: "RETAIL_CUSTOMER.CONSENT_CHANGED", entityId: { in: [first.same, first.whatsapp, second.same] } },
    });
    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(event.actor).toBeNull();
      expect(JSON.parse(String(event.payloadJson))).toMatchObject({ agreed: false, via: "STOP reply" });
    }
  });

  it("leaves consent alone for any other reply", async () => {
    await prisma.customer.update({ where: { id: second.same }, data: { marketingConsent: true } });
    await deliver("stop please");
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: second.same } })).marketingConsent).toBe(true);
  });
});
