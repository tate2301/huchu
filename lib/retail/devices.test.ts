import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  PairRefusal,
  checkTillPinSignIn,
  hashDeviceKey,
  pairDevice,
  requirePosDevice,
  tillPeople,
  unpairedSaleGate,
  type PosDevice,
} from "./devices";
import { DEVICE_COOKIE, UNPAIRED_REVIEW_REASON } from "./device-words";
import { issuePairingCode } from "./pairing";

/** W-04 and W-76 on the device side, against the test database, on a shop with a two-till plan. */

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId = "";
let ownerId = "";
let planId = "";
let siteId = "";
const people: Record<string, string> = {};

const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36";

async function till(name: string) {
  return prisma.retailRegister.create({
    data: { companyId, siteId, code: `T-${Math.random().toString(36).slice(2, 8)}`, name },
    select: { id: true, name: true },
  });
}

async function code(registerId: string, purpose: "PAIR" | "REPLACE" = "PAIR") {
  return prisma.$transaction((tx) => issuePairingCode(tx, { companyId, registerId, purpose, createdById: ownerId }));
}

const pair = (value: string, installId = `install-${stamp}`) =>
  pairDevice({ companyId, code: value, installId, userAgent: WINDOWS, shell: null, appVersion: null });

async function refusal(promise: Promise<unknown>): Promise<PairRefusal> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PairRefusal) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

const request = (key: string | null) =>
  new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/current-shift", {
    headers: key ? { cookie: `${DEVICE_COOKIE}=${key}` } : {},
  });

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Devices ${stamp}`, slug: `devices-${stamp}` }, select: { id: true } })).id;
  ownerId = (
    await prisma.user.create({
      data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@devices.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  planId = (
    await prisma.subscriptionPlan.create({
      data: { code: `TEST-START-${stamp}`, name: "Start", monthlyPrice: 19, maxSites: 1, maxTills: 2 },
      select: { id: true },
    })
  ).id;
  await prisma.companySubscription.create({ data: { companyId, planId, status: "ACTIVE" } });
  siteId = (await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" }, select: { id: true } })).id;
  const pinHash = await bcrypt.hash("2580", 4);
  for (const [key, name, role, pin] of [
    ["chipo", "Chipo Dube", "CASHIER", true],
    ["kuda", "Kuda Banda", "CASHIER", true],
    ["farai", "Farai Moyo", "CASHIER", true],
    ["nopin", "Rudo Moyo", "CASHIER", false],
    ["clerk", "Tendai Sibanda", "STOCK_CLERK", true],
  ] as const) {
    const user = await prisma.user.create({
      data: { companyId, name, role, email: `${key}-${stamp}@devices.test`, password: "x" },
      select: { id: true },
    });
    people[key] = user.id;
    if (pin) await prisma.retailTillPin.create({ data: { companyId, userId: user.id, pinHash } });
  }
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailTillPin.deleteMany({ where: { companyId } });
  await prisma.retailPairingThrottle.deleteMany({ where: { companyId } });
  await prisma.retailPairingCode.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.companySubscription.deleteMany({ where: { companyId } });
  if (planId) await prisma.subscriptionPlan.delete({ where: { id: planId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("pairing a device with a code (W-04 step 6)", () => {
  it("makes a browser device on the till, keeps only the key's hash, and uses the code once", async () => {
    const test = await till("Test till");
    const issued = await code(test.id);
    const paired = await pair(issued.code);

    expect(paired.till).toEqual({ id: test.id, name: "Test till" });
    expect(paired.site).toEqual({ id: siteId, name: "Harare Main Branch" });
    expect(paired.key).toMatch(/^[\w-]{43}$/);
    const device = await prisma.retailDevice.findFirstOrThrow({ where: { registerId: test.id, unpairedAt: null } });
    expect(device).toMatchObject({ kind: "BROWSER", label: "Windows PC", keyHash: hashDeviceKey(paired.key), pairedById: ownerId });
    expect((await prisma.retailPairingCode.findFirstOrThrow({ where: { registerId: test.id } })).deviceId).toBe(device.id);

    const again = await refusal(pair(issued.code));
    expect(again).toMatchObject({ status: 400, body: { code: "BAD_CODE" } });
    const audit = await prisma.platformAuditEvent.findMany({ where: { companyId, entityId: test.id }, select: { eventType: true, payloadJson: true } });
    expect(audit.map((row) => row.eventType)).toEqual(["RETAIL_DEVICE.PAIRED"]);
    expect(JSON.stringify(audit)).not.toContain(issued.code);
    expect(JSON.stringify(audit)).not.toContain(paired.key);
  });

  it("stops one install for 15 minutes after five wrong codes, and says how many tries are left", async () => {
    const install = `wrong-${stamp}`;
    for (const left of [4, 3, 2, 1]) {
      expect(await refusal(pair("000000", install))).toMatchObject({ status: 400, body: { code: "BAD_CODE", triesLeft: left } });
    }
    const locked = await refusal(pair("000000", install));
    expect(locked).toMatchObject({ status: 429, body: { code: "LOCKED" } });
    expect(locked.message).toMatch(/^Too many tries\. Try again at \d\d:\d\d\.$/);
    const until = new Date(String(locked.body.lockedUntil)).getTime();
    expect(until - Date.now()).toBeGreaterThan(14 * 60 * 1000);

    // Even the right code waits out the lock.
    const spare = await till("Spare till");
    const issued = await code(spare.id);
    expect(await refusal(pair(issued.code, install))).toMatchObject({ status: 429 });
    await prisma.retailRegister.update({ where: { id: spare.id }, data: { isActive: false } });
  });

  it("swaps the device on a replace code: the old one is unpaired by whoever made the code", async () => {
    const back = await till("Back till");
    const first = await pair((await code(back.id)).code);
    const second = await pair((await code(back.id, "REPLACE")).code, `second-${stamp}`);

    const old = await prisma.retailDevice.findUniqueOrThrow({ where: { keyHash: hashDeviceKey(first.key) } });
    expect(old).toMatchObject({ unpairReason: "REPLACED", unpairedById: ownerId });
    expect(old.unpairedAt).not.toBeNull();
    const now = await prisma.retailDevice.findUniqueOrThrow({ where: { keyHash: hashDeviceKey(second.key) } });
    expect(now.unpairedAt).toBeNull();
    const audit = await prisma.platformAuditEvent.findMany({ where: { companyId, entityId: back.id }, orderBy: { createdAt: "asc" } });
    expect(audit.map((row) => row.eventType)).toEqual(["RETAIL_DEVICE.PAIRED", "RETAIL_DEVICE.PAIRED", "RETAIL_DEVICE.REPLACED"]);
  });

  it("refuses a third paired till on a two-till plan", async () => {
    const third = await till("Cold room till");
    const refused = await refusal(pair((await code(third.id)).code, `third-${stamp}`));
    expect(refused).toMatchObject({ status: 409, body: { code: "PLAN_LIMIT" } });
    expect(await prisma.retailDevice.count({ where: { registerId: third.id } })).toBe(0);
  });
});

describe("every POS request names its device (W-04 step 8)", () => {
  let key = "";
  let device: PosDevice;

  beforeAll(async () => {
    const test = await prisma.retailRegister.findFirstOrThrow({ where: { companyId, name: "Test till" } });
    await prisma.retailDevice.updateMany({ where: { registerId: test.id }, data: { lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) } });
    // A key we know: the one the first pairing set is gone with its response.
    key = `key-${stamp}`;
    await prisma.retailDevice.updateMany({ where: { registerId: test.id, unpairedAt: null }, data: { keyHash: hashDeviceKey(key) } });
  });

  it("refuses a request with no device, or another shop's, as NOT_A_TILL", async () => {
    const none = await requirePosDevice(request(null), { user: { companyId } });
    expect(none.response?.status).toBe(409);
    expect(await none.response?.json()).toMatchObject({ code: "NOT_A_TILL" });
    const foreign = await requirePosDevice(request(key), { user: { companyId: "someone-else" } });
    expect(foreign.response?.status).toBe(409);
  });

  it("finds the device by its key and notes that it was seen", async () => {
    const found = await requirePosDevice(request(key), { user: { companyId } });
    expect(found.response).toBeNull();
    device = found.device!;
    expect(device.register.name).toBe("Test till");
    const seen = await prisma.retailDevice.findUniqueOrThrow({ where: { id: device.id } });
    expect(Date.now() - seen.lastSeenAt!.getTime()).toBeLessThan(60 * 1000);
  });

  it("offers the people with a PIN who may sell, whoever is on the till first", async () => {
    expect((await tillPeople(device)).map((person) => person.label)).toEqual(["Kuda B.", "Chipo D.", "Farai M."]);
    await prisma.retailShift.create({
      data: {
        companyId,
        siteId,
        shiftNo: `SH-${stamp}`,
        registerCode: device.register.code,
        registerName: device.register.name,
        registerId: device.registerId,
        cashierId: people.chipo!,
        cashierName: "Chipo Dube",
      },
    });
    expect((await tillPeople(device)).map((person) => person.label)).toEqual(["Chipo D.", "Kuda B.", "Farai M."]);
  });

  it("signs a person in with their PIN at the device, with the till PIN's lockout", async () => {
    const verify = (pin: string) => (hash: string) => bcrypt.compare(pin, hash);
    expect(await checkTillPinSignIn({ deviceKey: key, userId: people.chipo!, verify: verify("2580") })).toMatchObject({ ok: true });
    expect(await checkTillPinSignIn({ deviceKey: key, userId: people.kuda!, verify: verify("1111") })).toEqual({
      ok: false,
      reason: "WRONG_PIN",
      triesLeft: 4,
    });
    expect(await checkTillPinSignIn({ deviceKey: null, userId: people.chipo!, verify: verify("2580") })).toEqual({ ok: false, reason: "NOT_A_TILL" });
    expect(await checkTillPinSignIn({ deviceKey: key, userId: people.clerk!, verify: verify("2580") })).toEqual({
      ok: false,
      reason: "NOT_ON_THIS_TILL",
    });
  });

  it("answers DEVICE_UNPAIRED once unpaired, and lets only earlier offline sales in, flagged", async () => {
    const unpairedAt = new Date();
    await prisma.retailDevice.update({
      where: { id: device.id },
      data: { unpairedAt, unpairedById: ownerId, unpairReason: "UNPAIRED" },
    });
    const refused = await requirePosDevice(request(key), { user: { companyId } });
    expect(refused.response?.status).toBe(401);
    expect(await refused.response?.json()).toMatchObject({
      code: "DEVICE_UNPAIRED",
      by: "Tendai Mhlanga",
      reason: "UNPAIRED",
      tillName: "Test till",
      deviceLabel: "Browser, Windows PC",
    });

    const sync = await requirePosDevice(request(key), { user: { companyId } }, { allowUnpaired: true });
    expect(sync.response).toBeNull();
    const gone = sync.device!;
    expect(unpairedSaleGate(gone, new Date(unpairedAt.getTime() - 60_000))).toEqual({ reviewReason: UNPAIRED_REVIEW_REASON, response: null });
    expect(unpairedSaleGate(gone, new Date(unpairedAt.getTime() + 60_000)).response?.status).toBe(401);
    expect(unpairedSaleGate(gone, null).response?.status).toBe(401);
    expect(await checkTillPinSignIn({ deviceKey: key, userId: people.chipo!, verify: async () => true })).toEqual({
      ok: false,
      reason: "DEVICE_UNPAIRED",
    });
  });
});
