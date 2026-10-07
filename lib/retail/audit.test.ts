/**
 * What retail writes to the chain, and what it must never write.
 *
 * R-3.3. The events themselves are exercised end to end by the trading-day
 * spec; this pins the two things a unit test can hold that an integration run
 * cannot state clearly:
 *
 *  1. **Money is hashed as a fixed string.** The payload goes into
 *     `JSON.stringify` and then into SHA-256. A `number` that serialises as
 *     `2.4000000000000004` on one runtime and `2.4` on another gives two hashes
 *     for one event, and the chain's whole claim is that a row cannot be
 *     changed without the hash moving. A float in the payload is a hash that
 *     moves on its own.
 *  2. **A reversal names its approver, or says it had none.** This is the field
 *     the shop asks about afterwards, and "absent" and "self-authorised" are
 *     different answers that must not collapse into each other.
 *
 * The client is a stub rather than the database. What is under test is the
 * shape of the row retail hands over — `lib/audit/platform.ts` owns the chaining
 * and has its own coverage.
 */

import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  auditAmount,
  auditCashMoved,
  auditExportDownloaded,
  auditRecordBin,
  auditRecordPurged,
  auditRecordEdited,
  auditGoodsReceived,
  auditSalePosted,
  auditSaleReversed,
  auditShiftClosed,
  auditShiftOpened,
  RETAIL_AUDIT_EVENTS,
  type RetailAuditActor,
} from "./audit";

type Written = {
  companyId: string;
  actor: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  payloadJson: string | null;
  eventHash: string;
  prevEventHash: string | null;
};

/**
 * Enough of the client for `writePlatformAuditEvent`: a `findFirst` that gives
 * it a predecessor and a `create` that keeps what it was handed.
 */
function recorder() {
  const rows: Written[] = [];
  const client = {
    platformAuditEvent: {
      findFirst: async () => (rows.length ? { eventHash: rows[rows.length - 1].eventHash } : null),
      create: async ({ data }: { data: Written }) => {
        rows.push(data);
        return data;
      },
    },
  } as never;
  return {
    client,
    rows,
    last: () => rows[rows.length - 1],
    payload: () => JSON.parse(rows[rows.length - 1].payloadJson ?? "{}") as Record<string, unknown>,
  };
}

const CHIPO: RetailAuditActor = {
  companyId: "company-1",
  userId: "user-chipo",
  userName: "Chipo Dube",
  userRole: "CASHIER",
};

const TAFARA = { id: "user-tafara", name: "Tafara Nyathi" };

describe("auditAmount", () => {
  it("renders money as a fixed two-place string", () => {
    expect(auditAmount(new Prisma.Decimal("2.4"))).toBe("2.40");
    expect(auditAmount("1.205")).toBe("1.21");
    expect(auditAmount(0)).toBe("0.00");
  });

  it("keeps a negative reversal negative", () => {
    // A refund line is a negative amount, and losing the sign would make the
    // audit row read as a second sale.
    expect(auditAmount(new Prisma.Decimal("-2.40"))).toBe("-2.40");
  });

  it("distinguishes absent from zero", () => {
    expect(auditAmount(null)).toBeNull();
    expect(auditAmount(undefined)).toBeNull();
    expect(auditAmount(0)).toBe("0.00");
  });

  /**
   * The reason the whole module speaks in strings.
   *
   * `0.1 + 0.2` is the canonical case, and 8.575 is the one that actually bit
   * this codebase — the epsilon-rounding helper `lib/money.ts` replaced got it
   * wrong, and a bursar's tin disagreed with the ledger.
   */
  it("does not let a float into the payload", () => {
    expect(auditAmount(0.1 + 0.2)).toBe("0.30");
    expect(auditAmount(8.575)).toBe("8.58");
    expect(JSON.stringify({ amount: auditAmount(0.1 + 0.2) })).toBe('{"amount":"0.30"}');
    // What it would have been as a number, and why that cannot be hashed.
    expect(JSON.stringify({ amount: 0.1 + 0.2 })).toBe('{"amount":0.30000000000000004}');
  });
});

describe("a sale", () => {
  it("records the receipt, the drawer and the money", async () => {
    const log = recorder();
    await auditSalePosted(log.client, {
      actor: CHIPO,
      saleId: "sale-1",
      saleNo: "RSL-0001",
      shiftId: "shift-1",
      siteId: "site-1",
      totalAmount: new Prisma.Decimal("2.40"),
      currency: "USD",
      baseAmount: new Prisma.Decimal("2.40"),
      lineCount: 2,
    });

    expect(log.last().eventType).toBe(RETAIL_AUDIT_EVENTS.salePosted);
    expect(log.last().entityType).toBe("RetailSale");
    expect(log.last().entityId).toBe("sale-1");
    expect(log.payload()).toMatchObject({
      actorRole: "CASHIER",
      actorName: "Chipo Dube",
      saleNo: "RSL-0001",
      shiftId: "shift-1",
      totalAmount: "2.40",
      currency: "USD",
      lineCount: 2,
    });
  });

  it("carries an override reason where the counter gave one", async () => {
    const log = recorder();
    await auditSalePosted(log.client, {
      actor: CHIPO,
      saleId: "sale-2",
      saleNo: "RSL-0002",
      shiftId: "shift-1",
      siteId: "site-1",
      totalAmount: "10.00",
      currency: "USD",
      baseAmount: "10.00",
      lineCount: 1,
      overrideReason: "  Damaged label  ",
    });

    // Trimmed, because the reason is rendered back to a person.
    expect(log.last().reason).toBe("Damaged label");
  });
});

describe("a reversal", () => {
  it("names the manager who approved it", async () => {
    const log = recorder();
    await auditSaleReversed(log.client, {
      actor: CHIPO,
      kind: "refund",
      saleId: "sale-refund",
      saleNo: "RSL-0005",
      sourceSaleId: "sale-1",
      sourceSaleNo: "RSL-0001",
      shiftId: "shift-1",
      totalAmount: new Prisma.Decimal("-2.40"),
      currency: "USD",
      reason: "Customer changed their mind",
      approvedBy: TAFARA,
    });

    expect(log.last().eventType).toBe(RETAIL_AUDIT_EVENTS.saleRefunded);
    expect(log.payload()).toMatchObject({
      sourceSaleNo: "RSL-0001",
      totalAmount: "-2.40",
      approvedById: "user-tafara",
      approvedByName: "Tafara Nyathi",
      selfAuthorised: false,
    });
  });

  /**
   * A manager reversing on their own authority, and a cashier reversing on
   * somebody else's, are different acts. `selfAuthorised` is what keeps them
   * apart without re-reading the permission matrix as it stood that month.
   */
  it("says so when nobody approved it", async () => {
    const log = recorder();
    await auditSaleReversed(log.client, {
      actor: { ...CHIPO, userId: "user-tafara", userName: "Tafara Nyathi", userRole: "MANAGER" },
      kind: "void",
      saleId: "sale-void",
      saleNo: "RSL-0009",
      sourceSaleId: "sale-8",
      sourceSaleNo: "RSL-0008",
      shiftId: "shift-1",
      totalAmount: "-2.40",
      currency: "USD",
      reason: "Rung on the wrong till",
    });

    expect(log.last().eventType).toBe(RETAIL_AUDIT_EVENTS.saleVoided);
    expect(log.payload()).toMatchObject({
      actorRole: "MANAGER",
      approvedById: null,
      approvedByName: null,
      selfAuthorised: true,
    });
  });
});

describe("a drawer", () => {
  it("records the float it opened on", async () => {
    const log = recorder();
    await auditShiftOpened(log.client, {
      actor: CHIPO,
      shiftId: "shift-1",
      shiftNo: "RSH-0007",
      siteId: "site-1",
      registerCode: "REG-001",
      cashierId: "user-chipo",
      openingFloat: "200",
    });

    expect(log.last().eventType).toBe(RETAIL_AUDIT_EVENTS.shiftOpened);
    expect(log.payload()).toMatchObject({ shiftNo: "RSH-0007", openingFloat: "200.00" });
  });

  it("records expected, counted and the variance between", async () => {
    const log = recorder();
    await auditShiftClosed(log.client, {
      actor: CHIPO,
      shiftId: "shift-1",
      shiftNo: "RSH-0007",
      cashierId: "user-chipo",
      expectedCash: "207.20",
      countedCash: "250.00",
      variance: "42.80",
    });

    expect(log.payload()).toMatchObject({
      expectedCash: "207.20",
      countedCash: "250.00",
      variance: "42.80",
      closedByOwner: true,
    });
  });

  /**
   * A manager closing somebody else's till is legitimate and routine. It is
   * also the shape of a drawer closed before its cashier could count it, which
   * is why the distinction is on the row rather than inferred later.
   */
  it("says when somebody else cashed it up", async () => {
    const log = recorder();
    await auditShiftClosed(log.client, {
      actor: { companyId: "company-1", userId: "user-tafara", userRole: "SHOP_MANAGER" },
      shiftId: "shift-1",
      shiftNo: "RSH-0007",
      cashierId: "user-chipo",
      expectedCash: "207.20",
      countedCash: "180.00",
      variance: "-27.20",
    });

    expect(log.payload()).toMatchObject({ variance: "-27.20", closedByOwner: false });
  });
});

describe("cash and stock", () => {
  it("records a drop to the safe in both currencies", async () => {
    const log = recorder();
    await auditCashMoved(log.client, {
      actor: CHIPO,
      movementId: "move-1",
      shiftId: "shift-1",
      type: "DROP_TO_SAFE",
      reasonCode: "BANKING",
      amount: "550.00",
      currency: "ZWG",
      baseAmount: "20.00",
      note: "Two hundred to the safe",
    });

    expect(log.last().eventType).toBe(RETAIL_AUDIT_EVENTS.cashMoved);
    // The tender and what it is worth in the base currency are both kept: a
    // bundle of ZWG notes is not the number that moved `expectedCash`.
    expect(log.payload()).toMatchObject({
      type: "DROP_TO_SAFE",
      amount: "550.00",
      currency: "ZWG",
      baseAmount: "20.00",
    });
  });

  it("records what a delivery was booked in at", async () => {
    const log = recorder();
    await auditGoodsReceived(log.client, {
      actor: { companyId: "company-1", userId: "user-clerk", userRole: "STOCK_CLERK" },
      receiptId: "receipt-1",
      receiptNo: "RGR-0001",
      purchaseOrderId: "po-1",
      siteId: "site-1",
      supplier: "Delta Beverages",
      totalValue: "489.60",
      lineCount: 3,
    });

    expect(log.last().eventType).toBe(RETAIL_AUDIT_EVENTS.goodsReceived);
    expect(log.payload()).toMatchObject({
      receiptNo: "RGR-0001",
      supplier: "Delta Beverages",
      totalValue: "489.60",
      lineCount: 3,
    });
  });

  it("records who took a list home, as what, and how many rows", async () => {
    const log = recorder();
    await auditExportDownloaded(log.client, { actor: CHIPO, key: "retail-shifts", format: "xlsx", rows: 312 });

    expect(log.last().eventType).toBe(RETAIL_AUDIT_EVENTS.exportDownloaded);
    expect(log.last().entityType).toBe("ReportSource");
    expect(log.last().entityId).toBe("retail-shifts");
    expect(log.payload()).toMatchObject({ key: "retail-shifts", format: "xlsx", rows: 312 });
  });
});

describe("records edited in place and moved to the bin", () => {
  it("records the field, its label and both values, money as a string", async () => {
    const log = recorder();
    await auditRecordEdited(log.client, {
      actor: CHIPO,
      entityType: "Product",
      entityId: "product-1",
      field: "unitPrice",
      label: "Price",
      from: auditAmount(17.99),
      to: auditAmount(18.25),
      kind: "money",
    });
    expect(log.last().eventType).toBe("RETAIL_RECORD.EDITED");
    expect(log.last().entityType).toBe("Product");
    expect(log.payload()).toMatchObject({
      entityType: "Product",
      field: "unitPrice",
      label: "Price",
      from: "17.99",
      to: "18.25",
      kind: "money",
    });
  });

  it("records a bin move and a restore with the kind and the name", async () => {
    const log = recorder();
    const base = { actor: CHIPO, entityType: "Product", entityId: "product-1", kind: "product", name: "Amarula Cream 750ml" };
    await auditRecordBin(log.client, { ...base, action: "binned" });
    expect(log.last().eventType).toBe("RETAIL_RECORD.BINNED");
    expect(log.payload()).toMatchObject({ kind: "product", name: "Amarula Cream 750ml" });
    await auditRecordBin(log.client, { ...base, action: "restored" });
    expect(log.last().eventType).toBe("RETAIL_RECORD.RESTORED");
  });

  it("records deleting for good: by someone, or by the nightly purge with no actor", async () => {
    const log = recorder();
    const base = { companyId: "company-1", entityType: "RetailPromotion", entityId: "promo-1", kind: "promotion", name: "Happy hour" };
    await auditRecordPurged(log.client, { ...base, actor: CHIPO, how: "deleted" });
    expect(log.last().eventType).toBe("RETAIL_RECORD.PURGED");
    expect(log.last().actor).toBe("user-chipo");
    expect(log.payload()).toMatchObject({ kind: "promotion", name: "Happy hour", how: "deleted", automatic: false, actorName: "Chipo Dube" });
    await auditRecordPurged(log.client, { ...base, actor: null, how: "kept" });
    expect(log.last().actor).toBeNull();
    expect(log.last().companyId).toBe("company-1");
    expect(log.payload()).toMatchObject({ how: "kept", automatic: true, actorName: null });
  });
});

describe("the chain", () => {
  it("links each event to the one before it", async () => {
    const log = recorder();
    await auditShiftOpened(log.client, {
      actor: CHIPO,
      shiftId: "shift-1",
      shiftNo: "RSH-0007",
      siteId: "site-1",
      registerCode: "REG-001",
      cashierId: "user-chipo",
      openingFloat: "200",
    });
    await auditSalePosted(log.client, {
      actor: CHIPO,
      saleId: "sale-1",
      saleNo: "RSL-0001",
      shiftId: "shift-1",
      siteId: "site-1",
      totalAmount: "2.40",
      currency: "USD",
      baseAmount: "2.40",
      lineCount: 2,
    });

    expect(log.rows).toHaveLength(2);
    expect(log.rows[0].prevEventHash).toBeNull();
    expect(log.rows[1].prevEventHash).toBe(log.rows[0].eventHash);
    expect(log.rows[1].eventHash).not.toBe(log.rows[0].eventHash);
  });

  /**
   * The event-type list is the module's vocabulary, and a typo in one of these
   * strings would put an event on the chain that nothing queries for. Pinning
   * the values means renaming one is a decision rather than a slip.
   */
  it("uses the event names the readers query for", () => {
    expect(RETAIL_AUDIT_EVENTS).toEqual({
      salePosted: "RETAIL_SALE.POSTED",
      saleRefunded: "RETAIL_SALE.REFUNDED",
      saleVoided: "RETAIL_SALE.VOIDED",
      shiftOpened: "RETAIL_SHIFT.OPENED",
      shiftClosed: "RETAIL_SHIFT.CLOSED",
      shiftSignedOff: "RETAIL_SHIFT.SIGNED_OFF",
      dayClosed: "RETAIL_DAY.CLOSED",
      cashMoved: "RETAIL_CASH.MOVED",
      goodsReceived: "RETAIL_GOODS.RECEIVED",
      movementsReversed: "RETAIL_STOCK.MOVEMENTS_REVERSED",
      stockAdjusted: "RETAIL_STOCK.ADJUSTED",
      caseBroken: "RETAIL_STOCK.CASE_BROKEN",
      orderClosed: "RETAIL_PURCHASE_ORDER.CLOSED",
      orderReopened: "RETAIL_PURCHASE_ORDER.REOPENED",
      shopProfileChanged: "RETAIL_SHOP.PROFILE_CHANGED",
      exportDownloaded: "RETAIL_EXPORT.DOWNLOADED",
      recordEdited: "RETAIL_RECORD.EDITED",
      recordBinned: "RETAIL_RECORD.BINNED",
      recordRestored: "RETAIL_RECORD.RESTORED",
      recordPurged: "RETAIL_RECORD.PURGED",
      settingsChanged: "RETAIL_SETTINGS.CHANGED",
      productArchived: "RETAIL_PRODUCT.ARCHIVED",
      productUnarchived: "RETAIL_PRODUCT.UNARCHIVED",
      productCreated: "RETAIL_PRODUCT.CREATED",
      productsImported: "RETAIL_PRODUCTS.IMPORTED",
      priceChanged: "RETAIL_PRICE.CHANGED",
      categoryCreated: "RETAIL_CATEGORY.CREATED",
      categoryChanged: "RETAIL_CATEGORY.CHANGED",
      categoryDeleted: "RETAIL_CATEGORY.DELETED",
      siteCreated: "RETAIL_SITE.CREATED",
      siteChanged: "RETAIL_SITE.CHANGED",
      siteClosed: "RETAIL_SITE.CLOSED",
      priceListCreated: "RETAIL_PRICE_LIST.CREATED",
      priceListChanged: "RETAIL_PRICE_LIST.CHANGED",
      priceListPaused: "RETAIL_PRICE_LIST.PAUSED",
      priceListResumed: "RETAIL_PRICE_LIST.RESUMED",
      tillCreated: "RETAIL_TILL.CREATED",
      tillChanged: "RETAIL_TILL.CHANGED",
      deviceUnpaired: "RETAIL_DEVICE.UNPAIRED",
      devicePaired: "RETAIL_DEVICE.PAIRED",
      deviceReplaced: "RETAIL_DEVICE.REPLACED",
      tillMessageSent: "RETAIL_TILL.MESSAGE_SENT",
      transferSent: "RETAIL_STOCK_TRANSFER.SENT",
      transferCancelled: "RETAIL_STOCK_TRANSFER.CANCELLED",
      transferChanged: "RETAIL_STOCK_TRANSFER.CHANGED",
      transferReceived: "RETAIL_STOCK_TRANSFER.RECEIVED",
      countStarted: "RETAIL_STOCK_COUNT.STARTED",
      countSubmitted: "RETAIL_STOCK_COUNT.SUBMITTED",
      zigRateSet: "RETAIL_ZIG_RATE.SET",
      postingRun: "RETAIL_POSTING.RUN",
      postingAccountAdded: "RETAIL_POSTING.ACCOUNT_ADDED",
      drawerOpened: "RETAIL_DRAWER.OPENED",
      fiscalConnected: "RETAIL_FISCAL.CONNECTED",
      fiscalDayClosed: "RETAIL_FISCAL.DAY_CLOSED",
      personInvited: "RETAIL_PERSON.INVITED",
      personJoined: "RETAIL_PERSON.JOINED",
      personChanged: "RETAIL_PERSON.CHANGED",
      personPinSent: "RETAIL_PERSON.PIN_SENT",
      personAccessRemoved: "RETAIL_PERSON.ACCESS_REMOVED",
      personAccessRestored: "RETAIL_PERSON.ACCESS_RESTORED",
      pinChosen: "RETAIL_PERSON.PIN_CHOSEN",
      pinLocked: "RETAIL_PIN.LOCKED",
      supplierCreated: "RETAIL_SUPPLIER.CREATED",
      supplierContactAdded: "RETAIL_SUPPLIER.CONTACT_ADDED",
      supplierContactRemoved: "RETAIL_SUPPLIER.CONTACT_REMOVED",
      supplierStopped: "RETAIL_SUPPLIER.STOPPED",
      supplierResumed: "RETAIL_SUPPLIER.RESUMED",
      suppliersMessaged: "RETAIL_SUPPLIER.MESSAGED",
      saleReprinted: "RETAIL_SALE.REPRINTED",
      saleSent: "RETAIL_SALE.SENT",
      saleReviewed: "RETAIL_SALE.REVIEWED",
      labelsPrinted: "RETAIL_LABELS.PRINTED",
    });
  });
});
