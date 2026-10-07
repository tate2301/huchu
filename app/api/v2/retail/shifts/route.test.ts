import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * The back office's shift routes (FLR-03), as a browser calls them: Open a
 * shift (`POST /shifts`), its defaults (`GET /shifts/new`), who can approve
 * (`GET /approvers`) and Cash in or out (`POST /shifts/[id]/cash-movements`),
 * each refusing the roles and the input the packet names. Against the test
 * database, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST as openPost } from "./route";
import { GET as defaultsGet } from "./new/route";
import { GET as approversGet } from "../approvers/route";
import { POST as movePost } from "./[id]/cash-movements/route";

let shop: TestShop;
let back: string;
const people: Record<string, { id: string; name: string; role: string }> = {};

function as(who: string) {
  const person = people[who]!;
  validateSessionMock.mockResolvedValue({
    session: { user: { id: person.id, companyId: shop.companyId, role: person.role, name: person.name, email: `${who}@shifts.test`, enabledFeatures: ["retail.core", "retail.shifts"] } },
  });
}

async function call(handler: (request: NextRequest, context: never) => Promise<Response>, url: string, body?: unknown, context?: unknown) {
  const request = new NextRequest(`http://hurudza.test${url}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const response = await handler(request, context as never);
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  shop = await makeTestShop("Shift routes");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  back = (await prisma.retailRegister.create({ data: { companyId: shop.companyId, siteId: shop.mainId, code: `BACK-${shop.companyId.slice(0, 6)}`, name: "Back till" }, select: { id: true } })).id;
  people.owner = { id: shop.ownerId, name: "Tendai Mhlanga", role: "SUPERADMIN" };
  people.manager = { id: shop.managerId, name: "Tafara Nyathi", role: "MANAGER" };
  for (const [key, name, role] of [
    ["kuda", "Kuda Banda", "CASHIER"],
    ["chipo", "Chipo Dube", "CASHIER"],
    ["clerk", "Tendai Sibanda", "STOCK_CLERK"],
    ["books", "Ruvimbo Chari", "FINANCE_OFFICER"],
  ] as const) {
    const user = await prisma.user.create({ data: { companyId: shop.companyId, name, role, email: `${key}-${shop.companyId}@routes.test` }, select: { id: true } });
    people[key] = { id: user.id, name, role };
  }
  await prisma.retailTillPin.create({ data: { companyId: shop.companyId, userId: shop.managerId, pinHash: await bcrypt.hash("2468", 4) } });
  await prisma.retailTillPin.create({ data: { companyId: shop.companyId, userId: shop.ownerId, pinHash: await bcrypt.hash("1357", 4) } });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.retailTillPin.deleteMany({ where: { companyId } });
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.retailCashMovement.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("Open a shift", () => {
  it("reads the till's defaults, and refuses a stock clerk", async () => {
    as("manager");
    expect(await call(defaultsGet, `/api/v2/retail/shifts/new?registerId=${back}`)).toEqual({
      status: 200,
      body: { data: { float: "", hint: "Counted in.", takesZig: true, zigFloat: "0.00" } },
    });
    as("clerk");
    expect((await call(defaultsGet, `/api/v2/retail/shifts/new?registerId=${back}`)).status).toBe(403);
  });

  it("refuses a cashier opening for someone else, and a float that is not an amount", async () => {
    as("chipo");
    expect(await call(openPost, "/api/v2/retail/shifts", { registerId: back, cashierId: people.kuda!.id, openingFloat: "100.00" })).toMatchObject({
      status: 403,
      body: { error: "Your role cannot open a till shift in shifts and cash" },
    });
    as("manager");
    expect(await call(openPost, "/api/v2/retail/shifts", { registerId: back, cashierId: people.kuda!.id, openingFloat: "abc" })).toMatchObject({
      status: 400,
      body: { fieldErrors: { float: "Give the float as an amount, like 100.00." } },
    });
  });

  it("opens for Kuda Banda, then refuses the busy till", async () => {
    as("manager");
    const opened = await call(openPost, "/api/v2/retail/shifts", { registerId: back, cashierId: people.kuda!.id, openingFloat: "100.00" });
    expect(opened).toMatchObject({ status: 201, body: { data: { registerName: "Back till", cashierName: "Kuda Banda" } } });
    expect(opened.body.data.shiftNo).toMatch(/^SH-\d{5}$/);
    expect(await call(openPost, "/api/v2/retail/shifts", { registerId: back, cashierId: people.chipo!.id, openingFloat: "100.00" })).toMatchObject({
      status: 409,
      body: { error: "Back till already has an open shift." },
    });
  });
});

describe("Cash in or out", () => {
  it("names who can approve, managers first", async () => {
    as("chipo");
    expect(await call(approversGet, "/api/v2/retail/approvers?can=retail.cash-control:approve")).toEqual({
      status: 200,
      body: { data: [{ id: shop.managerId, name: "Tafara Nyathi" }, { id: shop.ownerId, name: "Tendai Mhlanga" }] },
    });
  });

  it("refuses a bookkeeper and a stock clerk at the door, and records the owner's own drop", async () => {
    const shift = await prisma.retailShift.findFirstOrThrow({ where: { companyId: shop.companyId, status: "OPEN" } });
    const context = { params: Promise.resolve({ id: shift.id }) };
    const body = { direction: "OUT", why: "DROP", amount: "20.00", currency: "USD" };
    for (const who of ["books", "clerk"]) {
      as(who);
      expect((await call(movePost, `/api/v2/retail/shifts/${shift.id}/cash-movements`, body, context)).status).toBe(403);
    }
    as("kuda");
    expect(await call(movePost, `/api/v2/retail/shifts/${shift.id}/cash-movements`, body, context)).toMatchObject({ status: 409, body: { needsApprover: true } });
    as("owner");
    expect(await call(movePost, `/api/v2/retail/shifts/${shift.id}/cash-movements`, body, context)).toMatchObject({
      status: 201,
      body: { data: { type: "DROP_TO_SAFE", amount: 20, delta: -20 }, shift: { expectedCash: 80 } },
    });
  });
});
