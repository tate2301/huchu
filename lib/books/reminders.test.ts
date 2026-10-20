import { describe, expect, it, vi } from "vitest";

import { reminderText, sendInvoiceReminders } from "./reminders";

describe("reminderText", () => {
  it("says what is owed and how late, and how to answer", () => {
    expect(reminderText({ number: "INV-0131", currency: "USD", balance: 1240, due: "2026-09-24" }, "2026-10-06")).toBe(
      "Invoice INV-0131 has US$1,240.00 still to pay. It was due on 24 September, 12 days ago. If you have paid it, reply and we will check.",
    );
    expect(reminderText({ number: "INV-0140", currency: "USD", balance: 1750, due: "2026-10-14" }, "2026-10-06")).toContain(
      "It is due on 14 October.",
    );
  });
});

describe("sendInvoiceReminders", () => {
  const invoice = (number: string, over: Record<string, unknown> = {}) => ({
    invoiceNumber: number,
    status: "ISSUED",
    currency: "USD",
    dueDate: new Date("2026-09-24T00:00:00Z"),
    total: 100,
    amountPaid: 0,
    creditTotal: 0,
    writeOffTotal: 0,
    customer: { name: `Customer ${number}`, phone: "0772000000", whatsapp: null },
    ...over,
  });
  const db = (rows: unknown[]) =>
    ({
      salesInvoice: { findMany: vi.fn().mockResolvedValue(rows) },
      companyBranding: { findUnique: vi.fn().mockResolvedValue({ tradingName: "Floorcode", displayName: null }) },
      company: { findUnique: vi.fn().mockResolvedValue({ name: "Floorcode (Pvt) Ltd" }) },
    }) as never;

  it("sends the template with the business and the reminder, and skips what it cannot send", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, id: "m1" });
    const outcome = await sendInvoiceReminders(
      db([invoice("INV-0131"), invoice("INV-0141", { status: "PAID", amountPaid: 100 }), invoice("INV-0150", { customer: { name: "Mrs Gumbo", phone: null, whatsapp: null } })]),
      { companyId: "c", invoiceIds: ["a", "b", "c"], now: new Date("2026-10-06T08:00:00Z"), send },
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toMatchObject({ name: "invoice-reminder", params: ["Floorcode", expect.stringContaining("INV-0131")] });
    expect(outcome).toEqual({
      sent: ["INV-0131"],
      skipped: [
        { invoice: "INV-0141", why: "nothing is owed on it" },
        { invoice: "INV-0150", why: "Mrs Gumbo has no phone number" },
      ],
    });
  });

  it("stops at the first refusal when WhatsApp is not set up", async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, error: "WhatsApp is not set up", retry: true });
    const outcome = await sendInvoiceReminders(db([invoice("INV-1"), invoice("INV-2")]), { companyId: "c", invoiceIds: [], send });
    expect(send).toHaveBeenCalledTimes(1);
    expect(outcome.skipped.map((row) => row.invoice)).toEqual(["INV-1", "INV-2"]);
  });
});
