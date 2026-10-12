import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { dropLoyaltyShops, ledgerRow } from "@/lib/retail/loyalty/test-fixtures";

import { drainOutbox, type DrainDeps } from "./drain";
import { laterSlot, MessageRefusal } from "./preview";
import { queueCustomerMessages } from "./queue";
import { messageShop, type MessageShop } from "./test-fixtures";

const BOARD =
  "Hi {first name}, Savanna Dry is two for US$5 this month end, 25 to 31 October. You have {points} points to spend. Harare Bottle Store.";

let shop: MessageShop;

beforeAll(async () => {
  shop = await messageShop("Messages");
  await ledgerRow(shop, { customerId: shop.gold, kind: "EARNED", points: 3021 });
});

afterAll(async () => {
  await dropLoyaltyShops([shop.companyId]);
});

const offer = (input: Partial<Parameters<typeof queueCustomerMessages>[1]> = {}) => ({
  purpose: "OFFER" as const,
  audience: "all-agreed" as const,
  body: BOARD,
  sendAt: null,
  ...input,
});

/** A drain that sends nothing for real: it records each send and says it went. */
function fakeDrain() {
  const sent: Array<{ to: string; params: string[] }> = [];
  const deps: DrainDeps = {
    whatsAppReady: () => true,
    emailReady: () => false,
    sendTemplate: async (to, template) => {
      sent.push({ to, params: template.params });
      return { ok: true, id: `wamid.${sent.length}` };
    },
    sendEmail: async () => undefined,
  };
  return { sent, deps };
}

async function refusal(run: () => Promise<unknown>): Promise<MessageRefusal> {
  try {
    await run();
  } catch (error) {
    if (error instanceof MessageRefusal) return error;
    throw error;
  }
  throw new Error("It was not refused");
}

describe("queueing a message to customers", () => {
  it("writes one batch and one queued message per customer reached, each filled for them", async () => {
    const result = await queueCustomerMessages(shop.owner(), offer(), { whatsAppReady: () => true });
    expect(result).toMatchObject({ queued: 4, sendAt: null, waiting: false });

    const batch = await prisma.retailMessageBatch.findUniqueOrThrow({ where: { id: result.batchId } });
    expect(batch).toMatchObject({ purpose: "OFFER", audience: "all-agreed", template: BOARD, total: 4, scheduledFor: null, createdById: shop.ownerId });

    const messages = await prisma.retailMessage.findMany({ where: { batchId: result.batchId } });
    expect(messages).toHaveLength(4);
    expect(new Set(messages.map((row) => row.customerId))).toEqual(new Set([shop.gold, shop.lapsed, shop.never, shop.whatsappOnly]));
    for (const row of messages) expect(row).toMatchObject({ channel: "WHATSAPP", status: "QUEUED", template: "customer-offer" });
    expect(messages.find((row) => row.customerId === shop.gold)?.body).toBe(
      "Hi Tapiwa, Savanna Dry is two for US$5 this month end, 25 to 31 October. You have 3,021 points to spend. Harare Bottle Store.",
    );

    const event = await prisma.platformAuditEvent.findFirst({ where: { companyId: shop.companyId, eventType: "RETAIL_MESSAGES.QUEUED", entityId: result.batchId } });
    expect(JSON.parse(String(event?.payloadJson))).toMatchObject({ purpose: "OFFER", audience: "all-agreed", count: 4, scheduledFor: null });
  });

  it("schedules for Friday 16:00 in Harare; a drain before then sends none, and at send time fills in the points then", async () => {
    const now = new Date();
    const later = laterSlot(now);
    const at = new Date(later.at);
    expect(new Intl.DateTimeFormat("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" }).format(at)).toBe("Friday 16:00");

    const result = await queueCustomerMessages(shop.owner(), offer({ audience: "ticked", ids: [shop.gold], sendAt: later.at }));
    expect(result).toMatchObject({ queued: 1, sendAt: at.toISOString() });
    const [message] = await prisma.retailMessage.findMany({ where: { batchId: result.batchId } });
    expect(message?.scheduledFor?.toISOString()).toBe(at.toISOString());

    const early = fakeDrain();
    await drainOutbox(now, early.deps);
    expect((await prisma.retailMessage.findUniqueOrThrow({ where: { id: message!.id } })).status).toBe("QUEUED");

    await ledgerRow(shop, { customerId: shop.gold, kind: "EARNED", points: 100 });
    const due = fakeDrain();
    await drainOutbox(new Date(at.getTime() + 60_000), due.deps);
    const after = await prisma.retailMessage.findUniqueOrThrow({ where: { id: message!.id } });
    expect(after.status).toBe("SENT");
    expect(after.body).toContain("You have 3,121 points to spend.");
    expect(due.sent.find((send) => send.to === message!.to)?.params[1]).toContain("3,121 points");
  });

  it("refuses a time already past", async () => {
    const error = await refusal(() => queueCustomerMessages(shop.owner(), offer({ sendAt: new Date(Date.now() - 60_000).toISOString() })));
    expect(error.status).toBe(400);
    expect(error.fieldErrors).toEqual({ when: "Pick a time to come." });
  });

  it("refuses a placeholder that does not fill in", async () => {
    const error = await refusal(() => queueCustomerMessages(shop.owner(), offer({ body: "Hi {name}" })));
    expect(error.status).toBe(400);
    expect(error.fieldErrors).toEqual({ msg: "Only {first name} and {points} fill in." });
  });

  it("is a 409 when nobody can be sent it", async () => {
    const error = await refusal(() => queueCustomerMessages(shop.owner(), offer({ audience: "ticked", ids: [shop.goldNoConsent, shop.goldNoNumber] })));
    expect(error.status).toBe(409);
    expect(error.message).toBe("None of them can be sent a message.");
  });

  it("queues with WhatsApp not connected, and says they wait", async () => {
    const result = await queueCustomerMessages(shop.owner(), offer({ audience: "ticked", ids: [shop.lapsed] }), { whatsAppReady: () => false });
    expect(result).toMatchObject({ queued: 1, waiting: true });
    const rows = await prisma.retailMessage.findMany({ where: { batchId: result.batchId } });
    expect(rows.map((row) => row.status)).toEqual(["QUEUED"]);
  });
});
