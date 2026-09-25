/**
 * The requisition lifecycle, in the cases that cost money when they are wrong.
 *
 * Two things are pinned here. The first is that the three checkpoints stay
 * apart: approval is not payment, payment is not acquittal, and no transition
 * quietly skips one. The second is that a cut approval is honoured everywhere
 * — an approver who writes 250 on a request for 400 has approved 250, and any
 * figure that still says 400 is wrong in a way nobody notices until the float
 * does not balance.
 */
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import {
  REQUISITION_CATEGORIES,
  REQUISITION_STATUSES,
  RequisitionTransitionError,
  assertTransition,
  awaitsDecision,
  canTransition,
  expectsProject,
  isOutstanding,
  outstandingFloat,
  payableAmount,
  type RequisitionStatus,
} from "@/lib/crm/requisitions";

describe("the path money takes", () => {
  it("walks the happy path one checkpoint at a time", () => {
    expect(canTransition("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "DISBURSED")).toBe(true);
    expect(canTransition("DISBURSED", "ACQUITTED")).toBe(true);
  });

  it("will not pay out something nobody approved", () => {
    expect(canTransition("SUBMITTED", "DISBURSED")).toBe(false);
    expect(canTransition("DRAFT", "DISBURSED")).toBe(false);
  });

  it("will not acquit money that never left", () => {
    // Acquitting an approved-but-unpaid requisition would record a spend
    // against cash still sitting in the account.
    expect(canTransition("APPROVED", "ACQUITTED")).toBe(false);
  });

  it("lets an approver cancel up to the moment of payment, and not after", () => {
    expect(canTransition("DRAFT", "CANCELLED")).toBe(true);
    expect(canTransition("SUBMITTED", "CANCELLED")).toBe(true);
    expect(canTransition("APPROVED", "CANCELLED")).toBe(true);
    // Once the cash is out, the way back is an acquittal, not a cancellation.
    expect(canTransition("DISBURSED", "CANCELLED")).toBe(false);
  });

  it("treats rejected, cancelled and acquitted as finished", () => {
    for (const terminal of ["REJECTED", "CANCELLED", "ACQUITTED"] as const) {
      for (const status of REQUISITION_STATUSES) {
        expect(canTransition(terminal, status)).toBe(false);
      }
    }
  });

  it("never allows a status to transition to itself", () => {
    for (const status of REQUISITION_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("covers every status, so a new one cannot be added silently", () => {
    for (const status of REQUISITION_STATUSES) {
      expect(() => canTransition(status, "CANCELLED")).not.toThrow();
    }
  });
});

describe("assertTransition", () => {
  it("says nothing when the move is legal", () => {
    expect(() => assertTransition("SUBMITTED", "APPROVED")).not.toThrow();
  });

  it("names what the requisition can do instead", () => {
    expect(() => assertTransition("SUBMITTED", "DISBURSED")).toThrow(
      RequisitionTransitionError,
    );
    expect(() => assertTransition("SUBMITTED", "DISBURSED")).toThrow(
      /can only go to approved or rejected or cancelled/,
    );
  });

  it("says a finished requisition is finished rather than listing nothing", () => {
    expect(() => assertTransition("ACQUITTED", "DISBURSED")).toThrow(
      /is finished and cannot be changed/,
    );
  });
});

describe("which requests expect a project", () => {
  it("does not ask for one on fuel or airtime", () => {
    // James's words: "requisition can be for fuel or airtime and it cannot be
    // for a specific project".
    expect(expectsProject("FUEL")).toBe(false);
    expect(expectsProject("AIRTIME")).toBe(false);
  });

  it("asks for one on everything that is bought for a job", () => {
    expect(expectsProject("MATERIALS")).toBe(true);
    expect(expectsProject("LABOUR")).toBe(true);
    expect(expectsProject("EQUIPMENT")).toBe(true);
  });

  it("has an answer for every category", () => {
    for (const category of REQUISITION_CATEGORIES) {
      expect(typeof expectsProject(category)).toBe("boolean");
    }
  });
});

describe("payableAmount", () => {
  it("is what was asked for when nobody has cut it", () => {
    expect(
      payableAmount({ amount: new Prisma.Decimal("400.00"), approvedAmount: null }).toString(),
    ).toBe("400");
  });

  it("is the approved figure when an approver cut it", () => {
    expect(
      payableAmount({
        amount: new Prisma.Decimal("400.00"),
        approvedAmount: new Prisma.Decimal("250.00"),
      }).toString(),
    ).toBe("250");
  });

  it("honours an approval of zero rather than falling back to the request", () => {
    // `approvedAmount ?? amount` and `approvedAmount || amount` differ here,
    // and the second one pays out 400 on a request that was approved at nil.
    expect(
      payableAmount({ amount: 400, approvedAmount: new Prisma.Decimal(0) }).toString(),
    ).toBe("0");
  });

  it("keeps the cents", () => {
    expect(
      payableAmount({ amount: new Prisma.Decimal("133.33"), approvedAmount: null }).toString(),
    ).toBe("133.33");
  });
});

describe("outstandingFloat", () => {
  const base = { amount: new Prisma.Decimal("400.00"), approvedAmount: null };

  it("is nothing before the money leaves", () => {
    for (const status of ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"] as const) {
      expect(
        outstandingFloat({ ...base, acquittedAmount: null, status }).toString(),
      ).toBe("0");
    }
  });

  it("is the whole disbursement while nothing has been accounted for", () => {
    expect(
      outstandingFloat({ ...base, acquittedAmount: null, status: "DISBURSED" }).toString(),
    ).toBe("400");
  });

  it("is the change still in the employee's pocket after a partial acquittal", () => {
    expect(
      outstandingFloat({
        ...base,
        acquittedAmount: new Prisma.Decimal("310.50"),
        status: "ACQUITTED",
      }).toString(),
    ).toBe("89.5");
  });

  it("goes negative when the employee spent their own money", () => {
    // Real and worth saying out loud: the company owes them 45.
    expect(
      outstandingFloat({
        ...base,
        acquittedAmount: new Prisma.Decimal("445.00"),
        status: "ACQUITTED",
      }).toString(),
    ).toBe("-45");
  });

  it("settles to nothing when the acquittal matches", () => {
    expect(
      outstandingFloat({
        ...base,
        acquittedAmount: new Prisma.Decimal("400.00"),
        status: "ACQUITTED",
      }).toString(),
    ).toBe("0");
  });

  it("measures against the approved figure, not the requested one", () => {
    // Asked 400, approved 250, spent 250: nothing outstanding. Measuring
    // against 400 would show the employee holding 150 that was never theirs.
    expect(
      outstandingFloat({
        amount: new Prisma.Decimal("400.00"),
        approvedAmount: new Prisma.Decimal("250.00"),
        acquittedAmount: new Prisma.Decimal("250.00"),
        status: "ACQUITTED",
      }).toString(),
    ).toBe("0");
  });
});

describe("the two questions a list view asks", () => {
  it("counts only disbursed money as outstanding", () => {
    const outstanding = REQUISITION_STATUSES.filter((status: RequisitionStatus) =>
      isOutstanding(status),
    );
    expect(outstanding).toEqual(["DISBURSED"]);
  });

  it("counts only submitted requests as awaiting a decision", () => {
    const waiting = REQUISITION_STATUSES.filter((status: RequisitionStatus) =>
      awaitsDecision(status),
    );
    expect(waiting).toEqual(["SUBMITTED"]);
  });
});
