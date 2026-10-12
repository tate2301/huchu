import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import { readSettings, saveSettings } from "@/lib/retail/settings";
import { SettingsRefused } from "@/lib/retail/settings/types";
import { checkSettingsChanges } from "@/lib/retail/settings-pages";
import { loyaltyPage, topTierName } from "@/lib/retail/settings-pages/loyalty";

import { loadLoyaltySettings } from "./settings";
import { dropLoyaltyShops, loyaltyShop } from "./test-fixtures";

/**
 * Setup › Loyalty through the settings contract (W-48): every field's rule
 * and sentence, the board's values read back, a save with one
 * `RETAIL_SETTINGS.CHANGED`, and a manager refused.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));
const { PATCH, GET } = await import("@/app/api/v2/retail/settings/[page]/route");

const made: string[] = [];
let shop: Awaited<ReturnType<typeof loyaltyShop>>;
beforeAll(async () => {
  shop = await loyaltyShop("Loyalty settings");
  made.push(shop.companyId);
});
afterAll(() => dropLoyaltyShops(made));

const check = (changes: Record<string, unknown>) => checkSettingsChanges(loyaltyPage, changes);
const refusal = (field: string, value: unknown) => {
  const checked = check({ [field]: value });
  return checked.ok ? null : checked.fieldErrors[field];
};
const value = (field: string, input: unknown) => {
  const checked = check({ [field]: input });
  return checked.ok ? checked.values[field] : null;
};

describe("the Loyalty page's rules", () => {
  it("reads Earn as a rate and writes it back in the board's words", () => {
    expect(value("earn", "1 point for each US$1")).toBe("1 point for each US$1");
    expect(value("earn", "2")).toBe("2 points for each US$1");
    expect(value("earn", "1.25 points")).toBe("1.25 points for each US$1");
    for (const wrong of ["lots", "0", "101", "1.555"]) expect(refusal("earn", wrong)).toBe("Write it as “1 point for each US$1”.");
  });

  it("takes what a point is worth from 0.0001 to 1", () => {
    expect(value("worth", "0.02")).toBe("0.02");
    expect(value("worth", "0.0125")).toBe("0.0125");
    for (const wrong of ["0", "1.5", "0.00001", "a"]) expect(refusal("worth", wrong)).toBe("Write what a point is worth, such as 0.01.");
  });

  it("takes Spend from as whole points", () => {
    expect(value("min", "500 points")).toBe("500 points");
    expect(value("min", "1,000")).toBe("1,000 points");
    for (const wrong of ["lots", "12.5", "100001"]) expect(refusal("min", wrong)).toBe("Write it as “500 points”.");
  });

  it("keeps tiers lowest first, named apart, the first from US$0", () => {
    expect(value("tiers", ["Gold, from US$1,500", "Bronze, from US$0", "Silver, from US$500"])).toEqual([
      "Bronze, from US$0",
      "Silver, from US$500",
      "Gold, from US$1,500",
    ]);
    expect(refusal("tiers", ["Bronze, from US$0", "Silver 500"])).toBe("Write each tier as “Silver, from US$500”.");
    expect(refusal("tiers", ["Bronze, from US$10"])).toBe("The first tier starts at US$0.");
    expect(refusal("tiers", ["Bronze, from US$0", "bronze, from US$5"])).toBe("Give each tier its own name.");
    expect(refusal("tiers", [])).toBe("Add a tier, such as “Bronze, from US$0”.");
    expect(refusal("tiers", Array.from({ length: 7 }, (_, n) => `T${n}, from US$${n * 10}`))).toBe("Keep to six tiers.");
    expect(topTierName({ tiers: ["Bronze, from US$0", "Platinum, from US$5,000", "Gold, from US$1,500"] })).toBe("Platinum");
  });

  it("takes the switches and the expiry as they are drawn", () => {
    expect(value("exp", "Never")).toBe("Never");
    expect(refusal("exp", "Sometimes")).toBe("Choose when points expire.");
    expect(refusal("promo", "yes")).toBe("Turn it on or off.");
  });
});

describe("the Loyalty page, saved", () => {
  const owner = () => ({ companyId: shop.companyId, userId: shop.ownerId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" });

  it("reads the board's values before anything is saved", async () => {
    const read = await readSettings(shop.companyId, "loyalty", true);
    expect(read?.values).toMatchObject({
      on: true,
      earn: "1 point for each US$1",
      worth: "0.01",
      min: "500 points",
      exp: "After 12 months",
      tiers: ["Bronze, from US$0", "Silver, from US$500", "Gold, from US$1,500"],
      gold: "1.5 points for each US$1",
      promo: true,
      bday: true,
      alc: true,
      liquor: true,
      last30: { lines: ["Nobody earned points.", "Nobody spent points."] },
    });
  });

  it("saves what a point is worth with one change event", async () => {
    const saved = await saveSettings(owner(), "loyalty", { worth: "0.02" });
    expect(saved).toMatchObject({ ok: true });
    expect((await loadLoyaltySettings(shop.companyId)).pointValue).toBe(0.02);
    const row = await prisma.retailLoyaltySettings.findUniqueOrThrow({ where: { companyId: shop.companyId } });
    expect(row.pointValue.toFixed(4)).toBe("0.0200");
    expect(row.updatedById).toBe(shop.ownerId);
    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId: shop.companyId, eventType: RETAIL_AUDIT_EVENTS.settingsChanged, entityId: "loyalty" },
      select: { payloadJson: true },
    });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!.payloadJson!)).toMatchObject({
      page: "loyalty",
      changes: [{ field: "worth", label: "A point is worth", from: "0.01", to: "0.02" }],
    });
  });

  it("refuses a top tier that earns less than everyone", async () => {
    await expect(saveSettings(owner(), "loyalty", { gold: "0.5 points" })).rejects.toThrow(SettingsRefused);
    await expect(saveSettings(owner(), "loyalty", { gold: "0.5 points" })).rejects.toThrow(
      "The top tier earns at least what everyone earns.",
    );
  });

  it("lets a manager read it and refuses their change", async () => {
    validateSessionMock.mockResolvedValue({
      session: { user: { id: shop.managerId, companyId: shop.companyId, role: "MANAGER", name: "Tafara Nyathi", enabledFeatures: ["retail.core"] } },
    });
    const url = "http://localhost/api/v2/retail/settings/loyalty";
    const params = { params: Promise.resolve({ page: "loyalty" }) };
    const read = await GET(new NextRequest(url), params);
    expect(read.status).toBe(200);
    expect((await read.json()).canEdit).toBe(false);
    const patched = await PATCH(
      new NextRequest(url, { method: "PATCH", body: JSON.stringify({ changes: { worth: "0.05" } }), headers: { "content-type": "application/json" } }),
      params,
    );
    expect(patched.status).toBe(403);
    expect((await patched.json()).error).toBe("Your role cannot change loyalty settings");
  });

  it("is not there for a cashier", async () => {
    validateSessionMock.mockResolvedValue({
      session: { user: { id: shop.managerId, companyId: shop.companyId, role: "CASHIER", name: "Chipo", enabledFeatures: ["retail.core"] } },
    });
    const read = await GET(new NextRequest("http://localhost/api/v2/retail/settings/loyalty"), { params: Promise.resolve({ page: "loyalty" }) });
    expect(read.status).toBe(403);
  });
});
