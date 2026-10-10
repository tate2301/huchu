/**
 * Reports › Every template and the areas (INS-07) through the real list
 * handler and a real database: who sees which template, the tab counts (which
 * ignore search and filters but keep to the area), Made by and Last opened,
 * the areas in the panel's order, the panel's badges, and the refusal for
 * roles Reports is not offered to (C-35). Only the session is mocked.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import type { UserRole } from "@prisma/client";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";
import { listTemplates } from "@/lib/reports/templates";
import { computeNavBadges } from "@/lib/retail/nav-badges";
import { REPORTS_NAV_BADGES } from "@/lib/retail/nav-badges/reports";
import { DEFAULT_TIME_ZONE, formatTime } from "@/lib/workspace/format";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { GET } = await import("@/app/api/v2/reports/[key]/route");

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SOURCE = "retail-report-templates";
let companyId: string;
const people: Record<string, string> = {};
const templates: Record<string, string> = {};

const NAMES: Record<string, [UserRole, string]> = {
  owner: ["SUPERADMIN", "Tendai Mhlanga"],
  tafara: ["MANAGER", "Tafara Nyathi"],
  rufaro: ["MANAGER", "Rufaro Ndlovu"],
  bookkeeper: ["FINANCE_OFFICER", "Ruvimbo Chari"],
  cashier: ["CASHIER", "Chipo Dube"],
  clerk: ["STOCK_CLERK", "Tendai Sibanda"],
};

function signIn(who: string) {
  const [role, name] = NAMES[who]!;
  validateSessionMock.mockResolvedValue({
    session: { user: { id: people[who]!, companyId, role, name, email: `${who}@catalogue.test`, enabledFeatures: ["retail.core", "retail.reports"] } },
  });
}

type Page = {
  status: number;
  body: {
    error?: string;
    total: number;
    rows: Array<Record<string, unknown>>;
    tabs: Record<string, number>;
    groups: Array<{ label: string; count: number }> | null;
    report: { list: { filters: Array<{ key: string; options?: Array<{ value: string; label: string }> }> } };
  };
};

async function list(query = ""): Promise<Page> {
  const response = await GET(new NextRequest(`http://shop.test/api/v2/reports/${SOURCE}?page=1&size=50&${query}`), {
    params: Promise.resolve({ key: SOURCE }),
  });
  return { status: response.status, body: await response.json() };
}

const names = (page: Page) => page.body.rows.map((row) => row.name);

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Catalogue ${stamp}`, slug: `catalogue-${stamp}` }, select: { id: true } })).id;
  for (const [who, [role, name]] of Object.entries(NAMES)) {
    people[who] = (
      await prisma.user.create({ data: { email: `${who}-${stamp}@catalogue.test`, name, role, companyId }, select: { id: true } })
    ).id;
  }
  const saved = async (key: string, name: string, maker: string, audience: "JUST_ME" | "MANAGERS" | "EVERYONE", reportKey: string, description: string | null) => {
    templates[key] = (
      await prisma.reportTemplate.create({
        data: {
          companyId,
          reportKey,
          name,
          description,
          audience,
          createdById: people[maker]!,
          view: { columns: [], conditions: [], search: "", sort: [], groupBy: null, totals: {} },
        },
        select: { id: true },
      })
    ).id;
  };
  await saved("voids", "Voids and refunds by cashier", "tafara", "JUST_ME", "retail-shifts", "Who voided or refunded what, this month");
  await saved("weekendStock", "Stock for the weekend", "owner", "MANAGERS", "retail-stock-on-hand", null);
  await saved("moves", "Movements everyone reads", "rufaro", "EVERYONE", "retail-stock-movements", "Every move, for everyone");
  await saved("tills", "Tills, as a template", "tafara", "EVERYONE", "retail-tills", "Not a report source");
  await saved("ownerMoney", "My takings", "owner", "JUST_ME", "retail-payments", "Mine");
  await prisma.reportTemplateUse.create({
    data: { companyId, templateRef: "builtin:stock-on-hand", opens: 4, lastOpenedAt: new Date(), lastOpenedById: people.owner! },
  });
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
});

describe("Every template, as each person sees it", () => {
  it("lists Tafara's built-ins, the team's shared ones and her own, by area then name, grouped by area", async () => {
    signIn("tafara");
    const page = await list();
    expect(page.status).toBe(200);
    expect(page.body.tabs).toEqual({ all: 9, "built-in": 6, team: 3, mine: 1 });
    expect(page.body.total).toBe(9);
    expect(page.body.groups?.map((group) => [group.label, group.count])).toEqual([
      ["Selling", 1],
      ["Stock", 5],
      ["Money", 1],
      ["The floor", 2],
    ]);
    expect(names(page)).toEqual([
      "Items sold",
      "Count differences",
      "Movements everyone reads",
      "Stock for the weekend",
      "Stock movements",
      "Stock on hand",
      "Takings by payment",
      "Till shifts",
      "Voids and refunds by cashier",
    ]);
    const byName = Object.fromEntries(page.body.rows.map((row) => [row.name, row]));
    expect(byName["Items sold"]).toMatchObject({ madeBy: "Built in", madeByTone: "faint", seenBy: "Everyone", area: "Selling", lastOpened: null });
    expect(byName["Stock for the weekend"]).toMatchObject({
      madeBy: "Tendai Mhlanga",
      seenBy: "Managers",
      summary: "On Stock on hand",
      href: `/retail/reports/${templates.weekendStock}`,
    });
    expect(byName["Voids and refunds by cashier"]).toMatchObject({ madeBy: "You", seenBy: "Just you", canChange: true });
    expect(byName["Stock on hand"]!.lastOpened).toBe(`Today, ${formatTime(new Date(String(byName["Stock on hand"]!.lastOpenedAt)), DEFAULT_TIME_ZONE)}`);
    expect(names(page)).not.toContain("Tills, as a template");
    expect(names(page)).not.toContain("My takings");
  });

  it("offers Made by as Built in, You, then each other maker", async () => {
    signIn("tafara");
    const page = await list();
    const madeBy = page.body.report.list.filters.find((filter) => filter.key === "madeBy");
    expect(madeBy?.options?.map((option) => option.label)).toEqual(["Built in", "You", "Rufaro Ndlovu", "Tendai Mhlanga"]);
    const rufaros = await list(`madeBy=${people.rufaro}&group=none`);
    expect(names(rufaros)).toEqual(["Movements everyone reads"]);
    // The tabs ignore the filter.
    expect(rufaros.body.tabs.all).toBe(9);
  });

  it("gives the owner 9 without Tafara's own, and lets him change the shared ones he made", async () => {
    signIn("owner");
    const page = await list("group=none");
    expect(page.body.tabs).toEqual({ all: 9, "built-in": 6, team: 3, mine: 2 });
    expect(names(page)).not.toContain("Voids and refunds by cashier");
    expect(names(page)).toContain("My takings");
    const moves = page.body.rows.find((row) => row.name === "Movements everyone reads");
    expect(moves).toMatchObject({ madeBy: "Rufaro Ndlovu", canChange: true });
  });

  it("gives the bookkeeper the built-ins and the shared templates: 8", async () => {
    signIn("bookkeeper");
    const page = await list();
    expect(page.body.tabs).toEqual({ all: 8, "built-in": 6, team: 2, mine: 0 });
    expect(names(page)).not.toContain("Voids and refunds by cashier");
  });

  it("narrows to an area, counting the tabs inside it, and searches name and summary", async () => {
    signIn("tafara");
    const stock = await list("area=stock&sort=name&group=none");
    expect(stock.body.tabs).toEqual({ all: 5, "built-in": 3, team: 2, mine: 0 });
    expect(names(stock)).toEqual(["Count differences", "Movements everyone reads", "Stock for the weekend", "Stock movements", "Stock on hand"]);
    const searched = await list("area=stock&q=everyone&group=none");
    expect(names(searched)).toEqual(["Movements everyone reads"]);
    expect(searched.body.tabs.all).toBe(5);
    const seen = await list("seenBy=just-you&group=none");
    expect(names(seen)).toEqual(["Voids and refunds by cashier"]);
  });

  it("counts the panel's badges: every template and each area with any", async () => {
    const badges = await computeNavBadges({ companyId, userId: people.tafara!, role: "MANAGER" }, REPORTS_NAV_BADGES);
    expect(badges).toEqual({
      "/retail/reports": "9",
      "/retail/reports?area=selling": "1",
      "/retail/reports?area=stock": "5",
      "/retail/reports?area=money": "1",
      "/retail/reports?area=floor": "2",
    });
  });

  it.each(["cashier", "clerk"])("refuses the %s: Reports is not theirs", async (who) => {
    signIn(who);
    const page = await list();
    expect(page.status).toBe(403);
    expect(page.body.error).toBe("Your role cannot view reports");
  });

  it("drops every template on a source the workspace switched off", async () => {
    await prisma.reportSetting.create({ data: { companyId, reportKey: "retail-payments", enabled: false } });
    try {
      signIn("owner");
      const page = await list("group=none");
      expect(names(page)).not.toContain("Takings by payment");
      expect(names(page)).not.toContain("My takings");
      expect(page.body.tabs.all).toBe(7);
    } finally {
      await prisma.reportSetting.deleteMany({ where: { companyId } });
    }
  });

  it("keeps Reports' templates out of the generic catalogue", async () => {
    const session = {
      user: { id: people.tafara!, companyId, role: "MANAGER", name: "Tafara Nyathi", enabledFeatures: ["retail.core", "retail.reports"] },
    } as unknown as AuthenticatedSession;
    const generic = (await listTemplates(session)).map((template) => template.name);
    for (const name of ["Voids and refunds by cashier", "Stock for the weekend", "Movements everyone reads"]) {
      expect(generic).not.toContain(name);
    }
  });
});
