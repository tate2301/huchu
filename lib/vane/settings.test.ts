import { describe, expect, it } from "vitest";

import { monthBounds, quietLabel, settingsPatchSchema, updateVaneSettings, watchablesFor } from "./settings";

describe("Vane's settings", () => {
  it("lists what the workspace runs, with Reports in every one", () => {
    expect(watchablesFor(["crm.deals", "accounting.invoices"]).map((w) => w.name)).toEqual(["Books", "CRM", "Reports"]);
    expect(watchablesFor([]).map((w) => w.name)).toEqual(["Reports"]);
    expect(watchablesFor(["retail.till"]).map((w) => w.name)).toEqual(["Tender", "Reports"]);
  });

  it("counts the month from its first day to the next month's", () => {
    const { start, next } = monthBounds(new Date("2026-10-13T08:00:00Z"));
    expect(start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(next.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("names the quiet hours, and none when they are the same time", () => {
    expect(quietLabel("20:00", "06:00")).toBe("20:00 to 06:00");
    expect(quietLabel("00:00", "00:00")).toBe("None");
  });

  it("refuses an empty change and a time that is not a time", () => {
    expect(settingsPatchSchema.safeParse({}).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ quietFrom: "25:00" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ raiseIssues: false }).success).toBe(true);
  });

  it("merges what it watches, so turning one module off leaves the rest", async () => {
    let written: Record<string, unknown> | null = null;
    const db = {
      vaneSettings: {
        findUnique: async () => ({ watches: { books: true, crm: true }, routing: { books: ["MANAGER"] } }),
        upsert: async ({ update }: { update: Record<string, unknown> }) => {
          written = update;
        },
      },
    } as unknown as Parameters<typeof updateVaneSettings>[0];
    await updateVaneSettings(db, "c", { watches: { crm: false } });
    expect(written).toEqual({ watches: { books: true, crm: false } });
    await updateVaneSettings(db, "c", { routing: { crm: ["SUPERADMIN"] } });
    expect(written).toEqual({ routing: { books: ["MANAGER"], crm: ["SUPERADMIN"] } });
  });
});
