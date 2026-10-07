import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { approvalWarn } from "@/lib/retail/approver-words";
import { listApprovers } from "@/lib/retail/approvers";
import { cashMovementWhy } from "@/lib/retail/cash-movements";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { closeShift } from "./shifts";

import { answerCashMove } from "./cash-moves";

/**
 * Cash in or out of a drawer (50-floor W-38, FLR-03): each why's type and
 * reason, the drawer's limit, every movement approved (a manager's PIN or
 * their own right), the closed shift, the server's rate, and the journal each
 * posts. Through `answerCashMove`, the answer both routes give, against the
 * test database.
 */

let shop: TestShop;
let chipoId: string;
let bookkeeperId: string;
let shiftId: string;
const SHIFT_NO = "SH-00242";

const chipo = () => ({ user: { id: chipoId, companyId: shop.companyId, role: "CASHIER", name: "Chipo Dube" } });
const tafara = () => ({ user: { id: shop.managerId, companyId: shop.companyId, role: "MANAGER", name: "Tafara Nyathi" } });
const bookkeeper = () => ({ user: { id: bookkeeperId, companyId: shop.companyId, role: "FINANCE_OFFICER", name: "Ruvimbo Chari" } });

async function move(session: ReturnType<typeof chipo>, body: Record<string, unknown>, id = shiftId) {
  const response = await answerCashMove({ session, shiftId: id, body: { direction: "OUT", why: "DROP", currency: "USD", ...body } });
  return { status: response.status, body: await response.json() };
}

const expected = async () => Number((await prisma.retailShift.findUniqueOrThrow({ where: { id: shiftId } })).expectedCash);

async function journal(sourceId: string) {
  await runRetailPosting(shop.companyId, "BY_HAND", null);
  const [entry] = await prisma.journalEntry.findMany({
    where: { companyId: shop.companyId, sourceId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
  return {
    sourceType: entry?.sourceType,
    lines: (entry?.lines ?? [])
      .map((line) => ({ code: line.account.code, debit: line.debit, credit: line.credit }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}

beforeAll(async () => {
  shop = await makeTestShop("Cash moves");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  const user = (name: string, role: string, key: string) =>
    prisma.user.create({ data: { companyId: shop.companyId, name, role: role as never, email: `${key}-${shop.companyId}@cash.test` }, select: { id: true } });
  chipoId = (await user("Chipo Dube", "CASHIER", "chipo")).id;
  bookkeeperId = (await user("Ruvimbo Chari", "FINANCE_OFFICER", "books")).id;
  await prisma.retailTillPin.create({ data: { companyId: shop.companyId, userId: shop.managerId, pinHash: await bcrypt.hash("2468", 4) } });
  await prisma.retailTillPin.create({ data: { companyId: shop.companyId, userId: shop.ownerId, pinHash: await bcrypt.hash("1357", 4) } });
  await prisma.retailPaymentSettings.create({ data: { companyId: shop.companyId, takeCashZig: true } });
  await prisma.currencyRate.create({
    data: { companyId: shop.companyId, baseCurrency: "USD", quoteCurrency: "ZWG", rate: 26.8, effectiveDate: new Date(Date.now() - 60_000) },
  });
  const till = await prisma.retailRegister.create({ data: { companyId: shop.companyId, siteId: shop.mainId, code: `FRONT-${shop.companyId.slice(0, 6)}`, name: "Front till" } });
  shiftId = (
    await prisma.retailShift.create({
      data: {
        companyId: shop.companyId,
        shiftNo: SHIFT_NO,
        registerId: till.id,
        registerCode: till.code,
        registerName: "Front till",
        siteId: shop.mainId,
        cashierId: chipoId,
        cashierName: "Chipo Dube",
        openingFloat: "200.00",
        expectedCash: "1000.00",
      },
    })
  ).id;
}, 60_000);

beforeEach(async () => {
  await prisma.retailTillPin.updateMany({ where: { companyId: shop.companyId }, data: { failedAttempts: 0, lockedAt: null } });
});

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailTillPin.deleteMany({ where: { companyId } });
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.retailCashMovement.deleteMany({ where: { companyId } });
  await prisma.approvalAction.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("approval, every movement", () => {
  it("asks a cashier for a manager, and names who can give it", async () => {
    expect(await move(chipo(), { amount: "20.00" })).toEqual({
      status: 409,
      body: { error: "A manager has to approve this.", needsApprover: true, reason: "A manager has to approve this." },
    });
    const names = (await listApprovers(shop.companyId, ["retail.cash-control", "approve"])).map((person) => person.name);
    expect(names).toEqual(["Tafara Nyathi", "Tendai Mhlanga"]);
    expect(approvalWarn(names)).toBe("Needed. Ask Tafara Nyathi or Tendai Mhlanga.");
  });

  it("refuses a wrong PIN under the PIN, counting the try, and records with Tafara's", async () => {
    const before = await expected();
    const wrong = await move(chipo(), { amount: "20.00", approver: { userId: shop.managerId, pin: "1111" } });
    expect(wrong).toMatchObject({ status: 409, body: { needsApprover: true, fieldErrors: { pin: "That PIN is not right." } } });
    expect((await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: shop.managerId } })).failedAttempts).toBe(1);
    expect(await expected()).toBe(before);

    const done = await move(chipo(), { amount: "20.00", approver: { userId: shop.managerId, pin: "2468" } });
    expect(done).toMatchObject({ status: 201, body: { data: { type: "DROP_TO_SAFE", amount: 20, currency: "USD", delta: -20 }, shift: { expectedCash: before - 20 } } });
    const row = await prisma.retailCashMovement.findUniqueOrThrow({ where: { id: done.body.data.id } });
    expect(row).toMatchObject({ approvedById: shop.managerId, approvedByName: "Tafara Nyathi", recordedByName: "Chipo Dube" });
  });

  it("lets a manager approve their own, on another cashier's drawer", async () => {
    const done = await move(tafara(), { amount: "10.00" });
    expect(done.status).toBe(201);
    const row = await prisma.retailCashMovement.findUniqueOrThrow({ where: { id: done.body.data.id } });
    expect(row).toMatchObject({ approvedById: shop.managerId, approvedByName: "Tafara Nyathi" });
  });

  it("refuses a bookkeeper: they read shifts, they do not move cash", async () => {
    expect(await move(bookkeeper(), { amount: "10.00" })).toMatchObject({ status: 403, body: { error: "Your role cannot change shifts and cash" } });
  });
});

describe("each why", () => {
  it("stores a drop, petty cash and a top-up with their type and reason, moving the drawer", async () => {
    const before = await expected();
    const drop = await move(tafara(), { amount: "200.00" });
    const petty = await move(tafara(), { why: "PETTY", amount: "20.00", note: "Cleaning materials" });
    const topUp = await move(tafara(), { direction: "IN", why: "TOP_UP", amount: "50.00" });
    for (const answer of [drop, petty, topUp]) expect(answer.status).toBe(201);
    const rows = await prisma.retailCashMovement.findMany({
      where: { id: { in: [drop.body.data.id, petty.body.data.id, topUp.body.data.id] } },
      select: { type: true, reasonCode: true, reason: true },
    });
    expect(rows.map((row) => [row.type, row.reasonCode, cashMovementWhy(row.type, row.reasonCode)]).sort()).toEqual([
      ["DROP_TO_SAFE", "CASH_LEVEL_TOO_HIGH", "Drop to the safe"],
      ["FLOAT_TOP_UP", "CHANGE_REQUIRED", "Float top-up"],
      ["PAYOUT", "PETTY_CASH", "Petty cash"],
    ]);
    expect(await expected()).toBe(before - 200 - 20 + 50);

    expect(await journal(drop.body.data.id)).toEqual({
      sourceType: "RETAIL_CASH_MOVEMENT",
      lines: [
        { code: "1000", debit: 0, credit: 200 },
        { code: "1005", debit: 200, credit: 0 },
      ],
    });
    expect(await journal(petty.body.data.id)).toEqual({
      sourceType: "RETAIL_PETTY_CASH",
      lines: [
        { code: "1000", debit: 0, credit: 20 },
        { code: "5110", debit: 20, credit: 0 },
      ],
    });
    expect(await journal(topUp.body.data.id)).toEqual({
      sourceType: "RETAIL_CASH_MOVEMENT",
      lines: [
        { code: "1000", debit: 50, credit: 0 },
        { code: "1005", debit: 0, credit: 50 },
      ],
    });
  });

  it("takes ZiG at the shop's rate, never the client's, and credits the ZiG till", async () => {
    const before = await expected();
    const drop = await move(tafara(), { amount: "500.00", currency: "ZWG", exchangeRate: 1 });
    expect(drop).toMatchObject({ status: 201, body: { data: { amount: 500, currency: "ZWG", delta: -18.66 } } });
    const row = await prisma.retailCashMovement.findUniqueOrThrow({ where: { id: drop.body.data.id } });
    expect([Number(row.exchangeRate), Number(row.baseAmount)]).toEqual([26.8, 18.66]);
    expect(await expected()).toBeCloseTo(before - 18.66, 2);
    expect(await journal(drop.body.data.id)).toEqual({
      sourceType: "RETAIL_CASH_MOVEMENT",
      lines: [
        { code: "1001", debit: 0, credit: 18.66 },
        { code: "1005", debit: 18.66, credit: 0 },
      ],
    });
  });
});

describe("refusals", () => {
  it("refuses more out than the drawer should hold, a why against its direction, petty cash with no note, and no amount", async () => {
    const left = await expected();
    expect(await move(tafara(), { amount: "5000.00" })).toEqual({
      status: 400,
      body: { error: `Only US$${left.toLocaleString("en-US", { minimumFractionDigits: 2 })} should be in the drawer.`, fieldErrors: { amt: `Only US$${left.toLocaleString("en-US", { minimumFractionDigits: 2 })} should be in the drawer.` } },
    });
    expect(await move(tafara(), { direction: "IN", why: "DROP", amount: "5.00" })).toMatchObject({ status: 400, body: { fieldErrors: { why: "Pick why the cash moved." } } });
    expect(await move(tafara(), { why: "PETTY", amount: "5.00" })).toMatchObject({ status: 400, body: { fieldErrors: { note: "Say what it was for." } } });
    expect(await move(tafara(), { amount: "0" })).toMatchObject({ status: 400, body: { fieldErrors: { amt: "Give the amount, like 200.00." } } });
    expect(await move(tafara(), { amount: "abc" })).toMatchObject({ status: 400, body: { fieldErrors: { amt: "Give the amount, like 200.00." } } });
    expect(await expected()).toBe(left);
  });

  it("refuses an amount too large for the drawer's figures, and a note over 200 characters, in the sheet's words", async () => {
    const left = await expected();
    expect(await move(tafara(), { direction: "IN", why: "TOP_UP", amount: "999999999999.99" })).toEqual({
      status: 400,
      body: { error: "Give the amount, like 200.00.", fieldErrors: { amt: "Give the amount, like 200.00." } },
    });
    expect(await move(tafara(), { why: "PETTY", amount: "5.00", note: "x".repeat(201) })).toEqual({
      status: 400,
      body: { error: "Keep it to 200 characters.", fieldErrors: { note: "Keep it to 200 characters." } },
    });
    expect(await expected()).toBe(left);
  });

  it("refuses ZiG where the shop takes none, and a closed shift", async () => {
    await prisma.retailPaymentSettings.update({ where: { companyId: shop.companyId }, data: { takeCashZig: false } });
    expect(await move(tafara(), { amount: "5.00", currency: "ZWG" })).toMatchObject({ status: 400, body: { fieldErrors: { cur: "This shop does not take ZiG cash." } } });
    await prisma.retailPaymentSettings.update({ where: { companyId: shop.companyId }, data: { takeCashZig: true } });

    await prisma.retailShift.update({ where: { id: shiftId }, data: { status: "CLOSED", closedAt: new Date() } });
    expect(await move(tafara(), { amount: "5.00" })).toEqual({ status: 409, body: { error: `${SHIFT_NO} is closed.` } });
    await prisma.retailShift.update({ where: { id: shiftId }, data: { status: "OPEN", closedAt: null } });
  });
});

describe("a close racing a cash movement", () => {
  it("works the variance out from what the drawer held when it closed, whichever lands first", async () => {
    const till = await prisma.retailRegister.findFirstOrThrow({ where: { companyId: shop.companyId }, select: { id: true, code: true } });
    const owner = { companyId: shop.companyId, userId: shop.ownerId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" };
    for (let round = 0; round < 6; round += 1) {
      const shift = await prisma.retailShift.create({
        data: {
          companyId: shop.companyId,
          shiftNo: `SH-RACE-${round}`,
          registerId: till.id,
          registerCode: till.code,
          registerName: "Front till",
          siteId: shop.mainId,
          cashierId: chipoId,
          cashierName: "Chipo Dube",
          openingFloat: "100.00",
          expectedCash: "100.00",
        },
        select: { id: true },
      });
      const [moved] = await Promise.allSettled([
        move(tafara(), { amount: "30.00" }, shift.id),
        closeShift({
          session: { user: { id: owner.userId, companyId: owner.companyId, role: owner.userRole, name: owner.userName } },
          shiftId: shift.id,
          body: { counts: { USD: [{ denomination: "100", count: 1 }] }, floatLeft: "0", note: "Counted while a drop was made" },
        }),
      ]);
      const after = await prisma.retailShift.findUniqueOrThrow({ where: { id: shift.id } });
      expect(after.status).toBe("CLOSED");
      // The drop either landed before the close (the variance counts it) or was refused as closed.
      expect(Number(after.variance)).toBe(100 - Number(after.expectedCash));
      expect(moved.status === "fulfilled" && [201, 409].includes(moved.value.status)).toBe(true);
    }
  }, 60_000);
});
