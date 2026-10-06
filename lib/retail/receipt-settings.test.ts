/**
 * Receipts (SET-07, W-07): the page's rules, what it loads and saves, the
 * preview from the latest sale, the customer's copy queued with a sale, and
 * the outbox drain that sends it.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { quantity } from "@/lib/money";
import { outboxStatusHandler } from "@/lib/messaging/whatsapp-webhook";
import { prisma } from "@/lib/prisma";
import { drainOutbox, type DrainDeps } from "@/lib/retail/messages/drain";
import { readSettings, saveSettings } from "@/lib/retail/settings";
import { checkSettingsChanges } from "@/lib/retail/settings-pages";
import { receiptsPage } from "@/lib/retail/settings-pages/receipts";

import { queueSaleReceipt, receiptPreview, saleReceipt } from "./receipt-settings";

describe("the Receipts page's rules", () => {
  it("is read and changed with the receipts grant", () => {
    expect(receiptsPage.read).toEqual(["retail.receipts", "view"]);
    expect(receiptsPage.change).toEqual(["retail.receipts", "update"]);
  });

  it("keeps the top and the bottom to four lines of 42, one or two copies, and the three ways to send", () => {
    expect(
      checkSettingsChanges(receiptsPage, {
        header: "1\n2\n3\n4\n5",
        footer: "x".repeat(43),
        copies: "3",
        alsoSendBy: "Fax",
      }),
    ).toEqual({
      ok: false,
      fieldErrors: {
        header: "Keep it to 4 lines. The till prints each line as typed.",
        footer: "Line 1 has 43 characters. A till receipt fits 42 on a line.",
        copies: "Print one copy or two.",
        alsoSendBy: "Choose nothing, WhatsApp or email.",
      },
    });
    expect(checkSettingsChanges(receiptsPage, { footer: "Thank you  \n\n", copies: "2", alsoSendBy: "WhatsApp" })).toEqual({
      ok: true,
      values: { footer: "Thank you", copies: "2", alsoSendBy: "WhatsApp" },
    });
  });

  it("says when the way chosen is not set up, and holds the logo switch without a logo", () => {
    const fields = receiptsPage.sections[0]!.fields;
    const sendBy = fields.find((field) => field.id === "alsoSendBy")!;
    const hint = sendBy.h as (values: Record<string, unknown>) => string;
    expect(hint({ alsoSendBy: "WhatsApp", whatsAppReady: false })).toBe(
      "WhatsApp is not set up yet, so receipts wait in the outbox until it is.",
    );
    expect(hint({ alsoSendBy: "Nothing", whatsAppReady: false })).toBe("");
    const logo = fields.find((field) => field.id === "printLogo")!;
    expect(logo.disabled!({ logoUrl: null, printLogo: false })).toBe(true);
    expect((logo.h as (values: Record<string, unknown>) => string)({ logoUrl: "https://x.test/l.png" })).toBe(
      "Slower on most till printers.",
    );
    const licence = fields.find((field) => field.id === "showLicenceNumber")!;
    expect(licence.show!({ liquor: false }, {} as never)).toBe(false);
  });
});

describe("receipts on real rows", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let companyId: string;
  let ownerId: string;
  let siteId: string;
  let saleId: string;
  const messageIds: string[] = [];

  beforeAll(async () => {
    companyId = (
      await prisma.company.create({ data: { name: `Kopje Liquor ${stamp}`, slug: `receipts-${stamp}` }, select: { id: true } })
    ).id;
    ownerId = (
      await prisma.user.create({
        data: { email: `owner-${stamp}@shop.test`, name: "Tendai Mhlanga", role: "SUPERADMIN", companyId },
        select: { id: true },
      })
    ).id;
    siteId = (
      await prisma.site.create({
        data: { companyId, name: "Kopje", code: `KP-${stamp}`, location: "3 Kopje Road, Harare" },
        select: { id: true },
      })
    ).id;
    const location = await prisma.stockLocation.create({
      data: { siteId, code: `FLOOR-${stamp}`, name: "Shop floor", isActive: true },
      select: { id: true },
    });
    const item = await prisma.inventoryItem.create({
      data: {
        itemCode: `RC-${stamp}`,
        name: "Castle Lager 340ml",
        category: "OTHER",
        unit: "each",
        siteId,
        locationId: location.id,
        currentStock: quantity(24),
      },
      select: { id: true },
    });
    saleId = (
      await prisma.retailSale.create({
        data: {
          companyId,
          siteId,
          saleNo: `RS-${stamp}`,
          totalAmount: 8.7,
          depositAmount: 0.6,
          status: "POSTED",
          postedAt: new Date(),
          lines: {
            create: [
              { companyId, inventoryItemId: item.id, itemName: "Castle Lager 340ml", quantity: 6, unitPrice: 1.2, lineTotal: 7.2, depositAmount: 0.6 },
              { companyId, inventoryItemId: item.id, itemName: "Ice 2kg bag", quantity: 1, unitPrice: 1.5, lineTotal: 1.5 },
            ],
          },
          payments: { create: [{ companyId, tenderType: "ECOCASH", amount: 9.3, currency: "USD", baseAmount: 9.3 }] },
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (!companyId) return;
    await prisma.retailMessage.deleteMany({ where: { companyId } });
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
    await prisma.retailReceiptSettings.deleteMany({ where: { companyId } });
    await prisma.retailSale.deleteMany({ where: { companyId } });
    await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
    await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
    await prisma.site.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("opens on the defaults: the shop's name and address on top, nothing sent", async () => {
    const read = await readSettings(companyId, "receipts", true);
    expect(read?.values).toMatchObject({
      header: `${`KOPJE LIQUOR ${stamp}`.toUpperCase().slice(0, 42)}\n3 Kopje Road, Harare`,
      footer: "",
      showVatNumber: true,
      printLogo: false,
      copies: "1",
      alsoSendBy: "Nothing",
      liquor: false,
      logoUrl: null,
    });
    expect(read?.lastChanged).toBeNull();
  });

  it("previews the latest sale of four lines or fewer, its deposit as a line of its own", async () => {
    expect(await receiptPreview(companyId)).toEqual({
      lines: [
        { label: "Castle Lager 340ml x6", amount: "7.20" },
        { label: "Deposit x6", amount: "0.60" },
        { label: "Ice 2kg bag", amount: "1.50" },
      ],
      total: "9.30",
      currency: "US$",
      tenders: [{ label: "EcoCash", amount: "9.30" }],
      fiscal: null,
    });
  });

  it("saves a change with one audit event, and the next receipt prints it", async () => {
    const saved = await saveSettings(
      { companyId, userId: ownerId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" },
      "receipts",
      { footer: "Bring the bottles back for your deposit.", alsoSendBy: "WhatsApp", copies: "2" },
    );
    expect(saved).toMatchObject({ ok: true, lastChanged: { by: "Tendai Mhlanga" } });
    const events = await prisma.platformAuditEvent.count({
      where: { companyId, eventType: "RETAIL_SETTINGS.CHANGED", entityId: "receipts" },
    });
    expect(events).toBe(1);
    const receipt = await saleReceipt(companyId, saleId);
    expect(receipt?.copies).toBe(2);
    expect(receipt?.doc.foot).toEqual(["Bring the bottles back for your deposit."]);
    expect(receipt?.doc.head).toEqual([`KOPJE LIQUOR ${stamp}`.toUpperCase().slice(0, 42), "3 Kopje Road, Harare"]);
  });

  it("queues the customer's copy with the sale on WhatsApp, to their number in full, and nothing without one", async () => {
    const queued = await prisma.$transaction((tx) =>
      queueSaleReceipt(tx, { companyId, saleId, to: { phone: "0772 123 456", email: null }, createdById: ownerId }),
    );
    expect(queued).not.toBeNull();
    messageIds.push(queued!.id);
    const message = await prisma.retailMessage.findUniqueOrThrow({ where: { id: queued!.id } });
    expect(message).toMatchObject({ channel: "WHATSAPP", to: "+263772123456", template: "receipt", status: "QUEUED", saleId });
    expect(message.body).toContain("Bring the bottles back");
    expect(message.body).toContain("TOTAL US$");

    const none = await prisma.$transaction((tx) =>
      queueSaleReceipt(tx, { companyId, saleId, to: { phone: null, email: "a@b.test" }, createdById: ownerId }),
    );
    expect(none).toBeNull();
  });

  it("drains the outbox: waits while WhatsApp is not set up, then sends and keeps Meta's id", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: `wamid.${stamp}` }));
    const deps = (ready: boolean, sendText: DrainDeps["sendText"] = send): DrainDeps => ({
      whatsAppReady: () => ready,
      emailReady: () => false,
      sendText,
      sendMedia: vi.fn(),
      sendEmail: vi.fn(),
    });

    const waiting = await drainOutbox(new Date(), deps(false));
    expect(waiting.waiting).toBeGreaterThanOrEqual(1);
    expect(send).not.toHaveBeenCalled();
    expect((await prisma.retailMessage.findUniqueOrThrow({ where: { id: messageIds[0]! } })).status).toBe("QUEUED");

    // Not before its time.
    const later = await prisma.retailMessage.create({
      data: { companyId, channel: "WHATSAPP", to: "+263772000000", template: "note", body: "Later", scheduledFor: new Date(Date.now() + 3_600_000) },
      select: { id: true },
    });

    await drainOutbox(new Date(), deps(true));
    const sent = await prisma.retailMessage.findUniqueOrThrow({ where: { id: messageIds[0]! } });
    expect(sent).toMatchObject({ status: "SENT", externalId: `wamid.${stamp}`, attempts: 1, lastError: null });
    expect(sent.sentAt).not.toBeNull();
    expect((await prisma.retailMessage.findUniqueOrThrow({ where: { id: later.id } })).status).toBe("QUEUED");
  });

  it("tries a busy send again and fails a refused one", async () => {
    const busy = await prisma.retailMessage.create({
      data: { companyId, channel: "WHATSAPP", to: "+263772000001", template: "note", body: "Busy" },
      select: { id: true },
    });
    await drainOutbox(new Date(), {
      whatsAppReady: () => true,
      emailReady: () => false,
      sendText: vi.fn(async (to: string) =>
        to === "+263772000001" ? { ok: false as const, error: "Too many", retry: true } : { ok: true as const, id: null },
      ),
      sendMedia: vi.fn(),
      sendEmail: vi.fn(),
    });
    expect(await prisma.retailMessage.findUniqueOrThrow({ where: { id: busy.id } })).toMatchObject({
      status: "QUEUED",
      attempts: 1,
      lastError: "Too many",
    });

    await drainOutbox(new Date(), {
      whatsAppReady: () => true,
      emailReady: () => false,
      sendText: vi.fn(async () => ({ ok: false as const, error: "Invalid parameter", retry: false })),
      sendMedia: vi.fn(),
      sendEmail: vi.fn(),
    });
    expect(await prisma.retailMessage.findUniqueOrThrow({ where: { id: busy.id } })).toMatchObject({
      status: "FAILED",
      attempts: 2,
      lastError: "Invalid parameter",
    });
  });

  it("marks a sent message failed when Meta says it could not deliver it", async () => {
    await outboxStatusHandler.handle({
      kind: "status",
      id: `wamid.${stamp}`,
      status: "failed",
      at: null,
      recipient: null,
      error: "Re-engagement message",
    });
    expect(await prisma.retailMessage.findUniqueOrThrow({ where: { id: messageIds[0]! } })).toMatchObject({
      status: "FAILED",
      lastError: "Re-engagement message",
    });
  });
});
