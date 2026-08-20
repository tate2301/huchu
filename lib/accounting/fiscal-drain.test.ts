/**
 * FD-6 — the fiscal drainer, against a real Postgres.
 *
 * The claim is the whole story here, and it is enforced by the database:
 * `FOR UPDATE SKIP LOCKED` plus a lease written in the same statement. A mocked
 * client would prove the mock. So these tests run two drains at once against
 * real rows and assert no receipt is ever worked twice — once with a batch big
 * enough to be split between them, and once with an attempt held open so the
 * second drain arrives while the first is still inside the connector.
 *
 * No network is involved: the re-issue seam is injected, which is what it is
 * there for. What the fake issuers do to the row is exactly what the real ones
 * do (write SUCCESS themselves, or leave the row alone and report why), so the
 * drain's own bookkeeping is what is under test.
 *
 * Run: npx vitest run lib/accounting/fiscal-drain
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  drainDueFiscalReceipts,
  fiscalRetryDelayMs,
  type FiscalDrainIssuers,
} from "@/lib/accounting/fiscal-drain";

const suite = crypto.randomUUID().slice(0, 8);

let companyId: string;
let customerId: string;
let managerId: string;

const MINUTE = 60 * 1000;

/** Every issuer call the drain made, in order, so a duplicate is visible. */
let issued: string[] = [];

/** Stands in for `issueFiscalReceipt`. Writes the row the way the real issuer
 *  does — SUCCESS is recorded by the issuer, never by the drain. */
function issuerReturning(
  outcome: (invoiceId: string) => Promise<{ status: "SUCCESS" | "PENDING" | "FAILED" | "SKIPPED"; error?: string | null }>,
): FiscalDrainIssuers {
  return {
    salesInvoice: async ({ invoiceId }) => {
      issued.push(invoiceId);
      return outcome(invoiceId);
    },
    schoolFeeReceipt: async () => {
      throw new Error("no school receipts in this fixture");
    },
  };
}

const alwaysFails = issuerReturning(async () => ({
  status: "FAILED" as const,
  error: "FDMS unreachable",
}));

/** A fiscal receipt needs exactly one source document
 *  (`FiscalReceipt_one_source_check`); a sales invoice is the one this build
 *  has an issuer for. */
async function createReceipt(args: {
  nextRetryAt?: Date | null;
  attemptCount?: number;
  status?: "PENDING" | "FAILED" | "SUCCESS";
  createdAt?: Date;
}) {
  const invoice = await prisma.salesInvoice.create({
    data: {
      companyId,
      customerId,
      invoiceNumber: `FD6-${suite}-${crypto.randomUUID().slice(0, 8)}`,
      invoiceDate: new Date(),
      currency: "USD",
      total: 115,
    },
  });

  const receipt = await prisma.fiscalReceipt.create({
    data: {
      companyId,
      invoiceId: invoice.id,
      status: args.status ?? "PENDING",
      attemptCount: args.attemptCount ?? 0,
      nextRetryAt: args.nextRetryAt ?? null,
      providerKey: `zimra-${suite}`,
      ...(args.createdAt ? { createdAt: args.createdAt } : {}),
    },
  });

  return { receipt, invoiceId: invoice.id };
}

/** The pass the tests run: this tenant only, notifications off unless the test
 *  is about notifications. */
function drain(options: Parameters<typeof drainDueFiscalReceipts>[0] = {}) {
  return drainDueFiscalReceipts({ companyId, notify: false, ...options });
}

beforeAll(async () => {
  await prisma.$connect();
  const company = await prisma.company.create({
    data: { name: "FD-6 Fiscal Drain Test Co", slug: `fd6-${suite}` },
  });
  companyId = company.id;

  const customer = await prisma.customer.create({
    data: { companyId, name: "Drain Test Customer" },
  });
  customerId = customer.id;

  // The audience for a sustained-failure notice. Without an active manager
  // `createNotification` writes nothing at all, by design.
  const manager = await prisma.user.create({
    data: {
      companyId,
      email: `fd6-${suite}@example.test`,
      name: "Drain Test Manager",
      role: "MANAGER",
    },
  });
  managerId = manager.id;
});

afterAll(async () => {
  await prisma.notificationRecipient.deleteMany({ where: { userId: managerId } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  issued = [];
  await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
  await prisma.notification.deleteMany({ where: { companyId } });
});

describe("what the drain claims", () => {
  it("picks up a receipt whose retry is due", async () => {
    const { receipt, invoiceId } = await createReceipt({
      nextRetryAt: new Date(Date.now() - MINUTE),
    });

    const result = await drain({
      issuers: issuerReturning(async (id) => {
        // The real issuer writes the accepted state itself; the drain must not.
        await prisma.fiscalReceipt.updateMany({
          where: { invoiceId: id },
          data: { status: "SUCCESS", attemptCount: 1, fiscalNumber: "FDMS-1" },
        });
        return { status: "SUCCESS" };
      }),
    });

    expect(issued).toEqual([invoiceId]);
    expect(result.claimed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.receipts[0]).toMatchObject({ receiptId: receipt.id, outcome: "SUCCEEDED" });

    const after = await prisma.fiscalReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(after.status).toBe("SUCCESS");
  });

  it("picks up a receipt that was never scheduled at all", async () => {
    // The shape `issueFiscalDocument` leaves after a refusal that never reached
    // the network. Nothing else would ever look at it again.
    const { receipt } = await createReceipt({ nextRetryAt: null });

    const result = await drain({ issuers: alwaysFails });

    expect(result.claimed).toBe(1);
    expect(result.receipts[0].receiptId).toBe(receipt.id);
  });

  it("leaves a receipt whose retry is in the future alone", async () => {
    await createReceipt({ nextRetryAt: new Date(Date.now() + 30 * MINUTE) });

    const result = await drain({ issuers: alwaysFails });

    expect(result.claimed).toBe(0);
    expect(issued).toEqual([]);
  });

  it("leaves an accepted receipt alone", async () => {
    await createReceipt({ status: "SUCCESS", nextRetryAt: new Date(Date.now() - MINUTE) });

    expect((await drain({ issuers: alwaysFails })).claimed).toBe(0);
  });

  it("takes the oldest due receipt first", async () => {
    const older = await createReceipt({ nextRetryAt: new Date(Date.now() - 60 * MINUTE) });
    const newer = await createReceipt({ nextRetryAt: new Date(Date.now() - MINUTE) });

    await drain({ issuers: alwaysFails, batchSize: 1 });

    expect(issued).toEqual([older.invoiceId]);
    expect(issued).not.toContain(newer.invoiceId);
  });
});

describe("two drains at once", () => {
  it("never hands the same receipt to both", async () => {
    const created = await Promise.all(
      Array.from({ length: 12 }, () =>
        createReceipt({ nextRetryAt: new Date(Date.now() - MINUTE) }),
      ),
    );

    const [a, b] = await Promise.all([
      drain({ issuers: alwaysFails, batchSize: 6 }),
      drain({ issuers: alwaysFails, batchSize: 6 }),
    ]);

    const worked = [...a.receipts, ...b.receipts].map((r) => r.receiptId);
    // Every claim is exclusive: no id appears twice across the two passes, and
    // no receipt was submitted twice.
    expect(new Set(worked).size).toBe(worked.length);
    expect(new Set(issued).size).toBe(issued.length);
    expect(worked.length).toBe(a.claimed + b.claimed);
    expect(worked.length).toBeLessThanOrEqual(created.length);
  });

  it("hides a receipt from a second drain for as long as the first is working it", async () => {
    const { receipt } = await createReceipt({ nextRetryAt: new Date(Date.now() - MINUTE) });

    let releaseAttempt: () => void = () => {};
    const attemptHeld = new Promise<void>((resolve) => {
      releaseAttempt = resolve;
    });
    let insideAttempt: () => void = () => {};
    const attemptStarted = new Promise<void>((resolve) => {
      insideAttempt = resolve;
    });

    const first = drain({
      issuers: issuerReturning(async () => {
        insideAttempt();
        await attemptHeld;
        return { status: "FAILED", error: "FDMS unreachable" };
      }),
    });

    // The claim is committed before the connector is touched, so a second
    // worker arriving mid-attempt must see nothing to do — this is the case a
    // select-then-update would get wrong and duplicate the submission.
    await attemptStarted;
    const second = await drain({ issuers: alwaysFails });
    expect(second.claimed).toBe(0);

    releaseAttempt();
    const firstResult = await first;

    expect(firstResult.claimed).toBe(1);
    // One submission, not two — which is the whole point of the lease.
    expect(issued).toHaveLength(1);
    expect(firstResult.receipts[0]).toMatchObject({
      receiptId: receipt.id,
      outcome: "RETRY_SCHEDULED",
    });
  });
});

describe("a failing receipt", () => {
  it("is rescheduled with a growing backoff and the reason on the row", async () => {
    const { receipt } = await createReceipt({ nextRetryAt: new Date(Date.now() - MINUTE) });

    const result = await drain({ issuers: alwaysFails });

    expect(result.retryScheduled).toBe(1);
    const after = await prisma.fiscalReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(after.status).toBe("FAILED");
    expect(after.attemptCount).toBe(1);
    expect(after.lastError).toBe("FDMS unreachable");
    expect(after.nextRetryAt).toBeInstanceOf(Date);
    expect(after.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("still advances its attempt count when the issuer refuses without touching the row", async () => {
    // A refusal — unmapped tax code, missing provider config — never increments
    // `attemptCount` itself. If the drain waited for the issuer to do it, this
    // row would be retried every five minutes until somebody noticed.
    const { receipt } = await createReceipt({
      nextRetryAt: new Date(Date.now() - MINUTE),
      attemptCount: 3,
    });

    await drain({ issuers: alwaysFails });

    const after = await prisma.fiscalReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(after.attemptCount).toBe(4);
    // Backoff is taken from the new attempt count, not from zero.
    expect(after.nextRetryAt!.getTime()).toBeGreaterThan(Date.now() + fiscalRetryDelayMs(4) - MINUTE);
  });
});

describe("a receipt past its attempt budget", () => {
  it("is left FAILED with the reason and stops being retried", async () => {
    const { receipt } = await createReceipt({
      nextRetryAt: new Date(Date.now() - MINUTE),
      attemptCount: 2,
    });

    const gaveUp = await drain({ issuers: alwaysFails, maxAttempts: 3 });

    expect(gaveUp.gaveUp).toBe(1);
    const after = await prisma.fiscalReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(after.status).toBe("FAILED");
    expect(after.attemptCount).toBe(3);
    expect(after.nextRetryAt).toBeNull();
    expect(after.lastError).toMatch(/Gave up after 3 attempts: FDMS unreachable/);

    // The point of giving up: the next pass does not touch it, and nothing is
    // submitted for it again.
    issued = [];
    const next = await drain({ issuers: alwaysFails, maxAttempts: 3 });
    expect(next.claimed).toBe(0);
    expect(issued).toEqual([]);

    // But it is not deleted or hidden — a human can still replay it from the
    // console once whatever it was complaining about is fixed.
    expect(await prisma.fiscalReceipt.count({ where: { companyId } })).toBe(1);
  });

  it("is claimed again when the budget is raised", async () => {
    await createReceipt({ nextRetryAt: new Date(Date.now() - MINUTE), attemptCount: 3 });

    expect((await drain({ issuers: alwaysFails, maxAttempts: 3 })).claimed).toBe(0);
    expect((await drain({ issuers: alwaysFails, maxAttempts: 8 })).claimed).toBe(1);
  });
});

describe("a source with no issuer yet", () => {
  it("is deferred rather than failed, and costs no attempts", async () => {
    // FD-4.1 (credit note) and FD-5.1 (till sale) will supply these issuers.
    const sale = await prisma.retailSale.create({
      data: {
        companyId,
        saleNo: `FD6-${suite}-${crypto.randomUUID().slice(0, 8)}`,
        siteId: `site-${suite}`,
        currency: "USD",
      },
    });
    const receipt = await prisma.fiscalReceipt.create({
      data: {
        companyId,
        retailSaleId: sale.id,
        status: "PENDING",
        nextRetryAt: new Date(Date.now() - MINUTE),
        providerKey: `zimra-${suite}`,
      },
    });

    const result = await drain({ issuers: alwaysFails });

    expect(result.deferred).toBe(1);
    expect(result.retryScheduled).toBe(0);
    const after = await prisma.fiscalReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
    // Nothing was attempted, so nothing was spent — but it is not due again
    // immediately either, or the queue would spin on it.
    expect(after.attemptCount).toBe(0);
    expect(after.status).toBe("PENDING");
    expect(after.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());

    await prisma.fiscalReceipt.delete({ where: { id: receipt.id } });
    await prisma.retailSale.delete({ where: { id: sale.id } });
  });
});

describe("sustained failure", () => {
  it("notifies once, not once per pass", async () => {
    await createReceipt({
      nextRetryAt: new Date(Date.now() - MINUTE),
      createdAt: new Date(Date.now() - 120 * MINUTE),
    });

    const first = await drainDueFiscalReceipts({
      companyId,
      issuers: alwaysFails,
      sustainedFailureMs: 30 * MINUTE,
    });
    expect(first.notified).toEqual([companyId]);

    const notifications = await prisma.notification.findMany({ where: { companyId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].entityId).toBe(`fiscal-drain:${companyId}`);
    expect(notifications[0].title).toMatch(/Fiscalisation backlog/);
    expect(notifications[0].severity).toBe("CRITICAL");

    const recipients = await prisma.notificationRecipient.findMany({
      where: { notificationId: notifications[0].id },
    });
    expect(recipients.map((r) => r.userId)).toEqual([managerId]);

    // The worker loops every few seconds; the cooldown is what stops one
    // outage from becoming a hundred notices.
    await prisma.fiscalReceipt.updateMany({
      where: { companyId },
      data: { nextRetryAt: new Date(Date.now() - MINUTE) },
    });
    const second = await drainDueFiscalReceipts({
      companyId,
      issuers: alwaysFails,
      sustainedFailureMs: 30 * MINUTE,
    });
    expect(second.notified).toEqual([]);
    expect(await prisma.notification.count({ where: { companyId } })).toBe(1);
  });

  it("stays quiet for a backlog that has only just appeared", async () => {
    await createReceipt({ nextRetryAt: new Date(Date.now() - MINUTE) });

    const result = await drainDueFiscalReceipts({
      companyId,
      issuers: alwaysFails,
      sustainedFailureMs: 30 * MINUTE,
    });

    expect(result.retryScheduled).toBe(1);
    expect(result.notified).toEqual([]);
    expect(await prisma.notification.count({ where: { companyId } })).toBe(0);
  });

  it("speaks up immediately for a receipt that has exhausted its attempts", async () => {
    // No longer self-healing, however young it is.
    await createReceipt({ nextRetryAt: new Date(Date.now() - MINUTE), attemptCount: 2 });

    const result = await drainDueFiscalReceipts({
      companyId,
      issuers: alwaysFails,
      maxAttempts: 3,
      sustainedFailureMs: 24 * 60 * MINUTE,
    });

    expect(result.gaveUp).toBe(1);
    expect(result.notified).toEqual([companyId]);
  });
});
