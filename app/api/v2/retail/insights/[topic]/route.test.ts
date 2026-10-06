import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import type { Insight } from "@/lib/retail/insights";

/**
 * An insight for days the owner chose (INS-01a): `from`/`to` win over the
 * period, bad ranges are refused with words, and the figures are the same
 * rule read over those Harare days. Against the test database, with only the
 * sign-in and the clock faked: Tuesday 6 October 2026, 10:00 in Harare.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { GET } from "./route";

const NOW = new Date("2026-10-06T08:00:00Z");
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId = "";
let siteId = "";
const people: Record<string, { id: string; name: string; role: string }> = {};

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Insights ${stamp}`, slug: `insights-${stamp}` }, select: { id: true } })).id;
  siteId = (await prisma.site.create({ data: { companyId, name: "Borrowdale", code: `BDL-${stamp}` }, select: { id: true } })).id;
  for (const [key, name, role] of [
    ["owner", "Rudo Moyo", "SUPERADMIN"],
    ["cashier", "Chipo Dube", "CASHIER"],
  ] as const) {
    const user = await prisma.user.create({
      data: { companyId, name, role, email: `${key}-${stamp}@insights.test`, password: "x" },
      select: { id: true },
    });
    people[key] = { id: user.id, name, role };
  }
  // Harare is UTC+2: 1 October starts at 30 September 22:00 UTC.
  const sales: Array<[string, "SALE" | "REFUND" | "VOID", number, "POSTED" | "VOIDED"]> = [
    ["2026-09-30T21:59:59Z", "SALE", 999, "POSTED"], // 30 September 23:59:59, before
    ["2026-09-30T22:00:00Z", "SALE", 100, "POSTED"], // 1 October 00:00, the first instant
    ["2026-10-02T09:15:00Z", "SALE", 40.5, "POSTED"],
    ["2026-10-02T10:00:00Z", "REFUND", -12.25, "POSTED"],
    ["2026-10-02T11:00:00Z", "SALE", 300, "VOIDED"], // not posted
    ["2026-10-03T21:59:00Z", "SALE", 50, "POSTED"], // 3 October 23:59
    ["2026-10-03T22:00:00Z", "SALE", 777, "POSTED"], // 4 October 00:00, after
    ["2026-09-28T08:00:00Z", "SALE", 60, "POSTED"], // the 3 days before
  ];
  let seq = 0;
  for (const [postedAt, saleType, total, status] of sales) {
    seq += 1;
    await prisma.retailSale.create({
      data: {
        companyId,
        siteId,
        saleNo: `INS-${stamp}-${seq}`,
        currency: "USD",
        saleType,
        status,
        totalAmount: total,
        postedAt: new Date(postedAt),
        createdAt: new Date(postedAt),
      },
    });
  }
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function get(as: "owner" | "cashier", search: string, topic = "sales") {
  const person = people[as]!;
  validateSessionMock.mockResolvedValue({
    session: { user: { id: person.id, companyId, role: person.role, name: person.name, enabledFeatures: ["retail.core"] } },
  });
  const response = await GET(new NextRequest(`http://shop.test/api/v2/retail/insights/${topic}?${search}`), {
    params: Promise.resolve({ topic }),
  });
  return { status: response.status, body: await response.json() };
}

const takings = (insight: Insight) => insight.kpis.find((kpi) => kpi.label === "Takings")!;

describe("GET /api/v2/retail/insights/[topic] with days chosen", () => {
  it("refuses one end without the other", async () => {
    const res = await get("owner", "from=2026-10-01");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("That period could not be read");
    expect((await get("owner", "to=2026-10-01")).body.error).toBe("That period could not be read");
  });

  it("refuses a first day after the last, and a day that does not exist", async () => {
    const backwards = await get("owner", "from=2026-10-05&to=2026-10-01");
    expect(backwards.status).toBe(400);
    expect(backwards.body.error).toBe("That period could not be read");
    expect((await get("owner", "from=2026-02-30&to=2026-03-02")).body.error).toBe("That period could not be read");
  });

  it("refuses more than a year", async () => {
    const res = await get("owner", "from=2025-09-01&to=2026-10-05");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Choose dates no more than a year apart");
  });

  it("refuses dates after today", async () => {
    const res = await get("owner", "from=2026-10-07&to=2026-10-08");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Choose dates up to today");
  });

  it("refuses a cashier", async () => {
    const res = await get("cashier", "from=2026-10-01&to=2026-10-03");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Your role cannot view insights");
  });

  it("lets the range win over the period and echoes it", async () => {
    const res = await get("owner", "from=2026-10-01&to=2026-10-03&period=7d");
    expect(res.status).toBe(200);
    const insight = res.body.data as Insight;
    expect(insight.period).toBe("range");
    expect(insight.range).toEqual({ from: "2026-10-01", to: "2026-10-03" });
    expect(insight.compareWords).toBe("Compared with the 3 days before");
    expect(insight.unit).toBe("Takings by day and hour, 1 to 3 October, average a day");
  });

  it("takes the same takings as the rule read straight over those Harare days", async () => {
    const res = await get("owner", "from=2026-10-01&to=2026-10-03");
    const from = new Date("2026-09-30T22:00:00Z");
    const to = new Date("2026-10-03T21:59:59.999Z");
    const direct = await prisma.retailSale.aggregate({
      where: { companyId, status: "POSTED", postedAt: { gte: from, lt: to } },
      _sum: { totalAmount: true },
    });
    const figure = takings(res.body.data as Insight);
    expect(figure.value).toBeCloseTo(Number(direct._sum.totalAmount), 2);
    expect(figure.value).toBeCloseTo(100 + 40.5 - 12.25 + 50, 2);
    expect(figure.note).toBe("on the 3 days before");
  });

  it("reads one day as that weekday alone, compared with the day before", async () => {
    const res = await get("owner", "from=2026-10-02&to=2026-10-02");
    const insight = res.body.data as Insight;
    expect(insight.chart.kind === "heat" && insight.chart.rows).toEqual(["Fri"]);
    expect(insight.unit).toBe("Takings by hour, 2 October");
    expect(insight.compareWords).toBe("Compared with the day before");
    expect(takings(insight).value).toBeCloseTo(40.5 - 12.25, 2);
  });

  it("keeps a preset period with no range", async () => {
    const res = await get("owner", "period=7d");
    expect(res.status).toBe(200);
    expect(res.body.data.period).toBe("7d");
    expect(res.body.data.range).toBeNull();
  });

  it("answers every topic for a range", async () => {
    for (const topic of ["profit", "products", "stock", "losses", "customers"]) {
      const res = await get("owner", "from=2026-10-01&to=2026-10-03", topic);
      expect(res.status, topic).toBe(200);
      expect(res.body.data.compareWords, topic).toBe("Compared with the 3 days before");
    }
  });
});
