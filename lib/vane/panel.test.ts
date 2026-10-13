import { describe, expect, it } from "vitest";

import { giveVaneJob, moduleName, vanePanel } from "./panel";
import { audienceFilter } from "./status";

function fakeDb(items: Array<Record<string, unknown>>) {
  const empty = async () => null;
  return {
    vaneItem: { count: async () => items.length, findMany: async () => items },
    vaneJob: { findFirst: empty, findMany: async () => [], count: async () => 0 },
    vanePlan: { findMany: async () => [], count: async () => 0 },
    vaneSettings: { findUnique: async () => ({ paused: false, updatedAt: new Date(), monthlyAllowance: 5000 }) },
  } as unknown as Parameters<typeof vanePanel>[0];
}

const item = (id: string, sourceModule: string, action: unknown, minutesAgo: number) => ({
  id,
  kind: "SUGGESTION",
  sourceModule,
  headline: id,
  body: "Let's do it.",
  action,
  createdAt: new Date(Date.now() - minutesAgo * 60_000),
});

describe("the Vane panel", () => {
  it("names a card's source as the product does", () => {
    expect(moduleName("books")).toBe("Books");
    expect(moduleName("retail")).toBe("Tender");
    expect(moduleName("crm")).toBe("CRM");
  });

  it("puts this module's cards first, newest first within each", async () => {
    const db = fakeDb([
      item("crm-new", "crm", { label: "Open the invoice", target: "/accounting/sales/1" }, 1),
      item("books-new", "books", { label: "Send 3 reminders", type: "send", shortcut: "S", target: "/accounting" }, 2),
      item("books-old", "books", { label: "Match", target: "/accounting/banking" }, 30),
    ]);
    const panel = await vanePanel(db, { companyId: "c", userId: "u", module: "books" });
    expect(panel.items.map((card) => card.id)).toEqual(["books-new", "books-old", "crm-new"]);
    expect(panel.items[0].action).toEqual({ type: "send", label: "Send 3 reminders", shortcut: "S", target: "/accounting" });
  });

  it("drops an action that does not lead to a page in the app", async () => {
    const db = fakeDb([item("bad", "books", { label: "Pay", target: "https://example.com" }, 1)]);
    const panel = await vanePanel(db, { companyId: "c", userId: "u" });
    expect(panel.items[0].action).toBeNull();
  });

  it("shows a person everyone's cards, their role's and their own", () => {
    expect(audienceFilter("u1", "MANAGER")).toEqual({
      AND: [
        { OR: [{ audienceUserId: null }, { audienceUserId: "u1" }] },
        { OR: [{ audienceRole: null }, { audienceRole: "MANAGER" }] },
      ],
    });
    expect(audienceFilter("u1", null).AND[1]).toEqual({ OR: [{ audienceRole: null }] });
  });

  it("keeps a person's whole request on the job, for Claude to read", async () => {
    const long = `Get the October close ready, so we can close on the 3rd. ${"Check every account. ".repeat(12)}`.trim();
    let written: Record<string, unknown> = {};
    const db = {
      vaneJob: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          written = data;
          return { id: "j1", label: data.label, status: "QUEUED" };
        },
      },
    } as unknown as Parameters<typeof giveVaneJob>[0];
    await giveVaneJob(db, { companyId: "c", userId: "u", text: long });
    expect(long.length).toBeGreaterThan(120);
    expect(written).toMatchObject({ label: long, kind: "person", trigger: "PERSON", requestedById: "u" });
  });
});
