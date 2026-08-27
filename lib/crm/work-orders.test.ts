import { describe, expect, it } from "vitest";

import {
  WORK_ORDER_INVOICE_CLAIM_KEY,
  WORK_ORDER_INVOICE_KEY,
  allowedTransitions,
  canTransition,
  checklistEditRefusal,
  clearInvoiceClaim,
  completionBlockers,
  completionPercent,
  isBillingRefusal,
  isClaimHeld,
  isOverdueToStart,
  parseWorkOrderStatuses,
  quoteLinesToWorkItems,
  readInvoiceClaim,
  readInvoiceLink,
  transitionOutcome,
  workOrderCounts,
  workOrderInvoiceBlockers,
  workOrderInvoiceLines,
  writeInvoiceClaim,
  writeInvoiceLink,
} from "./work-orders";

describe("canTransition", () => {
  it("follows the ordinary path", () => {
    expect(canTransition("DRAFT", "SCHEDULED")).toBe(true);
    expect(canTransition("SCHEDULED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
  });

  it("refuses to reopen a finished job", () => {
    // A signature would otherwise stand against work that changed afterwards.
    expect(canTransition("COMPLETED", "IN_PROGRESS")).toBe(false);
    expect(canTransition("COMPLETED", "SCHEDULED")).toBe(false);
    expect(allowedTransitions("COMPLETED")).toEqual([]);
  });

  it("refuses to revive a cancelled job", () => {
    expect(allowedTransitions("CANCELLED")).toEqual([]);
  });

  it("won't send a job straight to done without anyone being on site", () => {
    expect(canTransition("DRAFT", "COMPLETED")).toBe(false);
    expect(canTransition("SCHEDULED", "COMPLETED")).toBe(false);
  });

  it("lets a blocked job get going again", () => {
    expect(canTransition("BLOCKED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("BLOCKED", "SCHEDULED")).toBe(true);
  });

  it("lets a scheduled job go back to draft but not an in-progress one", () => {
    expect(canTransition("SCHEDULED", "DRAFT")).toBe(true);
    expect(canTransition("IN_PROGRESS", "DRAFT")).toBe(false);
  });
});

describe("completionBlockers", () => {
  const done = [{ quantity: 2, completedQuantity: 2 }];

  it("insists on a signature", () => {
    expect(completionBlockers({ items: done })).toContain("Nobody has signed the job off");
    expect(completionBlockers({ items: done, signedByName: "  " })).toContain(
      "Nobody has signed the job off",
    );
  });

  it("names unfinished work", () => {
    const blockers = completionBlockers({
      items: [
        { quantity: 2, completedQuantity: 2 },
        { quantity: 5, completedQuantity: 3 },
      ],
      signedByName: "A. Moyo",
    });
    expect(blockers).toEqual(["1 item is not fully done"]);
  });

  it("pluralises properly", () => {
    const blockers = completionBlockers({
      items: [
        { quantity: 2, completedQuantity: 0 },
        { quantity: 5, completedQuantity: 3 },
      ],
      signedByName: "A. Moyo",
    });
    expect(blockers[0]).toBe("2 items are not fully done");
  });

  it("lets a finished, signed job through", () => {
    expect(completionBlockers({ items: done, signedByName: "A. Moyo" })).toEqual([]);
  });

  it("lets a job with no checklist through once signed", () => {
    expect(completionBlockers({ items: [], signedByName: "A. Moyo" })).toEqual([]);
  });
});

describe("completionPercent", () => {
  it("measures by quantity, not by line count", () => {
    // One tiny line done out of two shouldn't read as half the job.
    expect(
      completionPercent([
        { quantity: 1, completedQuantity: 1 },
        { quantity: 99, completedQuantity: 0 },
      ]),
    ).toBe(1);
  });

  it("is zero for an empty checklist rather than dividing by nothing", () => {
    expect(completionPercent([])).toBe(0);
  });

  it("caps an over-reported line at what was asked for", () => {
    expect(completionPercent([{ quantity: 2, completedQuantity: 10 }])).toBe(100);
  });
});

describe("isOverdueToStart", () => {
  const now = new Date("2026-03-10T14:00:00Z");

  it("flags a scheduled job whose slot has passed", () => {
    expect(isOverdueToStart({ status: "SCHEDULED", scheduledStart: "2026-03-10T09:00:00Z" }, now)).toBe(
      true,
    );
  });

  it("says nothing about a job already under way", () => {
    expect(
      isOverdueToStart({ status: "IN_PROGRESS", scheduledStart: "2026-03-10T09:00:00Z" }, now),
    ).toBe(false);
  });

  it("says nothing about a job with no slot booked", () => {
    expect(isOverdueToStart({ status: "SCHEDULED", scheduledStart: null }, now)).toBe(false);
  });

  it("says nothing about a slot still to come", () => {
    expect(
      isOverdueToStart({ status: "SCHEDULED", scheduledStart: "2026-03-11T09:00:00Z" }, now),
    ).toBe(false);
  });
});

describe("quoteLinesToWorkItems", () => {
  it("leaves off anything with nothing to install", () => {
    // A delivery charge belongs on the invoice, not on a crew's sheet.
    const items = quoteLinesToWorkItems([
      { description: "Panel", quantity: 4 },
      { description: "Delivery", quantity: 0 },
    ]);
    expect(items).toEqual([{ description: "Panel", quantity: 4 }]);
  });
});

describe("transitionOutcome", () => {
  it("treats a repeated action as already done rather than as a refusal", () => {
    // A crew double-tapping Start on a bad signal should get their job back.
    expect(transitionOutcome("IN_PROGRESS", "IN_PROGRESS")).toBe("SAME");
    expect(transitionOutcome("COMPLETED", "COMPLETED")).toBe("SAME");
  });

  it("still refuses a move the machine doesn't allow", () => {
    expect(transitionOutcome("DRAFT", "COMPLETED")).toBe("REFUSED");
    expect(transitionOutcome("COMPLETED", "IN_PROGRESS")).toBe("REFUSED");
  });

  it("allows the ordinary moves", () => {
    expect(transitionOutcome("SCHEDULED", "IN_PROGRESS")).toBe("ALLOWED");
    expect(transitionOutcome("BLOCKED", "SCHEDULED")).toBe("ALLOWED");
  });
});

describe("workOrderCounts", () => {
  const now = new Date("2026-03-10T14:00:00Z");

  it("counts a draft as open, because it is work somebody wrote down", () => {
    const counts = workOrderCounts(
      [
        { status: "DRAFT", scheduledStart: null },
        { status: "COMPLETED", scheduledStart: null },
        { status: "CANCELLED", scheduledStart: null },
      ],
      now,
    );
    expect(counts.open).toBe(1);
    expect(counts.total).toBe(3);
  });

  it("counts an overdue job in both its status and the overdue tally", () => {
    const counts = workOrderCounts(
      [
        { status: "SCHEDULED", scheduledStart: "2026-03-09T09:00:00Z" },
        { status: "SCHEDULED", scheduledStart: "2026-03-11T09:00:00Z" },
      ],
      now,
    );
    expect(counts.scheduled).toBe(2);
    expect(counts.overdue).toBe(1);
  });

  it("is all zeroes for a record with no jobs", () => {
    expect(workOrderCounts([], now)).toMatchObject({ total: 0, open: 0, overdue: 0 });
  });
});

describe("workOrderInvoiceLines", () => {
  const quote = [
    { description: "Panel", unitPrice: 120, taxRate: 15 },
    { description: "Cabling", unitPrice: 40 },
  ];

  it("bills what was done, not what was ordered", () => {
    const { lines } = workOrderInvoiceLines(
      [{ description: "Panel", quantity: 4, completedQuantity: 3 }],
      quote,
    );
    expect(lines).toEqual([{ description: "Panel", quantity: 3, unitPrice: 120, taxRate: 15 }]);
  });

  it("won't bill more than was agreed even when the crew reports more", () => {
    // Extra work needs a quote of its own before it becomes money owed.
    const { lines } = workOrderInvoiceLines(
      [{ description: "Panel", quantity: 4, completedQuantity: 6 }],
      quote,
    );
    expect(lines[0].quantity).toBe(4);
  });

  it("leaves off anything nobody got to", () => {
    const { lines } = workOrderInvoiceLines(
      [
        { description: "Panel", quantity: 4, completedQuantity: 4 },
        { description: "Cabling", quantity: 2, completedQuantity: 0 },
      ],
      quote,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Panel");
  });

  it("defaults a quote line with no tax rate to none", () => {
    const { lines } = workOrderInvoiceLines(
      [{ description: "Cabling", quantity: 2, completedQuantity: 2 }],
      quote,
    );
    expect(lines[0]).toMatchObject({ unitPrice: 40, taxRate: 0 });
  });

  it("matches a description regardless of case and stray spacing", () => {
    const { lines, unpriced } = workOrderInvoiceLines(
      [{ description: "  panel  ", quantity: 1, completedQuantity: 1 }],
      quote,
    );
    expect(unpriced).toEqual([]);
    expect(lines[0].unitPrice).toBe(120);
  });

  it("names work it can't price rather than billing it at nothing", () => {
    // A zero line disappears into the total as a silent discount.
    const { lines, unpriced } = workOrderInvoiceLines(
      [{ description: "Made good the plaster", quantity: 1, completedQuantity: 1 }],
      quote,
    );
    expect(lines).toEqual([]);
    expect(unpriced).toEqual(["Made good the plaster"]);
  });

  it("takes the first price when a quote lists the same thing twice", () => {
    const { lines } = workOrderInvoiceLines(
      [{ description: "Panel", quantity: 1, completedQuantity: 1 }],
      [
        { description: "Panel", unitPrice: 120 },
        { description: "Panel", unitPrice: 95 },
      ],
    );
    expect(lines[0].unitPrice).toBe(120);
  });

  it("prices nothing when there is no quote behind the job", () => {
    const { lines, unpriced } = workOrderInvoiceLines([
      { description: "Panel", quantity: 1, completedQuantity: 1 },
    ]);
    expect(lines).toEqual([]);
    expect(unpriced).toEqual(["Panel"]);
  });
});

describe("workOrderInvoiceBlockers", () => {
  const done = { status: "COMPLETED" as const, dealId: "deal-1", items: [{ quantity: 1, completedQuantity: 1 }] };

  it("lets a completed job through", () => {
    expect(workOrderInvoiceBlockers(done)).toEqual([]);
  });

  it("refuses a job that isn't finished", () => {
    expect(workOrderInvoiceBlockers({ ...done, status: "IN_PROGRESS" })).toContain(
      "Only a completed job can be invoiced",
    );
  });

  it("refuses a job with nobody to bill", () => {
    expect(workOrderInvoiceBlockers({ ...done, dealId: null })[0]).toMatch(/nothing to bill it against/);
  });

  it("refuses a job where nothing was actually done", () => {
    expect(
      workOrderInvoiceBlockers({ ...done, items: [{ quantity: 3, completedQuantity: 0 }] }),
    ).toContain("Nothing on this job was completed, so there is nothing to bill");
  });

  it("gives every reason at once rather than one at a time", () => {
    expect(workOrderInvoiceBlockers({ status: "DRAFT", dealId: null, items: [] })).toHaveLength(3);
  });
});

describe("the job's invoice link", () => {
  const link = {
    documentId: "doc-1",
    invoiceId: "inv-1",
    invoiceNumber: "INV-0007",
    invoicedAt: "2026-03-10T14:00:00.000Z",
  };

  it("survives a round trip through customFields", () => {
    expect(readInvoiceLink(writeInvoiceLink(null, link))).toEqual(link);
  });

  it("leaves the customer's own fields alone", () => {
    const stored = writeInvoiceLink({ roof_type: "tile" }, link);
    expect(stored.roof_type).toBe("tile");
    expect(stored[WORK_ORDER_INVOICE_KEY]).toEqual(link);
  });

  it("reads nothing out of a job that has never been invoiced", () => {
    expect(readInvoiceLink(null)).toBeNull();
    expect(readInvoiceLink({})).toBeNull();
    expect(readInvoiceLink({ roof_type: "tile" })).toBeNull();
  });

  it("ignores a mangled link rather than trusting half of one", () => {
    expect(readInvoiceLink({ [WORK_ORDER_INVOICE_KEY]: { invoiceId: "inv-1" } })).toBeNull();
    expect(readInvoiceLink({ [WORK_ORDER_INVOICE_KEY]: "INV-0007" })).toBeNull();
  });
});


describe("checklistEditRefusal", () => {
  it("lets a job that nobody is working on be rewritten", () => {
    expect(checklistEditRefusal("DRAFT")).toBeNull();
    expect(checklistEditRefusal("SCHEDULED")).toBeNull();
    // Blocked is the way to correct a list mid-job: stop, fix, book back in.
    expect(checklistEditRefusal("BLOCKED")).toBeNull();
  });

  it("protects a crew's ticks while they are on site", () => {
    expect(checklistEditRefusal("IN_PROGRESS")).toMatch(/on site/i);
  });

  it("treats a closed job's checklist as the record it is", () => {
    expect(checklistEditRefusal("COMPLETED")).toMatch(/signed off/i);
    expect(checklistEditRefusal("CANCELLED")).toMatch(/cancelled/i);
  });
});

describe("parseWorkOrderStatuses", () => {
  it("reads a multi-select back off the query string", () => {
    expect(parseWorkOrderStatuses("BLOCKED,IN_PROGRESS")).toEqual(["BLOCKED", "IN_PROGRESS"]);
  });

  it("is forgiving about spacing and case", () => {
    expect(parseWorkOrderStatuses(" blocked , DRAFT ")).toEqual(["BLOCKED", "DRAFT"]);
  });

  it("drops what it cannot name rather than refusing the whole request", () => {
    // A stale bookmark should narrow to what it can still name, not 400.
    expect(parseWorkOrderStatuses("BLOCKED,PENDING")).toEqual(["BLOCKED"]);
    expect(parseWorkOrderStatuses("")).toEqual([]);
    expect(parseWorkOrderStatuses(null)).toEqual([]);
  });

  it("asks for each status once", () => {
    expect(parseWorkOrderStatuses("DRAFT,draft")).toEqual(["DRAFT"]);
  });
});

describe("the invoice claim", () => {
  const now = new Date("2026-03-10T14:00:00.000Z");
  const claim = { claimedAt: now.toISOString(), userId: "user-1" };

  it("survives a round trip and leaves the customer's fields alone", () => {
    const stored = writeInvoiceClaim({ roof_type: "tile" }, claim);
    expect(stored.roof_type).toBe("tile");
    expect(readInvoiceClaim(stored)).toEqual(claim);
  });

  it("stands while it is fresh and stops standing once it is stale", () => {
    expect(isClaimHeld(claim, new Date(now.getTime() + 30_000))).toBe(true);
    // A process that died mid-bill must not make a job unbillable forever.
    expect(isClaimHeld(claim, new Date(now.getTime() + 5 * 60_000))).toBe(false);
  });

  it("counts a job with no claim, and a mangled one, as unclaimed", () => {
    expect(isClaimHeld(readInvoiceClaim(null), now)).toBe(false);
    expect(readInvoiceClaim({ [WORK_ORDER_INVOICE_CLAIM_KEY]: { userId: "u" } })).toBeNull();
    expect(isClaimHeld({ claimedAt: "not a date", userId: null }, now)).toBe(false);
  });

  it("is lifted by the link it was holding the job for", () => {
    const stored = writeInvoiceLink(writeInvoiceClaim(null, claim), {
      documentId: "doc-1",
      invoiceId: "inv-1",
      invoiceNumber: "INV-0007",
      invoicedAt: now.toISOString(),
    });
    expect(readInvoiceClaim(stored)).toBeNull();
    expect(readInvoiceLink(stored)).not.toBeNull();
  });

  it("is lifted on its own when nothing was billed after all", () => {
    const stored = clearInvoiceClaim(writeInvoiceClaim({ roof_type: "tile" }, claim));
    expect(readInvoiceClaim(stored)).toBeNull();
    expect(stored.roof_type).toBe("tile");
  });
});

describe("isBillingRefusal", () => {
  it("recognises what the bridge says on purpose", () => {
    expect(isBillingRefusal("This deal has no company; attach one before quoting or invoicing")).toBe(true);
    expect(isBillingRefusal("Invoice needs at least one line")).toBe(true);
  });

  it("does not forward raw database text to a browser", () => {
    expect(
      isBillingRefusal('Invalid `prisma.salesInvoice.create()` invocation: Unique constraint failed'),
    ).toBe(false);
    expect(isBillingRefusal(undefined)).toBe(false);
    expect(isBillingRefusal("")).toBe(false);
  });
});
