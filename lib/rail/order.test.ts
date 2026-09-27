import { describe, expect, it } from "vitest";

import type { NavRank } from "@/lib/navigation";

import { orderRows } from "./order";

type Row = { label: string; rank?: NavRank };
const label = (row: Row) => row.label;
const rank = (row: Row) => row.rank;

describe("orderRows", () => {
  it("orders by name, ignoring case", () => {
    const rows = [{ label: "tasks" }, { label: "Deals" }, { label: "Appointments" }];
    expect(orderRows(rows, { label }).map(label)).toEqual(["Appointments", "Deals", "tasks"]);
  });

  it("reads pinned, then flow as declared, then own, then the rest A to Z", () => {
    const rows: Row[] = [
      { label: "Team" },
      { label: "Leads", rank: "flow" },
      { label: "My overview", rank: "own" },
      { label: "Companies" },
      { label: "Deals", rank: "flow" },
      { label: "Sites" },
      { label: "People" },
    ];
    const pinned = new Set(["Sites"]);
    expect(
      orderRows(rows, { label, rank, isPinned: (row) => pinned.has(row.label) }).map(label),
    ).toEqual(["Sites", "Leads", "Deals", "My overview", "Companies", "People", "Team"]);
  });

  it("keeps a flow in its declared order rather than the alphabet's", () => {
    const rows: Row[] = ["Quotes", "Invoices", "Receipts", "Collections"].map((l) => ({
      label: l,
      rank: "flow",
    }));
    expect(orderRows(rows, { label, rank }).map(label)).toEqual([
      "Quotes",
      "Invoices",
      "Receipts",
      "Collections",
    ]);
  });

  it("puts pinned rows first, A to Z, whatever their rank", () => {
    const rows: Row[] = [{ label: "Leads", rank: "flow" }, { label: "Tasks" }, { label: "Deals", rank: "flow" }];
    const pinned = new Set(["Tasks", "Deals"]);
    expect(
      orderRows(rows, { label, rank, isPinned: (row) => pinned.has(row.label) }).map(label),
    ).toEqual(["Deals", "Tasks", "Leads"]);
  });

  it("keeps the declared order of the rest when not alphabetical", () => {
    const rows = [{ label: "Overview" }, { label: "Batches" }, { label: "Assays" }];
    const pinned = new Set(["Assays"]);
    expect(
      orderRows(rows, { label, alphabetical: false, isPinned: (row) => pinned.has(row.label) }).map(
        label,
      ),
    ).toEqual(["Assays", "Overview", "Batches"]);
  });

  it("reads numbers as numbers", () => {
    const rows = [{ label: "Phase 10" }, { label: "Phase 2" }];
    expect(orderRows(rows, { label }).map(label)).toEqual(["Phase 2", "Phase 10"]);
  });

  it("leaves the input alone", () => {
    const rows = [{ label: "B" }, { label: "A" }];
    orderRows(rows, { label });
    expect(rows.map(label)).toEqual(["B", "A"]);
  });
});
