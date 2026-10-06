/**
 * ADM-03: a typed till PIN against the database — the lock with no expiry,
 * refused without a bcrypt compare, its event and notification to the people
 * who see the person, cleared by a new PIN; and choosing your own PIN.
 */

import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { issueTillPin } from "@/lib/retail/people/pins";

import { CURRENT_PIN_WRONG, PIN_SAME_AS_SENT, checkTillPin, chooseTillPin, pinLockedWords } from "./till-pin-attempt";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let ownerId: string;
let mainManagerId: string;
let otherManagerId: string;
let cashierId: string;
let mainId: string;

let place: { registerId: string };
const typed = (pin: string) => checkTillPin({ companyId, userId: cashierId, pin, place, opens: true });

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `PIN ${stamp}`, slug: `pin-${stamp}` }, select: { id: true } })).id;
  mainId = (await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: `HRE${stamp.slice(-4)}` }, select: { id: true } })).id;
  const otherId = (await prisma.site.create({ data: { companyId, name: "Borrowdale", code: `BDL${stamp.slice(-4)}` }, select: { id: true } })).id;
  const user = async (name: string, role: "SUPERADMIN" | "MANAGER" | "CASHIER", siteId: string | null) =>
    (
      await prisma.user.create({
        data: {
          companyId,
          name,
          role,
          email: `${name.split(" ")[0]!.toLowerCase()}-${stamp}@pin.test`,
          allSites: siteId === null,
          ...(siteId ? { siteAccess: { create: { siteId, companyId } } } : {}),
        },
        select: { id: true },
      })
    ).id;
  ownerId = await user("Tendai Mhlanga", "SUPERADMIN", null);
  mainManagerId = await user("Tafara Nyathi", "MANAGER", mainId);
  otherManagerId = await user("Rufaro Ndlovu", "MANAGER", otherId);
  cashierId = await user("Farai Moyo", "CASHIER", mainId);
  const till = await prisma.retailRegister.create({
    data: { companyId, siteId: mainId, code: `BT${stamp.slice(-4)}`, name: "Back till" },
    select: { id: true },
  });
  place = { registerId: till.id };
});

beforeEach(async () => {
  await prisma.retailTillPin.deleteMany({ where: { companyId } });
  await prisma.retailTillPin.create({ data: { companyId, userId: cashierId, pinHash: await bcrypt.hash("6024", 4) } });
});

afterAll(async () => {
  if (!companyId) return;
  vi.restoreAllMocks();
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.retailTillPin.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.userSiteAccess.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("five wrong PINs", () => {
  it("lock it with no expiry, and a right PIN while locked is refused without comparing it", async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(await typed("1111")).toMatchObject({ decision: "REJECTED", attemptsRemaining: 5 - attempt });
    }
    expect(await typed("1111")).toMatchObject({ decision: "REJECTED_NOW_LOCKED" });
    const row = await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: cashierId } });
    expect(row.failedAttempts).toBe(5);
    expect(row.lockedAt).toBeInstanceOf(Date);

    const compare = vi.spyOn(bcrypt, "compare");
    const aYearOn = new Date(Date.now() + 365 * 86_400_000);
    expect(await checkTillPin({ companyId, userId: cashierId, pin: "6024", place, opens: true, now: aYearOn })).toMatchObject({
      decision: "LOCKED",
    });
    expect(compare).not.toHaveBeenCalled();
    compare.mockRestore();
  });

  it("write RETAIL_PIN.LOCKED once and tell the owners and the managers who see the person", async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) await typed("1111");
    const events = await prisma.platformAuditEvent.findMany({ where: { companyId, entityId: cashierId, eventType: "RETAIL_PIN.LOCKED" } });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(events[0]!.payloadJson ?? "{}")).toMatchObject({ registerName: "Back till", source: "TILL" });
    const latest = await prisma.notification.findFirstOrThrow({
      where: { companyId, type: "RETAIL_PIN_LOCKED" },
      orderBy: { createdAt: "desc" },
      include: { recipients: { select: { userId: true } } },
    });
    expect(latest).toMatchObject({ title: "Farai Moyo’s PIN is locked", severity: "WARNING" });
    expect(latest.summary).toMatch(/^Five wrong tries at Back till, \d{2}:\d{2}\. Send a new PIN from People\.$/);
    expect(latest.recipients.map((row) => row.userId).sort()).toEqual([ownerId, mainManagerId].sort());
    expect(latest.recipients.map((row) => row.userId)).not.toContain(otherManagerId);
  });

  it("sent all at once still add up: at most five are compared, then it is locked, with one event", async () => {
    const lockEvents = () => prisma.platformAuditEvent.count({ where: { companyId, entityId: cashierId, eventType: "RETAIL_PIN.LOCKED" } });
    const eventsBefore = await lockEvents();
    const compare = vi.spyOn(bcrypt, "compare");
    const answers = await Promise.all(Array.from({ length: 30 }, () => typed("1111")));
    const compared = compare.mock.calls.length;
    compare.mockRestore();

    expect(compared).toBeLessThanOrEqual(5);
    expect(answers.filter((answer) => answer.decision === "REJECTED_NOW_LOCKED")).toHaveLength(1);
    expect(answers.filter((answer) => answer.decision === "LOCKED")).toHaveLength(30 - compared);
    const row = await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: cashierId } });
    expect(row.failedAttempts).toBe(5);
    expect(row.lockedAt).toBeInstanceOf(Date);
    expect(await lockEvents()).toBe(eventsBefore + 1);
  });

  it("are cleared by a right PIN before the fifth", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) await typed("1111");
    expect(await typed("6024")).toMatchObject({ decision: "ACCEPTED" });
    const row = await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: cashierId } });
    expect(row).toMatchObject({ failedAttempts: 0, lockedAt: null });
    expect(row.lastUnlockedAt).toBeInstanceOf(Date);
    expect(await typed("1111")).toMatchObject({ decision: "REJECTED", attemptsRemaining: 4 });
  });

  it("typed in the admin are sourced ADMIN, with no till in the words", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await checkTillPin({ companyId, userId: cashierId, pin: "1111", place: {}, opens: false });
    const event = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { companyId, entityId: cashierId, eventType: "RETAIL_PIN.LOCKED" },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.parse(event.payloadJson ?? "{}")).toMatchObject({ registerName: null, source: "ADMIN" });
  });

  it("are forgotten when somebody sends a new PIN", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await typed("1111");
    const pin = await prisma.$transaction((tx) => issueTillPin(tx, { companyId, userId: cashierId, issuedById: ownerId }));
    expect(await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: cashierId } })).toMatchObject({
      failedAttempts: 0,
      lockedAt: null,
      mustChange: true,
    });
    expect(await typed(pin)).toMatchObject({ decision: "ACCEPTED", mustChange: true });
  });
});

describe("choosing your own PIN", () => {
  const choose = (input: { currentPin?: string; newPin: string; openedByIssuedPin?: boolean }) =>
    chooseTillPin({
      companyId,
      userId: cashierId,
      userName: "Farai Moyo",
      userRole: "CASHIER",
      currentPin: input.currentPin,
      newPin: input.newPin,
      openedByIssuedPin: input.openedByIssuedPin ?? false,
      place,
    });

  it("after an issued PIN opened the till: no current PIN, not the one sent, not obvious", async () => {
    const sent = await prisma.$transaction((tx) => issueTillPin(tx, { companyId, userId: cashierId, issuedById: ownerId }));
    await expect(choose({ newPin: sent, openedByIssuedPin: true })).rejects.toMatchObject({ status: 400, field: "newPin", message: PIN_SAME_AS_SENT });
    await expect(choose({ newPin: "1234", openedByIssuedPin: true })).rejects.toMatchObject({
      status: 400,
      field: "newPin",
      message: "Pick a PIN that is not four of the same digit or four in a row.",
    });
    const fresh = sent === "1593" ? "2684" : "1593";
    expect(await choose({ newPin: fresh, openedByIssuedPin: true })).toEqual({ mustChange: false });
    const row = await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: cashierId } });
    expect(row).toMatchObject({ mustChange: false, issuedById: null, failedAttempts: 0 });
    expect(await bcrypt.compare(fresh, row.pinHash)).toBe(true);
    expect(await prisma.platformAuditEvent.count({ where: { companyId, entityId: cashierId, eventType: "RETAIL_PERSON.PIN_CHOSEN" } })).toBe(1);
  });

  it("otherwise asks the current PIN, counting a wrong one, and refuses while locked", async () => {
    await expect(choose({ newPin: "2684" })).rejects.toMatchObject({ status: 400, field: "currentPin", message: CURRENT_PIN_WRONG });
    await expect(choose({ currentPin: "1111", newPin: "2684" })).rejects.toMatchObject({ status: 400, field: "currentPin" });
    expect((await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: cashierId } })).failedAttempts).toBe(1);
    expect(await choose({ currentPin: "6024", newPin: "2684" })).toEqual({ mustChange: false });

    await prisma.retailTillPin.update({ where: { userId: cashierId }, data: { lockedAt: new Date(), failedAttempts: 5 } });
    await expect(choose({ currentPin: "2684", newPin: "3795" })).rejects.toMatchObject({
      status: 423,
      message: "Too many tries. Ask a manager to send you a new PIN.",
    });
  });
});

describe("the lock's words", () => {
  it("name the person, the till and the time in Harare", () => {
    expect(pinLockedWords({ name: "Farai Moyo", registerName: "Back till", at: new Date("2026-10-03T06:12:00Z") })).toEqual({
      title: "Farai Moyo’s PIN is locked",
      summary: "Five wrong tries at Back till, 08:12. Send a new PIN from People.",
    });
    expect(pinLockedWords({ name: "Tafara Nyathi", registerName: null, at: new Date("2026-10-03T06:12:00Z") }).summary).toBe(
      "Five wrong tries, 08:12. Send a new PIN from People.",
    );
  });
});
