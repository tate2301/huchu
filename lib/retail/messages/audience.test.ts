import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { dropLoyaltyShops } from "@/lib/retail/loyalty/test-fixtures";

import { offerAudience, parseAbout, REMINDER_SOURCES, reminderAudience, type ReminderSource } from "./audience";
import { messageShop, type MessageShop } from "./test-fixtures";

let shop: MessageShop;

beforeAll(async () => {
  shop = await messageShop("Audience");
});

afterAll(async () => {
  delete REMINDER_SOURCES.layby;
  await dropLoyaltyShops([shop.companyId]);
});

const ids = (reach: { reached: Array<{ id: string }> }) => reach.reached.map((row) => row.id).sort();

describe("who an offer reaches", () => {
  it("ticked: the live ones ticked, reaching those who agreed and have a number", async () => {
    const reach = await offerAudience(shop.companyId, "ticked", { ids: [shop.gold, shop.goldNoConsent, shop.goldNoNumber, shop.goldBinned] });
    expect(reach.total).toBe(3);
    expect(ids(reach)).toEqual([shop.gold]);
  });

  it("ticked with nobody ticked reaches nobody", async () => {
    expect(await offerAudience(shop.companyId, "ticked", { ids: [] })).toEqual({ total: 0, reached: [] });
  });

  it("top tier: Gold now, the binned left out", async () => {
    const reach = await offerAudience(shop.companyId, "top-tier");
    expect(reach.total).toBe(3);
    expect(ids(reach)).toEqual([shop.gold]);
    expect(reach.reached[0]).toMatchObject({ name: "Tapiwa Marange", points: 0 });
  });

  it("not seen in 30 days: a last visit over 30 days ago, never-visited and recent left out", async () => {
    const reach = await offerAudience(shop.companyId, "lapsed-30");
    expect(reach.total).toBe(1);
    expect(ids(reach)).toEqual([shop.lapsed]);
  });

  it("everyone who agreed: live and agreed, reaching those with a number, WhatsApp before phone", async () => {
    const reach = await offerAudience(shop.companyId, "all-agreed");
    expect(reach.total).toBe(5);
    expect(ids(reach)).toEqual([shop.gold, shop.lapsed, shop.never, shop.whatsappOnly].sort());
    const simba = await prisma.customer.findUniqueOrThrow({ where: { id: shop.whatsappOnly }, select: { whatsapp: true } });
    expect(reach.reached.find((row) => row.id === shop.whatsappOnly)?.to).toBe(simba.whatsapp);
  });
});

describe("who a reminder reaches", () => {
  it("reads the records' address", () => {
    expect(parseAbout("layby:a,b")).toEqual({ kind: "layby", ids: ["a", "b"] });
    expect(parseAbout("account:x")).toEqual({ kind: "account", ids: ["x"] });
    expect(parseAbout("layby:")).toBeNull();
    expect(parseAbout("offer:a")).toBeNull();
  });

  it("ignores consent but needs a number", async () => {
    const people = await prisma.customer.findMany({
      where: { id: { in: [shop.goldNoConsent, shop.goldNoNumber] } },
      select: { id: true, name: true, phone: true, whatsapp: true },
    });
    const source: ReminderSource = {
      requires: ["retail.laybys", "update"],
      entityType: "RetailLayby",
      load: async () => people.map((customer) => ({ customer, about: `lay-${customer.id}`, values: { owed: "US$10.00" } })),
      placeholders: ["first name", "owed"],
      hint: "{first name} and {owed} fill in for each lay-by.",
      defaultBody: (shopName) => `Hi {first name}, {owed} is left on your lay-by at ${shopName}.`,
      sub: (n, withNumber) => `${n} ticked · ${withNumber} on WhatsApp`,
    };
    REMINDER_SOURCES.layby = source;
    const reach = await reminderAudience(shop.companyId, source, ["x"]);
    expect(reach.total).toBe(2);
    expect(reach.reached.map((row) => row.customer.id)).toEqual([shop.goldNoConsent]);
  });
});
