import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";

/**
 * SET-06, W-64: the drawer opened without a sale. With "Open the drawer
 * without a sale" off, a cashier needs a manager's PIN (409 needsApprover,
 * so the till opens its PIN dialog); every opening is one
 * `RETAIL_DRAWER.OPENED` on the till naming who approved it. Against the
 * test database, on a paired till, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST } from "./route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `drawer-key-${stamp}`;
let companyId = "";
let cashierId = "";
let managerId = "";
let registerId = "";

function signIn(role: string, id: string, name: string) {
  validateSessionMock.mockResolvedValue({
    session: {
      user: { id, companyId, role, name, email: `${id}@drawer.test`, enabledFeatures: ["retail.core"] },
    },
  });
}

function open(body: unknown, cookie = `${DEVICE_COOKIE}=${key}`) {
  return POST(
    new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/drawer/open", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const opened = () =>
  prisma.platformAuditEvent.findMany({
    where: { companyId, eventType: "RETAIL_DRAWER.OPENED" },
    orderBy: { createdAt: "asc" },
    select: { actor: true, entityId: true, payloadJson: true },
  });

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Drawer ${stamp}`, slug: `drawer-${stamp}` }, select: { id: true } })).id;
  const owner = await prisma.user.create({
    data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@drawer.test`, password: "x" },
    select: { id: true },
  });
  managerId = (
    await prisma.user.create({
      data: { companyId, name: "Tafara Nyathi", role: "MANAGER", email: `tafara-${stamp}@drawer.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  cashierId = (
    await prisma.user.create({
      data: { companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@drawer.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  await prisma.retailTillPin.create({ data: { companyId, userId: managerId, pinHash: await bcrypt.hash("2580", 4) } });
  const site = await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" }, select: { id: true } });
  registerId = (
    await prisma.retailRegister.create({
      data: { companyId, siteId: site.id, code: "FRONT", name: "Front till" },
      select: { id: true },
    })
  ).id;
  await prisma.retailDevice.create({
    data: { companyId, registerId, kind: "BROWSER", label: "Windows PC", keyHash: hashDeviceKey(key), pairedById: owner.id },
  });
});

beforeEach(() => signIn("CASHIER", cashierId, "Chipo Dube"));

afterAll(async () => {
  if (!companyId) return;
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.retailTillRules.deleteMany({ where: { companyId } });
  await prisma.retailTillPin.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("opening the drawer without a sale (SET-06, W-64)", () => {
  it("asks a cashier for a manager's PIN while the rule is off, and opens nothing", async () => {
    const response = await open({});
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      needsApprover: true,
      reason: "Opening the drawer without a sale needs a manager PIN.",
    });
    expect(await opened()).toEqual([]);
  });

  it("refuses a wrong PIN, pointing at the PIN", async () => {
    const response = await open({ approver: { userId: managerId, pin: "1111" } });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ needsApprover: true, reason: "That PIN is not right." });
    expect(body.fieldErrors).toHaveProperty("pin");
    expect(await opened()).toEqual([]);
  });

  it("opens with Tafara's PIN, and the audit names her", async () => {
    const response = await open({ approver: { userId: managerId, pin: "2580" } });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ approvedBy: "Tafara Nyathi" });
    const events = await opened();
    expect(events).toHaveLength(1);
    expect(events[0].entityId).toBe(registerId);
    expect(JSON.parse(events[0].payloadJson!)).toMatchObject({
      registerName: "Front till",
      approvedById: managerId,
      approvedByName: "Tafara Nyathi",
    });
  });

  it("opens with no PIN once the rule allows it", async () => {
    await prisma.retailTillRules.upsert({
      where: { companyId },
      update: { drawerOpenWithoutSale: true },
      create: { companyId, drawerOpenWithoutSale: true },
    });
    const response = await open({});
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ approvedBy: null });
    expect(await opened()).toHaveLength(2);
  });

  it("opens only on a paired till, and only for someone who sells", async () => {
    expect((await open({}, "")).status).toBeGreaterThanOrEqual(400);
    signIn("BOOKKEEPER", managerId, "Rudo Moyo");
    expect((await open({})).status).toBe(403);
    expect(await opened()).toHaveLength(2);
  });
});
