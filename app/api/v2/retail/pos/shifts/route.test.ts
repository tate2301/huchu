import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";

/**
 * Opening a shift at the till (10-setup W-04 step 8): it opens on this
 * device's till. One drawer, one person: while someone else's shift is open on
 * this till, no other opens on it; and a person's shift open on another till
 * keeps them from opening a second. Against the test database, on a paired
 * till, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST } from "./route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `shifts-key-${stamp}`;
let companyId = "";
let siteId = "";
let chipoId = "";
let rudoId = "";
let frontId = "";
let backId = "";

function signIn(id: string, name: string) {
  validateSessionMock.mockResolvedValue({
    session: { user: { id, companyId, role: "CASHIER", name, email: `${id}@shifts.test`, enabledFeatures: ["retail.core"] } },
  });
}

async function open() {
  const response = await POST(
    new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/shifts", {
      method: "POST",
      headers: { cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
      body: JSON.stringify({ openingFloat: 0 }),
    }),
  );
  return { status: response.status, body: await response.json() };
}

function openShift(cashierId: string, cashierName: string, register: { id: string; code: string; name: string }) {
  return prisma.retailShift.create({
    data: {
      companyId,
      shiftNo: `SH-${cashierName.split(" ")[0]}-${stamp}`,
      registerCode: register.code,
      registerName: register.name,
      registerId: register.id,
      siteId,
      cashierId,
      cashierName,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Shifts ${stamp}`, slug: `shifts-${stamp}` }, select: { id: true } })).id;
  const owner = await prisma.user.create({
    data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@shifts.test`, password: "x" },
    select: { id: true },
  });
  chipoId = (
    await prisma.user.create({
      data: { companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@shifts.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  rudoId = (
    await prisma.user.create({
      data: { companyId, name: "Rudo Moyo", role: "CASHIER", email: `rudo-${stamp}@shifts.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  siteId = (await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" }, select: { id: true } })).id;
  frontId = (
    await prisma.retailRegister.create({ data: { companyId, siteId, code: "FRONT", name: "Front till" }, select: { id: true } })
  ).id;
  backId = (
    await prisma.retailRegister.create({ data: { companyId, siteId, code: "BACK", name: "Back till" }, select: { id: true } })
  ).id;
  await prisma.retailDevice.create({
    data: { companyId, registerId: frontId, kind: "BROWSER", label: "Windows PC", keyHash: hashDeviceKey(key), pairedById: owner.id },
  });
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("opening a shift on this till", () => {
  it("is refused while someone else's shift is open on it, saying whose", async () => {
    const rudos = await openShift(rudoId, "Rudo Moyo", { id: frontId, code: "FRONT", name: "Front till" });
    signIn(chipoId, "Chipo Dube");
    expect(await open()).toMatchObject({
      status: 409,
      body: { error: `Rudo Moyo’s shift SH-Rudo-${stamp} is open on Front till. It closes before another opens.` },
    });
    await prisma.retailShift.update({ where: { id: rudos.id }, data: { status: "CLOSED", closedAt: new Date() } });
  });

  it("is refused while this person's own shift is open on another till", async () => {
    const own = await openShift(chipoId, "Chipo Dube", { id: backId, code: "BACK", name: "Back till" });
    signIn(chipoId, "Chipo Dube");
    const refused = await open();
    expect(refused).toMatchObject({ status: 409, body: { error: "Chipo Dube already has a shift open on the back till." } });
    await prisma.retailShift.update({ where: { id: own.id }, data: { status: "CLOSED", closedAt: new Date() } });
  });

  it("opens on this device's till once it is free", async () => {
    signIn(chipoId, "Chipo Dube");
    const opened = await open();
    expect(opened.status).toBe(201);
    expect(opened.body).toMatchObject({ registerId: frontId, siteId, cashierId: chipoId, status: "OPEN" });
  });
});
