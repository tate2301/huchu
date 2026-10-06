import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";
import { issuePairingCode } from "@/lib/retail/pairing";

/**
 * The till's own device routes beyond pairing: unpairing from the till
 * itself, and forgetting a key that no longer works. Against the test database, on the shop's POS
 * host, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

vi.stubEnv("PLATFORM_ROOT_DOMAIN", "apps.localtest.me");

const { POST: unpair } = await import("./unpair/route");
const { POST: forget } = await import("./forget/route");

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const slug = `devroutes-${stamp}`;
const key = `routes-key-${stamp}`;
let companyId = "";
let siteId = "";
let registerId = "";
let deviceId = "";
const people: Record<string, string> = {};

function signIn(role: string, id: string) {
  validateSessionMock.mockResolvedValue({
    session: { user: { id, companyId, role, name: role, email: `${id}@routes.test`, enabledFeatures: ["retail.core"] } },
  });
}

const call = (handler: (request: NextRequest) => Promise<Response>, path: string, body?: unknown, cookie: string | null = key) =>
  handler(
    new NextRequest(`http://pos.${slug}.apps.localtest.me/api/v2/retail/devices/${path}`, {
      method: "POST",
      headers: {
        host: `pos.${slug}.apps.localtest.me`,
        ...(cookie ? { cookie: `${DEVICE_COOKIE}=${cookie}` } : {}),
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );

const clearsCookie = (response: Response) => /tender_device=;.*Max-Age=0/i.test(response.headers.get("set-cookie") ?? "");

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Device routes ${stamp}`, slug }, select: { id: true } })).id;
  for (const [name, role] of [
    ["owner", "SUPERADMIN"],
    ["manager", "MANAGER"],
    ["cashier", "CASHIER"],
  ] as const) {
    people[name] = (
      await prisma.user.create({
        data: { companyId, name: `${name} Moyo`, role, email: `${name}-${stamp}@routes.test`, password: await bcrypt.hash(`${name} password`, 4) },
        select: { id: true },
      })
    ).id;
  }
  await prisma.retailTillPin.create({ data: { companyId, userId: people.cashier!, pinHash: await bcrypt.hash("2580", 4) } });
  siteId = (await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" }, select: { id: true } })).id;
  registerId = (
    await prisma.retailRegister.create({ data: { companyId, siteId, code: "FRONT", name: "Front till" }, select: { id: true } })
  ).id;
  deviceId = (
    await prisma.retailDevice.create({
      data: { companyId, registerId, kind: "BROWSER", keyHash: hashDeviceKey(key), pairedById: people.owner! },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailTillPin.deleteMany({ where: { companyId } });
  await prisma.retailPairingCode.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

beforeEach(() => {
  globalThis.__authRateLimitBuckets__ = undefined;
});

describe("unpairing from the till itself (devices/unpair)", () => {
  it("refuses someone the matrix does not give Tills and devices", async () => {
    signIn("CASHIER", people.cashier!);
    expect((await call(unpair, "unpair")).status).toBe(403);
  });

  it("refuses while a shift is open on the till", async () => {
    signIn("MANAGER", people.manager!);
    const shift = await prisma.retailShift.create({
      data: {
        companyId,
        siteId,
        shiftNo: `SH-${stamp}`,
        registerCode: "FRONT",
        registerName: "Front till",
        registerId,
        cashierId: people.cashier!,
        cashierName: "cashier Moyo",
      },
    });
    const refused = await call(unpair, "unpair");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "SHIFT_OPEN" });
    await prisma.retailShift.delete({ where: { id: shift.id } });
  });

  it("unpairs, ends the till's live codes, audits, and clears the cookie", async () => {
    signIn("MANAGER", people.manager!);
    await prisma.$transaction((tx) => issuePairingCode(tx, { companyId, registerId, purpose: "REPLACE", createdById: people.owner! }));

    const answer = await call(unpair, "unpair");
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ data: { till: { id: registerId, name: "Front till" } } });
    expect(clearsCookie(answer)).toBe(true);

    expect(await prisma.retailDevice.findUniqueOrThrow({ where: { id: deviceId } })).toMatchObject({
      unpairedById: people.manager,
      unpairReason: "UNPAIRED",
    });
    expect(await prisma.retailPairingCode.count({ where: { registerId, usedAt: null, expiresAt: { gt: new Date() } } })).toBe(0);
    expect(await prisma.platformAuditEvent.count({ where: { companyId, eventType: "RETAIL_DEVICE.UNPAIRED", entityId: registerId } })).toBe(1);

    expect((await call(unpair, "unpair")).status).toBe(401);
  });
});

describe("forgetting a key that no longer works (devices/forget)", () => {
  it("clears an unpaired device's cookie, and one nobody issued", async () => {
    const unpaired = await call(forget, "forget");
    expect(unpaired.status).toBe(204);
    expect(clearsCookie(unpaired)).toBe(true);
    expect(clearsCookie(await call(forget, "forget", undefined, "nobody-issued-this"))).toBe(true);
  });

  it("keeps a key that is still a till's", async () => {
    const live = `live-key-${stamp}`;
    const till = await prisma.retailRegister.create({ data: { companyId, siteId, code: "BACK", name: "Back till" }, select: { id: true } });
    await prisma.retailDevice.create({ data: { companyId, registerId: till.id, kind: "BROWSER", keyHash: hashDeviceKey(live), pairedById: people.owner! } });
    const kept = await call(forget, "forget", undefined, live);
    expect(kept.status).toBe(409);
    expect(clearsCookie(kept)).toBe(false);
  });
});
