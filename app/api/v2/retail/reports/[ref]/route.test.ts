/**
 * A Reports template's run context and its "opened" count through the real
 * handlers and a real database (INS-07): who may open which template, the
 * sub each one reads, the use row an open writes, and the refusals. Only the
 * session is mocked.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import type { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { periodRange } from "@/lib/reports/list-query";
import { reportPeriodWords } from "@/lib/reports/template-words";
import { DEFAULT_TIME_ZONE } from "@/lib/workspace/format";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { GET } = await import("./route");
const { POST } = await import("./opened/route");

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
const people: Record<string, string> = {};
let shared: string;
let private_: string;

const NAMES: Record<string, [UserRole, string]> = {
  owner: ["SUPERADMIN", "Tendai Mhlanga"],
  tafara: ["MANAGER", "Tafara Nyathi"],
  bookkeeper: ["FINANCE_OFFICER", "Ruvimbo Chari"],
  cashier: ["CASHIER", "Chipo Dube"],
  clerk: ["STOCK_CLERK", "Tendai Sibanda"],
};

function signIn(who: string) {
  const [role, name] = NAMES[who]!;
  validateSessionMock.mockResolvedValue({
    session: { user: { id: people[who]!, companyId, role, name, email: `${who}@run.test`, enabledFeatures: ["retail.core", "retail.reports"] } },
  });
}

async function context(ref: string) {
  const response = await GET(new NextRequest(`http://shop.test/api/v2/retail/reports/${ref}`), { params: Promise.resolve({ ref }) });
  return { status: response.status, body: await response.json() };
}

async function opened(ref: string) {
  const response = await POST(new NextRequest(`http://shop.test/api/v2/retail/reports/${ref}/opened`, { method: "POST" }), {
    params: Promise.resolve({ ref }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

const VIEW = { columns: [], conditions: [], search: "", sort: [], groupBy: null, totals: {} };

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Run ${stamp}`, slug: `run-${stamp}` }, select: { id: true } })).id;
  for (const [who, [role, name]] of Object.entries(NAMES)) {
    people[who] = (await prisma.user.create({ data: { email: `${who}-${stamp}@run.test`, name, role, companyId }, select: { id: true } })).id;
  }
  shared = (
    await prisma.reportTemplate.create({
      data: { companyId, reportKey: "retail-stock-on-hand", name: "Weekend stock", audience: "MANAGERS", createdById: people.owner!, view: VIEW },
      select: { id: true },
    })
  ).id;
  private_ = (
    await prisma.reportTemplate.create({
      data: {
        companyId,
        reportKey: "retail-shifts",
        name: "Voids and refunds by cashier",
        audience: "JUST_ME",
        createdById: people.tafara!,
        view: VIEW,
        params: { opened: "this-month" },
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
});

describe("GET /api/v2/retail/reports/[ref]", () => {
  it("starts a built-in from its own query, under its area", async () => {
    signIn("bookkeeper");
    const { status, body } = await context("till-shifts");
    expect(status).toBe(200);
    expect(body).toMatchObject({
      ref: "till-shifts",
      builtIn: true,
      name: "Till shifts",
      area: { slug: "floor", label: "The floor" },
      source: "retail-shifts",
      audience: "MANAGERS",
      canChange: false,
      canSave: false,
      madeBy: null,
      email: null,
      mySend: null,
    });
    expect(body.sub).toBe(`Built in · ${reportPeriodWords(periodRange("30d", new Date(), DEFAULT_TIME_ZONE))}, every shop`);
    expect(body.query.filters).toEqual({ opened: "30d" });
  });

  it("names a saved template's maker and audience, and who may change it", async () => {
    signIn("tafara");
    const asTafara = await context(shared);
    expect(asTafara.status).toBe(200);
    expect(asTafara.body).toMatchObject({ builtIn: false, name: "Weekend stock", sub: "Tendai Mhlanga’s template · managers see it", canChange: false, canSave: true });
    signIn("owner");
    expect((await context(shared)).body.canChange).toBe(true);

    signIn("tafara");
    const mine = await context(private_);
    expect(mine.body).toMatchObject({ sub: "Tafara Nyathi’s template · only you see it", canChange: true, query: { filters: { opened: "this-month" } } });
  });

  it("answers 404 for someone else's private template and for one that does not exist", async () => {
    signIn("owner");
    expect(await context(private_)).toEqual({ status: 404, body: { error: "Template not found" } });
    expect((await context("no-such-template")).status).toBe(404);
  });

  it.each(["cashier", "clerk"])("refuses the %s", async (who) => {
    signIn(who);
    const answer = await context("stock-on-hand");
    expect(answer.status).toBe(403);
    expect(answer.body.error).toBe("Your role cannot view reports");
  });
});

describe("POST /api/v2/retail/reports/[ref]/opened", () => {
  it("counts a built-in's opens for the whole shop, and says who opened it last", async () => {
    signIn("tafara");
    expect((await opened("stock-on-hand")).status).toBe(204);
    signIn("owner");
    const before = Date.now();
    expect((await opened("stock-on-hand")).status).toBe(204);
    const use = await prisma.reportTemplateUse.findUniqueOrThrow({
      where: { companyId_templateRef: { companyId, templateRef: "builtin:stock-on-hand" } },
    });
    expect(use).toMatchObject({ opens: 2, templateId: null, lastOpenedById: people.owner });
    expect(use.lastOpenedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("keeps a saved template's opens on a row that goes with the template", async () => {
    signIn("tafara");
    expect((await opened(private_)).status).toBe(204);
    const use = await prisma.reportTemplateUse.findUniqueOrThrow({ where: { companyId_templateRef: { companyId, templateRef: private_ } } });
    expect(use).toMatchObject({ opens: 1, templateId: private_, lastOpenedById: people.tafara });
  });

  it("writes nothing for a template the caller may not open, or a role without Reports", async () => {
    signIn("owner");
    expect(await opened(private_)).toEqual({ status: 404, body: { error: "Template not found" } });
    signIn("cashier");
    expect((await opened("stock-on-hand")).status).toBe(403);
    const use = await prisma.reportTemplateUse.findUniqueOrThrow({ where: { companyId_templateRef: { companyId, templateRef: private_ } } });
    expect(use.opens).toBe(1);
    expect((await prisma.reportTemplateUse.findUniqueOrThrow({ where: { companyId_templateRef: { companyId, templateRef: "builtin:stock-on-hand" } } })).opens).toBe(2);
  });
});
