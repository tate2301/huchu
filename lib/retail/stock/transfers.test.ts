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
  cancelTransfer,
  changeTransferLines,
  patchTransfer,
  receiveTransfer,
  transferPatch,
} from "./transfer-changes";
import { bucketByMonth, loadTransferView, monthsEnding } from "./transfer-record";
import { receiveHint, receivedToast, shortWords, transferChip } from "./transfer-words";
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
  // The loss journal is read straight after receiving: this shop posts with every sale (SET-09).
  await prisma.retailPostingSettings.create({ data: { companyId, schedule: "EVERY_SALE" } });
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
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
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
  // Posting a loss seeds the company's books, whose tax templates refuse a
  // clean cascade; leave the row behind rather than fail a green suite.
  await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
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

  it("finds a product at every site, naming the site, when asked across sites", async () => {
    const answer = await searchLookup(ctx("MANAGER"), "stock-line", { q: "ice", context: { everySite: true } });
    if (answer.status !== 200) throw new Error("refused");
    expect(answer.body.options.map((option) => option.id).sort()).toEqual([ice, bdlIce].sort());
    expect(answer.body.options.find((option) => option.id === bdlIce)!.sub).toBe(`${await onHand(bdlIce)} at Borrowdale`);
    const none = await searchLookup(ctx("MANAGER"), "stock-line", { q: "ice", context: {} });
    if (none.status !== 200) throw new Error("refused");
    expect(none.body.options).toEqual([]);
  });

  it("finds the same products at another site", async () => {
    const product = (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: ice } })).productId;
    const answer = await searchLookup(ctx("MANAGER"), "stock-line", { context: { siteId: bdl, productIds: [product] } });
    if (answer.status !== 200) throw new Error("refused");
    expect(answer.body.options.map((option) => option.id)).toEqual([bdlIce]);
    expect(answer.body.options[0]!.sub).toBe("20 bottles");
  });
});

describe("receiving (W-24 step 3)", () => {
  it("creates the line at the receiving site when it keeps none, at the line's cost", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: jameson, quantity: "2" }] }));
    expect(await prisma.inventoryItem.count({ where: { siteId: bdl, product: { name: "Jameson Irish Whiskey 750ml" } } })).toBe(0);
    const line = await prisma.retailStockTransferLine.findFirstOrThrow({ where: { transferId: sent.id } });

    const done = await receiveTransfer(actor(), sent.id, { lines: [{ id: line.id, received: "2" }], short: "LOST" });
    expect(done).toMatchObject({ status: "RECEIVED", received: 2, lost: 0, message: `${sent.transferNo} received at Borrowdale.` });

    const made = await prisma.inventoryItem.findFirstOrThrow({ where: { siteId: bdl, productId: line.productId } });
    expect(made).toMatchObject({ unit: "bottle", minStock: null });
    expect(made.currentStock.toNumber()).toBe(2);
    expect(made.unitCost?.toNumber()).toBe(22.15);
    const moved = await prisma.stockMovement.findFirstOrThrow({ where: { itemId: made.id } });
    expect(moved).toMatchObject({ reason: "TRANSFER_IN", reference: sent.transferNo, movementType: "RECEIPT" });
    const transfer = await prisma.retailStockTransfer.findUniqueOrThrow({ where: { id: sent.id }, include: { lines: true } });
    expect(transfer).toMatchObject({ status: "RECEIVED", receivedById: managerId });
    expect(transfer.lines[0]!.toItemId).toBe(made.id);

    const again = await receiveTransfer(actor(), sent.id, { lines: [{ id: line.id, received: "0" }], short: "LOST" }).catch((error) => error);
    expect(again).toBeInstanceOf(TransferRefusal);
    expect((again as TransferRefusal).message).toBe(`${sent.transferNo} has already been received.`);
  });

  it("writes off what was lost on the way: the line's lost figure and a loss journal at its cost", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: ice, quantity: "10" }, { lineId: jameson, quantity: "1" }] }));
    const lines = await prisma.retailStockTransferLine.findMany({ where: { transferId: sent.id }, include: { product: true } });
    const iceLine = lines.find((row) => row.product.name === "Ice 2kg bag")!;
    const jamLine = lines.find((row) => row.product.name !== "Ice 2kg bag")!;
    const before = await onHand(bdlIce);

    const tooMany = await receiveTransfer(actor(), sent.id, { lines: [{ id: iceLine.id, received: "11" }], short: "LOST" }).catch((error) => error);
    expect((tooMany as TransferRefusal).fieldErrors).toEqual({ "lines.0": "Only 10 were sent." });

    const done = await receiveTransfer(actor(), sent.id, {
      lines: [
        { id: iceLine.id, received: "8" },
        { id: jamLine.id, received: "1" },
      ],
      short: "LOST",
    });
    expect(done).toMatchObject({ status: "RECEIVED", received: 9, lost: 2, lostValue: 2 });
    expect(done.message).toBe(`${sent.transferNo} received at Borrowdale. 2 × Ice 2kg bag written off.`);
    expect(await onHand(bdlIce)).toBe(before + 8);
    const row = await prisma.retailStockTransferLine.findUniqueOrThrow({ where: { id: iceLine.id } });
    expect([row.quantityReceived.toNumber(), row.quantityLost.toNumber()]).toEqual([8, 2]);

    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { companyId, sourceType: "RETAIL_STOCK_ADJUSTMENT", description: `Lost on the way, ${sent.transferNo}` },
      include: { lines: true },
    });
    const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit), 0);
    expect(debit).toBe(2);

    const view = await loadTransferView(companyId, sent.id, { canSeeCost: true });
    expect(view).toMatchObject({ stateLabel: "Received, 2 short", lost: 2, toCome: 0 });
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId, entityId: sent.id, eventType: "RETAIL_STOCK_TRANSFER.RECEIVED" } });
    expect(JSON.parse(event.payloadJson ?? "{}")).toMatchObject({ received: 9, lost: 2, stillComing: 0, to: "Borrowdale" });
  });

  it("keeps what is still coming on the way, to be received again", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: ice, quantity: "6" }] }));
    const [line] = await prisma.retailStockTransferLine.findMany({ where: { transferId: sent.id } });
    const first = await receiveTransfer(actor(), sent.id, { lines: [{ id: line!.id, received: "4" }], short: "STILL_COMING" });
    expect(first).toMatchObject({ status: "ON_THE_WAY", stillComing: 2 });
    expect(first.message).toBe(`${sent.transferNo} received at Borrowdale. 2 × Ice 2kg bag still to come.`);
    expect((await loadTransferView(companyId, sent.id, { canSeeCost: false }))).toMatchObject({ stateLabel: "Part received, 2 to come", toCome: 2 });

    const over = await receiveTransfer(actor(), sent.id, { lines: [{ id: line!.id, received: "3" }], short: "LOST" }).catch((error) => error);
    expect((over as TransferRefusal).fieldErrors).toEqual({ "lines.0": "Only 2 are still to come." });
    const second = await receiveTransfer(actor(), sent.id, { lines: [{ id: line!.id, received: "2" }], short: "LOST" });
    expect(second).toMatchObject({ status: "RECEIVED", received: 2 });
  });
});

describe("cancelling one", () => {
  it("after a part receipt returns only the rest, and refuses one received", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: ice, quantity: "5" }] }));
    const [line] = await prisma.retailStockTransferLine.findMany({ where: { transferId: sent.id } });
    await receiveTransfer(actor(), sent.id, { lines: [{ id: line!.id, received: "3" }], short: "STILL_COMING" });
    const before = await onHand(ice);
    expect(await cancelTransfer(actor(), sent.id)).toEqual({ transferNo: sent.transferNo });
    expect(await onHand(ice)).toBe(before + 2);
    const back = await prisma.stockMovement.findFirstOrThrow({ where: { reference: sent.transferNo, reason: "TRANSFER_BACK" } });
    expect(back.change.toNumber()).toBe(2);
    expect((await prisma.retailStockTransfer.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("RECEIVED");

    const refused = await cancelTransfer(actor(), sent.id).catch((error) => error);
    expect(refused).toMatchObject({ status: 409, message: `${sent.transferNo} has been received.` });
  });

  it("with nothing received puts every unit back and reads Cancelled", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: ice, quantity: "3" }] }));
    const before = await onHand(ice);
    await cancelTransfer(actor(), sent.id);
    expect(await onHand(ice)).toBe(before + 3);
    expect(await loadTransferView(companyId, sent.id, { canSeeCost: true })).toMatchObject({ status: "CANCELLED", stateLabel: "Cancelled" });
  });
});

describe("changing the lines (W-24 step 4)", () => {
  it("moves the difference at the site it left, adds and takes off lines", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: ice, quantity: "4" }] }));
    const iceBefore = await onHand(ice);
    const jamBefore = await onHand(jameson);

    const more = await changeTransferLines(actor(), sent.id, { lines: [{ lineId: ice, quantity: "7" }, { lineId: jameson, quantity: "1" }] });
    expect(more).toMatchObject({ units: 8, message: `${sent.transferNo} changed: 8 units on the way.` });
    expect(await onHand(ice)).toBe(iceBefore - 3);
    expect(await onHand(jameson)).toBe(jamBefore - 1);

    await changeTransferLines(actor(), sent.id, { lines: [{ lineId: ice, quantity: "2" }] });
    expect(await onHand(ice)).toBe(iceBefore + 2);
    expect(await onHand(jameson)).toBe(jamBefore);
    const lines = await prisma.retailStockTransferLine.findMany({ where: { transferId: sent.id } });
    expect(lines.map((row) => row.quantitySent.toNumber())).toEqual([2]);

    const free = (await onHand(ice)) + 2;
    const tooMany = await changeTransferLines(actor(), sent.id, { lines: [{ lineId: ice, quantity: String(free + 1) }] }).catch((error) => error);
    expect((tooMany as TransferRefusal).fieldErrors).toEqual({ "lines.0": `Only ${free} at Harare Main Branch.` });

    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId, entityId: sent.id, eventType: "RETAIL_STOCK_TRANSFER.CHANGED" } });
    expect(JSON.parse(event.payloadJson ?? "{}")).toMatchObject({ units: expect.any(Number) });
  });

  it("is refused once part of it has been received", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: ice, quantity: "4" }] }));
    const [line] = await prisma.retailStockTransferLine.findMany({ where: { transferId: sent.id } });
    await receiveTransfer(actor(), sent.id, { lines: [{ id: line!.id, received: "1" }], short: "STILL_COMING" });
    const refused = await changeTransferLines(actor(), sent.id, { lines: [{ lineId: ice, quantity: "5" }] }).catch((error) => error);
    expect(refused).toMatchObject({ status: 409, message: "Part of it has been received. Receive the rest or cancel it." });
    const to = await patchTransfer(actor(), sent.id, transferPatch.parse({ toSiteId: closed })).catch((error) => error);
    expect(to).toMatchObject({ status: 409, message: "Part of it has been received, so it is going to Borrowdale." });
  });
});

describe("the rail", () => {
  let castle: string;
  beforeAll(async () => {
    castle = (await line(hre, "CASTLE", "Castle Lager 340ml", 50, 0.86)).id;
  });

  it("changes the vehicle, driver and note, one edit event each", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: castle, quantity: "1" }] }));
    const changed = await patchTransfer(actor(), sent.id, transferPatch.parse({ vehicle: "Shop bakkie, AEZ 4471", driver: "Simba Mutasa", note: " " }));
    expect(changed).toEqual(["vehicle", "driver"]);
    const events = await prisma.platformAuditEvent.count({ where: { companyId, entityId: sent.id, eventType: "RETAIL_RECORD.EDITED" } });
    expect(events).toBe(2);
    const view = await loadTransferView(companyId, sent.id, { canSeeCost: false });
    expect(view).toMatchObject({ vehicle: "Shop bakkie, AEZ 4471", driver: "Simba Mutasa", note: null });
    expect(view).not.toHaveProperty("value");
    expect(view!.lines[0]).not.toHaveProperty("unitCost");
  });

  it("refuses To = From while on the way", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: castle, quantity: "1" }] }));
    const same = await patchTransfer(actor(), sent.id, transferPatch.parse({ toSiteId: hre })).catch((error) => error);
    expect((same as TransferRefusal).fieldErrors).toEqual({ toSiteId: "Pick a different site." });
  });
});

describe("the record's words", () => {
  it("says what came short", () => {
    expect(shortWords([{ name: "Ice 2kg bag", short: 2 }, { name: "Castle Lager 340ml", short: 0 }])).toBe("2 × Ice 2kg bag");
    expect(shortWords([{ name: "Ice 2kg bag", short: 2 }, { name: "Coca-Cola 500ml", short: 3 }])).toBe("5 units");
    expect(shortWords([])).toBeNull();
    expect(receiveHint([{ name: "Ice 2kg bag", short: 2 }], "Harare Main Branch")).toBe(
      "2 × Ice 2kg bag short. They go back on Harare Main Branch’s stock unless you mark them lost.",
    );
    expect(receivedToast("TRF-0008", "Borrowdale", [{ name: "Fanta Orange 500ml", short: 2 }], "LOST")).toBe(
      "TRF-0008 received at Borrowdale. 2 × Fanta Orange 500ml written off.",
    );
  });

  it("reads the strip's chip", () => {
    expect(transferChip("ON_THE_WAY", 130, { sent: 540, received: 0, lost: 0 })).toEqual({ label: "On the way 2h 10m", tone: "info" });
    expect(transferChip("RECEIVED", 250, { sent: 540, received: 540, lost: 0 })).toEqual({ label: "Received in 4h 10m", tone: "ok" });
    expect(transferChip("CANCELLED", 5, { sent: 1, received: 0, lost: 0 })).toEqual({ label: "Cancelled", tone: "plain" });
  });

  it("buckets transfers by month in the shop's zone", () => {
    const months = monthsEnding(new Date("2026-10-05T08:00:00Z"), 3);
    expect(months).toEqual(["2026-08", "2026-09", "2026-10"]);
    // 30 September 23:30 UTC is 1 October in Harare.
    expect(bucketByMonth([new Date("2026-09-30T23:30:00Z"), new Date("2026-08-10T10:00:00Z")], months)).toEqual([
      { month: "2026-08", transfers: 1 },
      { month: "2026-09", transfers: 0 },
      { month: "2026-10", transfers: 1 },
    ]);
  });
});

describe("the Lines tab (retail-stock-transfer-lines)", () => {
  it("reads sent, received blank until something came, and cost only for those who see it", async () => {
    const sent = await sendTransfer(actor(), input({ lines: [{ lineId: jameson, quantity: "1" }] }));
    const load = STOCK_TRANSFER_LOADERS["retail-stock-transfer-lines"]!.load;
    const before = (await load({ companyId, userId: managerId, role: "MANAGER" }, { transfer: sent.id })).rows;
    expect(before).toEqual([expect.objectContaining({ product: "Jameson Irish Whiskey 750ml", sent: 1, received: null, cost: 22.15, value: 22.15 })]);
    const clerk = (await load({ companyId, userId: clerkId, role: "STOCK_CLERK" }, { transfer: sent.id })).rows;
    expect(clerk[0]).toMatchObject({ cost: null, value: null });
    expect((await load({ companyId, userId: managerId, role: "MANAGER" }, {})).rows).toEqual([]);
    await cancelTransfer(actor(), sent.id);
  });
});
