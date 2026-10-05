/**
 * Moving stock between sites (30-stock W-24 steps 1–2), against a real
 * Postgres: sending issues every line at the site it leaves under the
 * transfer's number and tells the people who receive; the refusals say which
 * field is wrong; cancelling puts what is still on the way back, skips what
 * was received, and closes a part-received transfer as received. The list
 * reads every transfer with its state, value and when it left.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money, quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { STOCK_TRANSFER_LOADERS } from "@/lib/reports/loaders/retail/stock-transfers";
import { fetchListPage } from "@/lib/reports/request";
import { LIST_ACTION_RUNS } from "@/lib/retail/asks";
import { cancelTransferAsk, cancelTransfersAsk, cancelledToast } from "@/lib/retail/asks/stock";
import { searchLookup } from "@/lib/retail/lookups";

import {
  cancelTransfers,
  sendTransfer,
  transferFieldErrors,
  transferInput,
  TransferRefusal,
  type TransferInput,
} from "./transfers";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let managerId: string;
let clerkId: string;
let cashierId: string;
let hre: string;
let bdl: string;
let closed: string;
let jameson: string;
let ice: string;
let bdlIce: string;

const actor = () => ({ companyId, userId: managerId, userName: "Tafara Nyathi", userRole: "MANAGER", canSeeCost: true });

async function site(code: string, name: string, isActive = true) {
  return (await prisma.site.create({ data: { companyId, code: `${code}-${stamp}`, name, isActive }, select: { id: true } })).id;
}

async function line(siteId: string, code: string, name: string, stock: number, cost: number, productId?: string) {
  const place = await prisma.stockLocation.upsert({
    where: { siteId_code: { siteId, code: "SHOP" } },
    update: {},
    create: { siteId, code: "SHOP", name: "Shop floor" },
  });
  const product =
    productId ??
    (await prisma.product.create({ data: { companyId, code: `${code}-${stamp}`, name, barcode: `${code}-bc-${stamp}` }, select: { id: true } })).id;
  const item = await prisma.inventoryItem.create({
    data: {
      itemCode: `${code}-${stamp}`,
      name,
      category: "OTHER",
      unit: "bottle",
      siteId,
      locationId: place.id,
      productId: product,
      currentStock: quantity(stock),
      unitCost: money(cost),
    },
    select: { id: true },
  });
  return { id: item.id, productId: product };
}

const onHand = async (id: string) => (await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).currentStock.toNumber();

const input = (over: Partial<TransferInput> = {}): TransferInput => ({
  fromSiteId: hre,
  toSiteId: bdl,
  lines: [{ lineId: jameson, quantity: "4" }],
  takenById: cashierId,
  arrives: "Today, by 11:00",
  ...over,
});

async function refusal(promise: Promise<unknown>): Promise<TransferRefusal> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TransferRefusal) return error;
    throw error;
  }
  throw new Error("It was sent.");
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Transfers ${stamp}`, slug: `transfers-${stamp}` }, select: { id: true } })).id;
  const user = async (name: string, role: "MANAGER" | "STOCK_CLERK" | "CASHIER") =>
    (await prisma.user.create({ data: { email: `${role.toLowerCase()}-${stamp}@shop.test`, name, role, companyId }, select: { id: true } })).id;
  managerId = await user("Tafara Nyathi", "MANAGER");
  clerkId = await user("Rudo Moyo", "STOCK_CLERK");
  cashierId = await user("Farai Moyo", "CASHIER");
  hre = await site("HRE", "Harare Main Branch");
  bdl = await site("BDL", "Borrowdale");
  closed = await site("OLD", "Avondale", false);
  jameson = (await line(hre, "JAMESON", "Jameson Irish Whiskey 750ml", 9, 22.15)).id;
  const iceLine = await line(hre, "ICE", "Ice 2kg bag", 40, 1);
  ice = iceLine.id;
  bdlIce = (await line(bdl, "ICE-B", "Ice 2kg bag", 20, 1, iceLine.productId)).id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailStockTransfer.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("what a send is checked against", () => {
  it("names the sheet's fields for a body that does not parse", () => {
    const parsed = transferInput.safeParse({ fromSiteId: hre, toSiteId: "x", lines: [{ lineId: "nope", quantity: "1" }], takenById: "", arrives: "" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(transferFieldErrors(parsed.error)).toEqual({
      to: "Pick the site it goes to.",
      "lines.0": "Pick a product from the list.",
      who: "Say who takes it.",
      when: "Say when it arrives.",
    });
  });

  it("refuses the site it leaves as where it goes", async () => {
    const error = await refusal(sendTransfer(actor(), input({ toSiteId: hre })));
    expect(error.status).toBe(400);
    expect(error.fieldErrors).toMatchObject({ to: "Pick a different site." });
  });

  it("refuses a closed site and someone who does not work here", async () => {
    const error = await refusal(sendTransfer(actor(), input({ toSiteId: closed, takenById: "00000000-0000-4000-8000-000000000000" })));
    expect(error.fieldErrors).toMatchObject({ to: "Pick one of this shop’s open sites.", who: "Pick someone who works here." });
  });

  it("refuses more than is on hand, nothing, a line kept elsewhere and a product twice — on that line", async () => {
    const error = await refusal(
      sendTransfer(
        actor(),
        input({
          lines: [
            { lineId: ice, quantity: "1" },
            { lineId: bdlIce, quantity: "1" },
            { lineId: jameson, quantity: "10" },
            { lineId: jameson, quantity: "1" },
          ],
        }),
      ),
    );
    expect(error.fieldErrors).toEqual({
      "lines.1": "That product is not kept at Harare Main Branch.",
      "lines.2": "Only 9 at Harare Main Branch.",
      "lines.3": "That product is on the list twice.",
    });
    const zero = await refusal(sendTransfer(actor(), input({ lines: [{ lineId: jameson, quantity: "0" }] })));
    expect(zero.fieldErrors).toEqual({ "lines.0": "Type how many to send." });
    expect(await onHand(jameson)).toBe(9);
  });

  it("sends only whole bottles, cases and bags", async () => {
    const half = await refusal(sendTransfer(actor(), input({ lines: [{ lineId: jameson, quantity: "0.5" }] })));
    expect(half.fieldErrors).toEqual({ "lines.0": "Send whole ones." });
    expect(await onHand(jameson)).toBe(9);
  });
});

describe("sending", () => {
  let sentId: string;

  it("issues each line at the site it leaves, under one transfer number", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: jameson, quantity: "4" }, { lineId: ice, quantity: "10" }] }));
    sentId = sent.id;
    expect(sent).toMatchObject({ transferNo: "TRF-0001", units: 14, value: 98.6, to: { id: bdl, name: "Borrowdale" } });
    expect(await onHand(jameson)).toBe(5);
    expect(await onHand(ice)).toBe(30);

    const movements = await prisma.stockMovement.findMany({ where: { reference: "TRF-0001", item: { site: { companyId } } } });
    expect(movements).toHaveLength(2);
    for (const movement of movements) {
      expect(movement).toMatchObject({ reason: "TRANSFER_OUT", movementType: "ISSUE", sourceType: "RETAIL_STOCK_TRANSFER" });
      expect(movement.sourceId).toMatch(new RegExp(`^${sent.id}:`));
    }

    const transfer = await prisma.retailStockTransfer.findUniqueOrThrow({ where: { id: sent.id }, include: { lines: true } });
    expect(transfer).toMatchObject({ status: "ON_THE_WAY", driver: "Farai Moyo", arrives: "Today, by 11:00", sentById: managerId });
    expect(transfer.lines.map((row) => row.unitCost.toNumber()).sort()).toEqual([1, 22.15]);

    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId, eventType: "RETAIL_STOCK_TRANSFER.SENT" } });
    expect(JSON.parse(event.payloadJson ?? "{}")).toMatchObject({ transferNo: "TRF-0001", lines: 2, units: 14, value: "98.60" });
  });

  it("tells everyone who may receive it, but not the sender", async () => {
    const told = await prisma.notificationRecipient.findMany({
      where: { notification: { companyId, type: "RETAIL_TRANSFER_SENT", entityId: sentId } },
      select: { userId: true },
    });
    expect(told.map((row) => row.userId)).toEqual([clerkId]);
  });

  it("leaves the value off for someone who may not see cost", async () => {
    const sent = await sendTransfer({ ...actor(), userId: clerkId, userRole: "STOCK_CLERK", canSeeCost: false }, input({ lines: [{ lineId: jameson, quantity: "1" }] }));
    expect(sent.transferNo).toBe("TRF-0002");
    expect(sent).not.toHaveProperty("value");
  });
});

describe("cancelling", () => {
  it("puts what is still on the way back, and skips what was received", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: ice, quantity: "5" }] }));
    const received = await prisma.retailStockTransfer.create({
      data: { companyId, transferNo: "TRF-0900", fromSiteId: hre, toSiteId: bdl, sentById: managerId, status: "RECEIVED" },
    });
    const before = await onHand(ice);
    const answer = await cancelTransfers(actor(), [sent.id, received.id]);
    expect(answer).toEqual({ cancelled: [sent.transferNo], skipped: ["TRF-0900"] });
    expect(await onHand(ice)).toBe(before + 5);
    const back = await prisma.stockMovement.findFirstOrThrow({ where: { reference: sent.transferNo, reason: "TRANSFER_BACK" } });
    expect(back.change.toNumber()).toBe(5);
    expect((await prisma.retailStockTransfer.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("CANCELLED");
    const told = await prisma.notification.count({ where: { companyId, type: "RETAIL_TRANSFER_CANCELLED", entityId: sent.id } });
    expect(told).toBe(1);
  });

  it("returns only the rest of a part-received transfer, which then reads as received", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: ice, quantity: "6" }] }));
    await prisma.retailStockTransferLine.updateMany({ where: { transferId: sent.id }, data: { quantityReceived: quantity(4) } });
    const before = await onHand(ice);
    await cancelTransfers(actor(), [sent.id]);
    expect(await onHand(ice)).toBe(before + 2);
    expect((await prisma.retailStockTransfer.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("RECEIVED");
  });

  it("asks, and says what happened", () => {
    expect(cancelTransfersAsk(2)).toMatchObject({ title: "Cancel 2 transfers?", keep: "Keep them", go: "Cancel them", fill: "bad" });
    expect(cancelTransferAsk({ transferNo: "TRF-0008", units: 540, from: "Harare Main Branch", to: "Borrowdale" })).toEqual({
      title: "Cancel TRF-0008?",
      body: "The 540 units on the way go back on Harare Main Branch’s stock, as if they never left. Borrowdale is told.",
      keep: "Keep it on the way",
      go: "Cancel the transfer",
      fill: "bad",
    });
    expect(cancelTransferAsk({ transferNo: "TRF-0009", units: 1, from: "Harare Main Branch", to: "Borrowdale" }).body).toBe(
      "The 1 unit on the way goes back on Harare Main Branch’s stock, as if it never left. Borrowdale is told.",
    );
    expect(LIST_ACTION_RUNS.canceltransfers!.ask!(1, [{ id: "t", transferNo: "TRF-0008", status: "ON_THE_WAY", units: 540, from: "Harare Main Branch", to: "Borrowdale" }]).title).toBe(
      "Cancel TRF-0008?",
    );
    expect(cancelledToast({ cancelled: ["TRF-0008"], skipped: [] })).toBe("TRF-0008 cancelled.");
    expect(cancelledToast({ cancelled: ["TRF-0008", "TRF-0009"], skipped: ["TRF-0007"] })).toEqual({
      title: "2 transfers cancelled. TRF-0007 was received or cancelled already and is left as it is.",
      variant: "warning",
    });
  });
});

describe("the list", () => {
  it("reads every transfer with its state, value and when it left", async () => {
    const { rows } = await STOCK_TRANSFER_LOADERS["retail-stock-transfers"]!.load({ companyId, userId: managerId, role: "MANAGER" }, {});
    const first = rows.find((row) => row.transferNo === "TRF-0001")!;
    expect(first).toMatchObject({
      from: "Harare Main Branch",
      to: "Borrowdale",
      route: "Harare Main Branch to Borrowdale",
      lines: 2,
      units: 14,
      value: 98.6,
      state: "On the way",
      tone: "info",
      status: "ON_THE_WAY",
      products: expect.stringContaining("Jameson Irish Whiskey 750ml"),
    });
    expect(first.sent).toMatch(/^Today, \d\d:\d\d$/);
    expect(rows.find((row) => row.transferNo === "TRF-0900")).toMatchObject({ state: "Received", tone: "hollow" });

    const clerkRows = (await STOCK_TRANSFER_LOADERS["retail-stock-transfers"]!.load({ companyId, userId: clerkId, role: "STOCK_CLERK" }, {})).rows;
    expect(clerkRows.find((row) => row.transferNo === "TRF-0001")).toMatchObject({ value: null, figure: "14 units" });
  });

  it("finds a transfer by any line's product name, and by its number", async () => {
    const session = { user: { id: managerId, companyId, role: "MANAGER", enabledFeatures: ["retail.core"] }, expires: "" } as AuthenticatedSession;
    const search = async (q: string) => {
      const page = await fetchListPage(session, "retail-stock-transfers", { page: 1, size: 50, tab: "all", q, filters: {} });
      if ("error" in page) throw new Error(page.error);
      return page.rows.map((row) => row.transferNo);
    };
    expect(await search("jameson")).toContain("TRF-0001");
    expect(await search("Ice 2kg")).toContain("TRF-0001");
    expect(await search("TRF-0001")).toEqual(["TRF-0001"]);
    expect(await search("Nothing sold here")).toEqual([]);
  });

  it("is not there for a shop with one open site", async () => {
    const session = { user: { id: managerId, companyId, role: "MANAGER", enabledFeatures: ["retail.core"] }, expires: "" } as AuthenticatedSession;
    const query = { page: 1, size: 50, filters: {} };
    const refusal = { status: 403, error: "Transfers need a second site." };
    expect(await fetchListPage(session, "retail-stock-transfers", query)).not.toEqual(refusal);
    await prisma.site.update({ where: { id: bdl }, data: { isActive: false } });
    try {
      expect(await fetchListPage(session, "retail-stock-transfers", query)).toEqual(refusal);
    } finally {
      await prisma.site.update({ where: { id: bdl }, data: { isActive: true } });
    }
  });
});

describe("the stock-line lookup", () => {
  const ctx = (role: string) => ({ companyId, userId: managerId, userName: "Tafara Nyathi", session: { user: { id: managerId, companyId, role } } });

  it("finds a site's lines with what is on hand there, and the cost for those who may see it", async () => {
    const answer = await searchLookup(ctx("MANAGER"), "stock-line", { q: "jam", context: { siteId: hre, for: "transfer" } });
    expect(answer.status).toBe(200);
    if (answer.status !== 200) return;
    expect(answer.body.options).toEqual([
      expect.objectContaining({ id: jameson, label: "Jameson Irish Whiskey 750ml", sub: `${await onHand(jameson)} at Harare Main Branch`, cost: "22.15", siteId: hre }),
    ]);
    const clerk = await searchLookup(ctx("STOCK_CLERK"), "stock-line", { q: "jam", context: { siteId: hre, for: "transfer" } });
    if (clerk.status !== 200) throw new Error("refused");
    expect(clerk.body.options[0]).not.toHaveProperty("cost");
  });

  it("finds the same products at another site", async () => {
    const product = (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: ice } })).productId;
    const answer = await searchLookup(ctx("MANAGER"), "stock-line", { context: { siteId: bdl, productIds: [product] } });
    if (answer.status !== 200) throw new Error("refused");
    expect(answer.body.options.map((option) => option.id)).toEqual([bdlIce]);
    expect(answer.body.options[0]!.sub).toBe("20 bottles");
  });
});
