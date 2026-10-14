import { describe, expect, it } from "vitest";

import {
  currentStep,
  doneQuerySchema,
  firstLine,
  nextFor,
  parseReadFrom,
  parseTools,
  startOfShopDay,
  tableLabel,
  vaneForYou,
  vaneState,
  watchingFor,
} from "./pages";

const NOW = new Date("2026-10-14T09:30:00Z");

type Rows = {
  settings?: Record<string, unknown> | null;
  used?: number;
  newest?: Record<string, unknown> | null;
  lastFinished?: Record<string, unknown> | null;
  lastDone?: Record<string, unknown> | null;
};

/** A stand-in for the four reads `vaneState` makes, in the order it makes them. */
function stateDb({ settings = null, used = 0, newest = null, lastFinished = null, lastDone = null }: Rows) {
  return {
    vaneSettings: { findUnique: async () => settings },
    vaneCardChoice: { findMany: async () => [] },
    vaneJob: {
      count: async () => used,
      findFirst: async ({ where, orderBy }: { where: { status?: unknown }; orderBy: Record<string, string> }) => {
        if ("createdAt" in orderBy) return newest;
        if (where.status === "DONE") return lastDone;
        return lastFinished;
      },
    },
  } as unknown as Parameters<typeof vaneState>[0];
}

describe("Vane's state", () => {
  it("is nothing to say while it works or watches", async () => {
    expect(await vaneState(stateDb({ settings: { paused: false, monthlyAllowance: 5000, updatedAt: NOW } }), "c", NOW)).toBeNull();
  });

  it("says paused first, with when", async () => {
    const state = await vaneState(stateDb({ settings: { paused: true, monthlyAllowance: 5000, updatedAt: NOW }, used: 9999 }), "c", NOW);
    expect(state).toEqual({ kind: "paused", since: NOW.toISOString() });
  });

  it("says over the allowance when this month's jobs reach it, and when they start again", async () => {
    const state = await vaneState(stateDb({ settings: { paused: false, monthlyAllowance: 5000, updatedAt: NOW }, used: 5000 }), "c", NOW);
    expect(state).toEqual({ kind: "allowance", used: 5000, allowance: 5000, resetsOn: "2026-11-01" });
  });

  it("says it cannot reach the service while the newest job waits, with the last time it worked and the next try", async () => {
    const state = await vaneState(
      stateDb({
        newest: { status: "WAITING", error: "Claude could not be reached.", runAfter: new Date("2026-10-14T09:46:00Z") },
        lastDone: { finishedAt: new Date("2026-10-14T07:12:00Z") },
      }),
      "c",
      NOW,
    );
    expect(state).toEqual({
      kind: "unreachable",
      lastWorkedAt: "2026-10-14T07:12:00.000Z",
      nextTry: "2026-10-14T09:46:00.000Z",
      error: "Claude could not be reached.",
    });
  });

  it("says it could not work it out when the last job it finished failed, with what it tried", async () => {
    const state = await vaneState(
      stateDb({
        newest: { status: "FAILED" },
        lastFinished: {
          id: "j1",
          status: "FAILED",
          label: "Fuel spend in September",
          error: "3 receipts have no amount.",
          tools: [{ name: "run_sql", ms: 40, ok: true }, { name: "run_sql", ms: 12, ok: false }],
          finishedAt: NOW,
        },
      }),
      "c",
      NOW,
    );
    expect(state).toMatchObject({
      kind: "failed",
      label: "Fuel spend in September",
      error: "3 receipts have no amount.",
      tried: [{ name: "run_sql", ok: true }, { name: "run_sql", ok: false }],
    });
  });

  it("says nothing of a failure once a later job finished", async () => {
    const state = await vaneState(stateDb({ lastFinished: { id: "j2", status: "DONE", label: "Look", finishedAt: NOW, tools: [] } }), "c", NOW);
    expect(state).toBeNull();
  });
});

describe("For you", () => {
  const card = (id: string, sourceModule: string) => ({
    id,
    kind: "ISSUE",
    sourceModule,
    headline: id,
    body: "Let's look.",
    action: { type: "open", label: "Open it", target: "/books/invoices" },
    createdAt: NOW,
    sql: id === "a" ? "SELECT 1" : null,
  });
  const db = {
    vaneItem: { count: async () => 3, findMany: async () => [card("a", "books"), card("b", "crm"), card("c", "crm")] },
    vaneJob: { count: async () => 0, findFirst: async () => null, findMany: async () => [] },
    vanePlan: { count: async () => 0, findFirst: async () => null },
    vaneSettings: { findUnique: async () => null },
    vaneCardChoice: { findMany: async () => [] },
  } as unknown as Parameters<typeof vaneForYou>[0];

  it("lists every module's cards, and names the sources by how many came from each", async () => {
    const page = await vaneForYou(db, { companyId: "c", userId: "u" }, NOW);
    expect(page.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(page.sources).toEqual(["CRM", "Books"]);
    expect(page.items[0]).toMatchObject({ module: "books", source: "Books", read: true });
    expect(page.items[1]!.read).toBe(false);
  });

  it("narrows to one module Vane watches", async () => {
    const page = await vaneForYou(db, { companyId: "c", userId: "u", module: "crm" }, NOW);
    expect(page.items.map((item) => item.id)).toEqual(["b", "c"]);
  });
});

describe("the shapes the pages read", () => {
  it("watches what the workspace runs, less what Management → Vane turned off", () => {
    expect(watchingFor(["accounting.core", "crm.core"], { crm: false })).toEqual([
      { key: "books", name: "Books" },
      { key: "reports", name: "Reports" },
    ]);
    expect(watchingFor(undefined, null)).toEqual([{ key: "reports", name: "Reports" }]);
  });

  it("names the tables a card read as people know them, whatever case the reader gave", () => {
    expect(tableLabel("salesinvoice")).toEqual({ label: "Invoices", href: "/books/invoices" });
    expect(tableLabel("CrmFollowUp")).toEqual({ label: "Follow-ups", href: "/crm/follow-ups" });
    expect(tableLabel("GoldPour")).toEqual({ label: "Gold Pour", href: null });
  });

  it("reads what a card kept, and nothing from a shape it does not know", () => {
    expect(parseReadFrom([{ table: "crmtask", rows: 34 }])).toEqual([{ table: "crmtask", rows: 34 }]);
    expect(parseReadFrom("CrmTask")).toEqual([]);
    expect(parseTools([{ name: "run_sql", ms: 3 }, { name: "propose_item", ok: false }])).toEqual([
      { name: "run_sql", ok: true },
      { name: "propose_item", ok: false },
    ]);
  });

  it("finds the step that is next, and whose it is", () => {
    const step = (status: "done" | "now" | "todo", owner: "vane" | "person") => ({ id: status, label: "", owner, status, progress: null });
    expect(currentStep([step("done", "vane"), step("todo", "person")])).toEqual({ position: 2, owner: "person" });
    expect(currentStep([step("done", "vane")])).toBeNull();
  });

  it("says what a person did with what a job raised: kept, then open, then set aside", () => {
    const at = new Date("2026-10-14T08:14:00Z");
    expect(nextFor([{ status: "DONE", resolvedAt: at, resolvedBy: { name: "James Nyabadza" } }, { status: "OPEN", resolvedAt: null, resolvedBy: null }])).toEqual({
      label: "Kept by James, 10:14",
      muted: false,
    });
    expect(nextFor([{ status: "OPEN", resolvedAt: null, resolvedBy: null }, { status: "OPEN", resolvedAt: null, resolvedBy: null }]).label).toBe("2 open");
    expect(nextFor([{ status: "MUTED", resolvedAt: at, resolvedBy: { name: "Rudo" } }]).label).toBe("Set aside by Rudo");
    expect(nextFor([]).label).toBe("Nothing raised");
  });

  it("keeps a job's answer to its first sentence", () => {
    expect(firstLine("Looked over invoices. Raised 4 cards.")).toBe("Looked over invoices.");
    expect(firstLine(null)).toBe("");
  });

  it("starts the shop's day at midnight in Harare", () => {
    expect(startOfShopDay(new Date("2026-10-13T23:30:00Z")).toISOString()).toBe("2026-10-13T22:00:00.000Z");
  });

  it("reads Done's filters, falling back to the last 7 days and everyone", () => {
    expect(doneQuerySchema.parse({ period: "year", who: "them", kind: null })).toEqual({ period: "7d", who: "everyone", kind: null });
    expect(doneQuerySchema.parse({ period: "today", who: "me", kind: "nightly" })).toEqual({ period: "today", who: "me", kind: "nightly" });
  });
});
