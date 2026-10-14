import { describe, expect, it } from "vitest";

import { datesOnIssue, takeOn, usualTerms, VaneDraftNotTakenOn, waitsForAPerson } from "./drafts";

const d = (day: string) => new Date(`${day}T00:00:00Z`);

describe("Vane's drafts", () => {
  it("wait for a person while Vane made them and nobody has taken them on", () => {
    expect(waitsForAPerson({ madeByVane: true, createdById: null })).toBe(true);
    expect(waitsForAPerson({ madeByVane: true, createdById: "rudo" })).toBe(false);
    expect(waitsForAPerson({ madeByVane: false, createdById: null })).toBe(false);
  });

  it("are refused without asMine, and make the person their maker with it", () => {
    const draft = { madeByVane: true, createdById: null };
    expect(() => takeOn(draft, { userId: "rudo", what: "INV-0143", verb: "issue" })).toThrow(VaneDraftNotTakenOn);
    expect(() => takeOn(draft, { userId: "rudo", what: "INV-0143", verb: "issue" })).toThrow("INV-0143 is Vane’s draft. Check it and confirm it as yours to issue it.");
    expect(takeOn(draft, { asMine: true, userId: "rudo", what: "INV-0143", verb: "issue" })).toEqual({ createdById: "rudo" });
    // A person's own record, or one already taken on, keeps its maker.
    expect(takeOn({ madeByVane: true, createdById: "james" }, { asMine: true, userId: "rudo", what: "x", verb: "issue" })).toEqual({});
    expect(takeOn({ madeByVane: false, createdById: "james" }, { userId: "rudo", what: "x", verb: "issue" })).toEqual({});
  });

  it("are dated the day they are issued, due the same days on", () => {
    expect(datesOnIssue({ invoiceDate: d("2026-10-07"), dueDate: d("2026-10-28") }, new Date("2026-10-14T09:12:00Z"))).toEqual({
      invoiceDate: d("2026-10-14"),
      dueDate: d("2026-11-04"),
    });
    expect(datesOnIssue({ invoiceDate: d("2026-10-07"), dueDate: null }, d("2026-10-14"))).toEqual({ invoiceDate: d("2026-10-14"), dueDate: null });
  });

  it("read a customer's usual terms off their invoices, newest first winning a tie", () => {
    const invoice = (from: string, to: string | null) => ({ invoiceDate: d(from), dueDate: to ? d(to) : null });
    expect(usualTerms([invoice("2026-09-01", "2026-09-22"), invoice("2026-08-01", "2026-08-22"), invoice("2026-07-01", "2026-07-31")])).toBe(21);
    expect(usualTerms([invoice("2026-09-01", "2026-10-01"), invoice("2026-08-01", "2026-08-15")])).toBe(30);
    expect(usualTerms([invoice("2026-09-01", null)])).toBeNull();
  });
});
