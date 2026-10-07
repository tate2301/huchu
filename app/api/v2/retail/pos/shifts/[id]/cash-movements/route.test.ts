import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";

/**
 * A drop at a paired till (FLR-03, acceptance 7): Chipo Dube on her own
 * drawer needs a manager's PIN, and Tafara Nyathi's 2468 typed at the till
 * records it, through the same service as the back office. Against the test
 * database, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST } from "./route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `drop-key-${stamp}`;
let companyId = "";
let chipoId = "";
let tafaraId = "";
let shiftId = "";

async function drop(body: Record<string, unknown>) {
  const response = await POST(
    new NextRequest(`http://pos.test.localtest.me/api/v2/retail/pos/shifts/${shiftId}/cash-movements`, {
      method: "POST",
      headers: { cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
      body: JSON.stringify({ direction: "OUT", why: "DROP", amount: "20.00", currency: "USD", ...body }),
    }),
    { params: Promise.resolve({ id: shiftId }) },
  );
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Drop ${stamp}`, slug: `drop-${stamp}` }, select: { id: true } })).id;
  const user = async (name: string, role: string, email: string) =>
    (await prisma.user.create({ data: { companyId, name, role: role as never, email: `${email}-${stamp}@drop.test`, password: "x" }, select: { id: true } })).id;
  const owner = await user("Tendai Mhlanga", "SUPERADMIN", "owner");
  chipoId = await user("Chipo Dube", "CASHIER", "chipo");
  tafaraId = await user("Tafara Nyathi", "MANAGER", "tafara");
  await prisma.retailTillPin.create({ data: { companyId, userId: tafaraId, pinHash: await bcrypt.hash("2468", 4) } });
  const siteId = (await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" }, select: { id: true } })).id;
  const till = await prisma.retailRegister.create({ data: { companyId, siteId, code: "FRONT", name: "Front till" }, select: { id: true } });
  await prisma.retailDevice.create({
    data: { companyId, registerId: till.id, kind: "COUNTER_MINI", keyHash: hashDeviceKey(key), pairedById: owner },
  });
  shiftId = (
    await prisma.retailShift.create({
      data: {
        companyId,
        shiftNo: "SH-00242",
        registerCode: "FRONT",
        registerName: "Front till",
        registerId: till.id,
        siteId,
        cashierId: chipoId,
        cashierName: "Chipo Dube",
        openingFloat: "200.00",
        expectedCash: "201.50",
      },
      select: { id: true },
    })
  ).id;
  validateSessionMock.mockResolvedValue({
    session: { user: { id: chipoId, companyId, role: "CASHIER", name: "Chipo Dube", email: `chipo-${stamp}@drop.test`, enabledFeatures: ["retail.core", "retail.pos"] } },
  });
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.retailCashMovement.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailTillPin.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  // The drop's journal set the shop's books up on the way: the teardown takes them too.
  await destroyProvisionedTenant(companyId);
});

describe("a drop at the till", () => {
  it("asks for a manager, refuses a wrong PIN, and records with Tafara's", async () => {
    expect(await drop({})).toMatchObject({ status: 409, body: { needsApprover: true, reason: "A manager has to approve this." } });
    expect(await drop({ approver: { userId: tafaraId, pin: "0000" } })).toMatchObject({
      status: 409,
      body: { fieldErrors: { pin: "That PIN is not right." } },
    });
    expect(await drop({ approver: { userId: tafaraId, pin: "2468" } })).toMatchObject({
      status: 201,
      body: { data: { type: "DROP_TO_SAFE", amount: 20, delta: -20 }, shift: { expectedCash: 181.5 } },
    });
    const row = await prisma.retailCashMovement.findFirstOrThrow({ where: { shiftId } });
    expect(row).toMatchObject({ approvedByName: "Tafara Nyathi", recordedByName: "Chipo Dube" });
  });

  it("refuses the old body", async () => {
    expect((await drop({ direction: undefined, why: undefined, type: "DROP_TO_SAFE", reasonCode: "CASH_LEVEL_TOO_HIGH", amount: 20 })).status).toBe(400);
  });
});
