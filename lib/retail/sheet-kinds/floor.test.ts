import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { shownSections, withDerived } from "@/components/sheet-form/model";
import { FLOOR_REPORTS } from "@/lib/reports/definitions/retail/floor";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { shiftKind } from "@/lib/retail/record-kinds/floor";
import type { ShiftRecordView } from "@/lib/retail/shift-record";
import type { SheetCtx, SheetValues } from "@/lib/workspace/sheet-kind";

import { FLOOR_SHEETS } from "./floor";

/**
 * Cash in or out (W-38, CashMove board) as the sheet host drives it: what it
 * refreshes once a movement is recorded, and the Manager PIN line before and
 * after the load says who may approve. And who is offered the X-report.
 */

const cashMove = FLOOR_SHEETS["cash-move"]!;
const tafara: SheetCtx = {
  params: new URLSearchParams(),
  id: "shift-1",
  user: { id: "u-tafara", name: "Tafara Nyathi", role: "MANAGER" },
  can: (() => true) as SheetCtx["can"],
};

describe("after a movement is recorded", () => {
  it("refreshes the shift's Cash in and out tab and its count, not only the list", async () => {
    const tab = shiftKind.tabs!.find((entry) => entry.key === "cash") as { source: string };
    const client = new QueryClient();
    // The key the record's tabs read their rows under (components/record-frame/record-tabs.tsx).
    const key = ["reports", tab.source, "shift-1"];
    client.setQueryData(key, { rows: [] });
    await Promise.all(cashMove.invalidate.map((queryKey) => client.invalidateQueries({ queryKey })));
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});

describe("the Manager PIN line", () => {
  const titles = (values: SheetValues) => shownSections(cashMove, values, tafara).map((section) => section.title ?? null);

  it("says nothing and asks for no manager while the load runs", () => {
    const loading = withDerived(cashMove, { dir: "Out of the drawer", why: "Drop to the safe" });
    expect(loading.manager).toBe("");
    expect(typeof cashMove.sections[0]!.fields.find((field) => field.id === "manager")!.tone === "function" &&
      (cashMove.sections[0]!.fields.find((field) => field.id === "manager")!.tone as (values: SheetValues) => unknown)(loading)).toBeUndefined();
    expect(titles(loading)).toEqual([null]);
  });

  it("reads the approver's own name once the load says they may approve", () => {
    const loaded = withDerived(cashMove, { why: "Drop to the safe", _canApprove: true, _me: "Tafara Nyathi", _approvers: ["Tafara Nyathi"] });
    expect(loaded.manager).toMatch(/^Tafara Nyathi, \d{2}:\d{2}$/);
    expect(titles(loaded)).toEqual([null]);
  });

  it("names who to ask, with the approval section, for a cashier", () => {
    const loaded = withDerived(cashMove, { why: "Drop to the safe", _canApprove: false, _approvers: ["Tafara Nyathi", "Tendai Mhlanga"] });
    expect(loaded.manager).toBe("Needed. Ask Tafara Nyathi or Tendai Mhlanga.");
    expect(titles(loaded)).toEqual([null, "Manager’s approval"]);
  });
});

describe("Print X-report", () => {
  const offered = (requires: ReadonlyArray<readonly [string, string]>, role: string) =>
    requires.some(([resource, action]) => canRetailRoleDo(role, resource as never, action as never));

  it("is a till action: the owner, the manager and a cashier have it, the bookkeeper does not", () => {
    const open = { id: "shift-1", status: "OPEN", can: { move: false, message: false } } as unknown as ShiftRecordView;
    const record = shiftKind.actions!(open).find((action) => action.key === "x-report")!;
    const row = FLOOR_REPORTS.find((report) => report.key === "retail-shifts")!.list!.rowMenu!.find((action) => action.key === "x-report")!;
    for (const requires of [record.requires!, row.requires!]) {
      expect(["SUPERADMIN", "MANAGER", "CASHIER"].map((role) => offered(requires as never, role))).toEqual([true, true, true]);
      expect(offered(requires as never, "FINANCE_OFFICER")).toBe(false);
    }
  });
});
