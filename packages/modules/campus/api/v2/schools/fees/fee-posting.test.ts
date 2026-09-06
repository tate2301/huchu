/**
 * School fee events reach the general ledger.
 *
 * The helper used to write an `AccountingIntegrationEvent` with status PENDING
 * and stop. Nothing turned those rows into journal entries except a replay
 * endpoint and a CLI, both run by hand, so fee income — the pack's whole wedge
 * — sat outside the trial balance until somebody remembered. These assert that
 * posting is now a consequence of taking the money.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
import { emitSchoolFeeAccountingEvent } from "../../../../fees-posting";

let companyId: string;
let actorId: string;
let stamp: number;

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Fee Posting School ${stamp}`, slug: `fee-posting-${stamp}` },
  });
  companyId = company.id;

  const actor = await prisma.user.create({
    data: {
      companyId,
      email: `bursar-${stamp}@fee-posting.test`,
      name: "Bursar",
      role: "BURSAR",
    },
    select: { id: true },
  });
  actorId = actor.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

async function postReceipt(receiptId: string, amount = 250) {
  return emitSchoolFeeAccountingEvent({
    companyId,
    actorId,
    eventType: "SCHOOL_FEE_RECEIPT_POSTED",
    sourceId: receiptId,
    sourceRef: `RCT-${receiptId.slice(0, 6)}`,
    entryDate: new Date(),
    amount,
  });
}

describe("posting a fee receipt", () => {
  it("reports an outcome rather than silently queueing", async () => {
    const result = await postReceipt(`receipt-${stamp}-a`);

    // A fresh tenant has no posting rules, so the honest outcome here is a
    // named failure. What must never happen again is the old behaviour: a
    // PENDING row, a success-shaped return, and no entry.
    expect(["POSTED", "PENDING", "FAILED"]).toContain(result.accountingStatus);
    if (result.accountingStatus !== "POSTED") {
      expect(result.accountingError).toBeTruthy();
      expect(result.journalEntryId).toBeNull();
    }
  });

  it("records the attempt against a stable, idempotent source id", async () => {
    const receiptId = `receipt-${stamp}-b`;
    await postReceipt(receiptId);

    const events = await prisma.accountingIntegrationEvent.findMany({
      where: { companyId, sourceId: `SCHOOL_FEE_RECEIPT:${receiptId}` },
      select: { id: true, sourceType: true },
    });

    expect(events).toHaveLength(1);
    // S-2.3: its own kind, not a borrowed SALES_RECEIPT.
    expect(events[0].sourceType).toBe("SCHOOL_FEE_RECEIPT");
  });

  it("round-trips a Decimal amount at the cent", async () => {
    // Post S-2.1 Float→Decimal: every caller now hands this helper a
    // `Prisma.Decimal`, and the amount that reaches the integration event must
    // be the cent the bursar counted, not a binary approximation of it.
    const receiptId = `receipt-${stamp}-decimal`;
    await emitSchoolFeeAccountingEvent({
      companyId,
      actorId,
      eventType: "SCHOOL_FEE_RECEIPT_POSTED",
      sourceId: receiptId,
      sourceRef: `RCT-${receiptId.slice(0, 6)}`,
      entryDate: new Date(),
      amount: new Prisma.Decimal("1234.56"),
      currency: "USD",
      documentCurrency: "ZWG",
      documentAmount: new Prisma.Decimal("33950.40"),
      exchangeRate: new Prisma.Decimal("27.5"),
    });

    const event = await prisma.accountingIntegrationEvent.findFirstOrThrow({
      where: { companyId, sourceId: `SCHOOL_FEE_RECEIPT:${receiptId}` },
      select: { amount: true, currency: true, payloadJson: true },
    });

    expect(Number(event.amount)).toBeCloseTo(1234.56, 6);
    expect(event.currency).toBe("USD");

    // S-2.2: what the family was actually billed rides in the payload as a
    // number. A `Prisma.Decimal` dropped in here is not a type error and
    // `JSON.stringify` would have stored it as a string.
    const envelope = JSON.parse(event.payloadJson ?? "{}") as Record<string, unknown>;
    expect(envelope.documentCurrency).toBe("ZWG");
    expect(typeof envelope.documentAmount).toBe("number");
    expect(envelope.documentAmount).toBeCloseTo(33950.4, 6);
    expect(envelope.exchangeRate).toBeCloseTo(27.5, 6);
  });

  it("does not create a second event when the same receipt is posted twice", async () => {
    const receiptId = `receipt-${stamp}-c`;
    await postReceipt(receiptId);
    await postReceipt(receiptId);

    const events = await prisma.accountingIntegrationEvent.count({
      where: { companyId, sourceId: `SCHOOL_FEE_RECEIPT:${receiptId}` },
    });
    expect(events).toBe(1);
  });
});

describe("source ids keep the event kinds apart", () => {
  it("gives every event kind its own key and its own source type", async () => {
    const id = `mixed-${stamp}`;
    const kinds = [
      ["SCHOOL_FEE_INVOICE_ISSUED", `SCHOOL_FEE_INVOICE:${id}`, "SCHOOL_FEE_INVOICE"],
      ["SCHOOL_FEE_RECEIPT_POSTED", `SCHOOL_FEE_RECEIPT:${id}`, "SCHOOL_FEE_RECEIPT"],
      ["SCHOOL_FEE_RECEIPT_VOIDED", `SCHOOL_FEE_RECEIPT_VOID:${id}`, "SCHOOL_FEE_RECEIPT_VOID"],
      ["SCHOOL_FEE_CREDIT_APPLIED", `SCHOOL_FEE_CREDIT:${id}`, "SCHOOL_FEE_CREDIT_APPLIED"],
      ["SCHOOL_FEE_REFUND_PAID", `SCHOOL_FEE_REFUND:${id}`, "SCHOOL_FEE_REFUND"],
      ["SCHOOL_FEE_WAIVER_APPLIED", `SCHOOL_FEE_WAIVER:${id}`, "SCHOOL_FEE_WAIVER"],
      ["SCHOOL_FEE_WRITEOFF_POSTED", `SCHOOL_FEE_WRITEOFF:${id}`, "SCHOOL_FEE_WRITE_OFF"],
    ] as const;

    for (const [eventType, , ] of kinds) {
      await emitSchoolFeeAccountingEvent({
        companyId,
        actorId,
        eventType,
        sourceId: id,
        sourceRef: `REF-${id.slice(0, 6)}`,
        entryDate: new Date(),
        amount: 100,
      });
    }

    for (const [, sourceId, sourceType] of kinds) {
      const event = await prisma.accountingIntegrationEvent.findFirst({
        where: { companyId, sourceId },
        select: { sourceType: true },
      });
      // A void that shared a receipt's key would overwrite the receipt's own
      // posting rather than reversing it.
      expect(event, `no event for ${sourceId}`).not.toBeNull();
      expect(event?.sourceType).toBe(sourceType);
    }
  });
});
