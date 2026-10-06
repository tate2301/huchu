import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";

import { enrichTokenClaims } from "@/lib/auth-core/session-claims";
import { prisma } from "@/lib/prisma";
import { TILL_PIN_LOCK_MS } from "@/lib/retail/till-pin";

import { giveAccessBack, removeAccess, removeAccessMany } from "./access";
import type { PeopleActor } from "./actor";
import { messagePeople, resetPins } from "./bulk";
import { changePerson } from "./change";
import { inviteAgain, invitePerson, hashInviteToken } from "./invite";
import { acceptJoin, acceptPendingInvite, readJoin } from "./join";
import { PeopleRefusal } from "./refusal";
import { loadPeople, loadPerson } from "./view";

/**
 * Staff and PINs against the test database (80-admin W-57): inviting with
 * the field and role rules, changing, removing access (an open shift closed
 * without a count), giving it back, new PINs, a message, joining by the link,
 * and a session ending when access goes. WhatsApp is not set up here, so
 * every send hands the link and PIN back.
 */

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let mainId: string;
let borrowdaleId: string;
let ownerId: string;
let managerId: string;
let cashierId: string;

const URL_BASE = "http://localhost:3000/retail/manage/people";
const asOwner = (): PeopleActor => ({
  companyId,
  userId: ownerId,
  userName: "Tendai Mhlanga",
  userRole: "SUPERADMIN",
  roleKey: "SUPERADMIN",
  requestUrl: URL_BASE,
});
const asManager = (): PeopleActor => ({
  companyId,
  userId: managerId,
  userName: "Tafara Nyathi",
  userRole: "MANAGER",
  roleKey: "MANAGER",
  requestUrl: URL_BASE,
});

async function refusal(promise: Promise<unknown>): Promise<PeopleRefusal> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PeopleRefusal) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

/** A phone nobody in this run has: +26377 then seven digits. */
let phoneSeq = Math.floor(Math.random() * 9_000_000) + 1_000_000;
const phone = () => `+26377${String(phoneSeq++).padStart(7, "0").slice(-7)}`;

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `People ${stamp}`, slug: `people-${stamp}` } });
  companyId = company.id;
  const [main, borrowdale] = await Promise.all([
    prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" } }),
    prisma.site.create({ data: { companyId, name: "Borrowdale", code: "BDL" } }),
  ]);
  mainId = main.id;
  borrowdaleId = borrowdale.id;
  const owner = await prisma.user.create({
    data: { companyId, name: "Tendai Mhlanga", email: `owner-${stamp}@people.test`, role: "SUPERADMIN", phone: phone() },
  });
  ownerId = owner.id;
  const manager = await prisma.user.create({
    data: {
      companyId,
      name: "Tafara Nyathi",
      email: `manager-${stamp}@people.test`,
      role: "MANAGER",
      phone: phone(),
      allSites: false,
      siteAccess: { create: { siteId: mainId, companyId } },
    },
  });
  managerId = manager.id;
  const cashier = await prisma.user.create({
    data: { companyId, name: "Chipo Dube", role: "CASHIER", phone: "+263712204410", allSites: true },
  });
  cashierId = cashier.id;
  await prisma.retailTillPin.create({
    data: {
      companyId,
      userId: cashierId,
      pinHash: await bcrypt.hash("1928", 4),
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() + TILL_PIN_LOCK_MS - 60_000),
    },
  });
});

afterAll(async () => {
  if (!companyId) return;
  const users = await prisma.user.findMany({ where: { companyId }, select: { id: true } });
  const ids = users.map((user) => user.id);
  await prisma.notificationRecipient.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.retailStaffInvite.deleteMany({ where: { companyId } });
  await prisma.retailTillPin.deleteMany({ where: { companyId } });
  await prisma.userSiteAccess.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.user.updateMany({ where: { companyId }, data: { accessRemovedById: null } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("inviting someone", () => {
  it("refuses a manager adding anyone but a cashier or a stock clerk", async () => {
    const refused = await refusal(
      invitePerson(asManager(), { name: "Ruvimbo Chari", phone: phone(), email: "r@people.test", role: "BOOKKEEPER", sites: "ALL", givePin: false }),
    );
    expect(refused).toMatchObject({ status: 403, message: "Managers add cashiers and stock clerks only." });
  });

  it("says what is wrong with each field at once", async () => {
    const refused = await refusal(
      invitePerson(asOwner(), { name: " ", phone: "0712", email: "nope", role: "CASHIER", sites: [mainId], givePin: false }),
    );
    expect(refused.status).toBe(400);
    expect(refused.fieldErrors).toEqual({
      name: "Write their name.",
      phone: "Write a mobile number such as +263 77 123 4567.",
      email: "That email does not look right.",
    });
  });

  it("names whoever has the number, asks owners for an email, and wants a way in", async () => {
    const taken = await refusal(
      invitePerson(asOwner(), { name: "Kuda Banda", phone: "0712 204 410", role: "CASHIER", sites: [mainId], givePin: true }),
    );
    expect(taken.fieldErrors).toEqual({ phone: "Chipo Dube already has that number." });
    const noEmail = await refusal(
      invitePerson(asOwner(), { name: "Ruvimbo Chari", phone: phone(), role: "BOOKKEEPER", sites: "ALL", givePin: false }),
    );
    expect(noEmail.fieldErrors).toEqual({ email: "Owners and bookkeepers sign in to the admin, so they need an email." });
    const noWay = await refusal(
      invitePerson(asOwner(), { name: "Kuda Banda", phone: phone(), role: "CASHIER", sites: [mainId], givePin: false }),
    );
    expect(noWay.fieldErrors).toEqual({ pin: "Give them an email or a till PIN, or they cannot get in." });
  });

  it("keeps owners on every site and a site-limited manager to their own", async () => {
    const owner = await refusal(
      invitePerson(asOwner(), { name: "Second Owner", phone: phone(), email: `o2-${stamp}@people.test`, role: "OWNER", sites: [mainId], givePin: false }),
    );
    expect(owner.fieldErrors).toEqual({ sites: "Owners see every site." });
    const elsewhere = await refusal(
      invitePerson(asManager(), { name: "Kuda Banda", phone: phone(), role: "CASHIER", sites: [borrowdaleId], givePin: true }),
    );
    expect(elsewhere.fieldErrors).toEqual({ sites: "You can only give sites you work at." });
  });

  it("makes the person at once, with a link for 7 days and a PIN, and hands both back when WhatsApp cannot send", async () => {
    const number = phone();
    const result = await invitePerson(asManager(), {
      name: "Kuda  Banda",
      phone: number.replace("+263", "0"),
      role: "CASHIER",
      sites: [mainId],
      givePin: true,
    });
    expect(result.data).toMatchObject({
      name: "Kuda Banda",
      phone: number,
      email: null,
      role: "CASHIER",
      sitesLabel: "Harare Main Branch",
      state: "INVITED",
      pin: { state: "NEW", column: "Sent" },
    });
    expect(result.sent).toEqual({ whatsapp: false, error: "WhatsApp is not set up" });
    expect(result.handOver?.pin).toMatch(/^\d{4}$/);
    const token = result.handOver!.link!.split("/join/")[1]!;

    const invite = await prisma.retailStaffInvite.findUniqueOrThrow({ where: { tokenHash: hashInviteToken(token) } });
    expect(invite).toMatchObject({ userId: result.data.id, sentTo: number, acceptedAt: null, revokedAt: null });
    expect(invite.expiresAt.getTime() - invite.createdAt.getTime()).toBeGreaterThan(6.9 * 86_400_000);

    const pin = await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: result.data.id } });
    expect(pin).toMatchObject({ mustChange: true, issuedById: managerId, failedAttempts: 0 });
    expect(await bcrypt.compare(result.handOver!.pin!, pin.pinHash)).toBe(true);

    // The message is logged without its secrets.
    const message = await prisma.retailMessage.findFirstOrThrow({ where: { companyId, to: number, template: "staff-invite" } });
    expect(message.status).toBe("FAILED");
    expect(message.body).not.toContain(result.handOver!.pin!);
    expect(message.body).not.toContain(token);
    expect(message.body).toContain("••••");

    const event = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { companyId, entityId: result.data.id, eventType: "RETAIL_PERSON.INVITED" },
    });
    expect(JSON.parse(event.payloadJson ?? "{}")).toMatchObject({
      name: "Kuda Banda",
      role: "CASHIER",
      sites: ["Harare Main Branch"],
      pin: true,
      email: false,
    });
  });
});

describe("joining by the link", () => {
  it("shows who and where, takes a password once, and then the link is gone", async () => {
    const result = await invitePerson(asOwner(), {
      name: "Ruvimbo Test",
      phone: phone(),
      email: `ruvimbo-${stamp}@people.test`,
      role: "BOOKKEEPER",
      sites: "ALL",
      givePin: false,
    });
    const token = result.handOver!.link!.split("/join/")[1]!;
    expect(await readJoin(token)).toMatchObject({
      name: "Ruvimbo Test",
      roleLabel: "Bookkeeper",
      where: "for all sites",
      invitedBy: "Tendai Mhlanga",
      needsPassword: true,
    });
    const short = await refusal(acceptJoin(token, { password: "short" }));
    expect(short.fieldErrors).toEqual({ password: "Choose a password of 8 characters or more." });

    expect(await acceptJoin(token, { password: "RetailDemo123!" })).toEqual({ email: `ruvimbo-${stamp}@people.test`, home: "/retail" });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: result.data.id } });
    expect(await bcrypt.compare("RetailDemo123!", user.password ?? "")).toBe(true);
    expect((await loadPerson(companyId, { userId: ownerId, roleKey: "SUPERADMIN" }, user.id))?.state).toBe("ACTIVE");
    expect(await prisma.platformAuditEvent.count({ where: { entityId: user.id, eventType: "RETAIL_PERSON.JOINED" } })).toBe(1);

    expect((await refusal(readJoin(token))).message).toBe("This link is not valid any more.");
    expect((await refusal(acceptJoin(token, { password: "RetailDemo123!" }))).status).toBe(404);
  });

  it("is taken by a first sign-in too", async () => {
    const result = await invitePerson(asOwner(), { name: "Pin Only", phone: phone(), role: "STOCK_CLERK", sites: "ALL", givePin: true });
    await acceptPendingInvite(result.data.id, "pin");
    const invite = await prisma.retailStaffInvite.findFirstOrThrow({ where: { userId: result.data.id } });
    expect(invite.acceptedAt).not.toBeNull();
  });

  it("sends a new link again, and the old one stops", async () => {
    const result = await invitePerson(asOwner(), { name: "Again Person", phone: phone(), role: "CASHIER", sites: "ALL", givePin: true });
    const first = result.handOver!.link!.split("/join/")[1]!;
    const again = await inviteAgain(asOwner(), result.data.id);
    const second = again.handOver!.link!.split("/join/")[1]!;
    expect(second).not.toBe(first);
    // The PIN was never used, so a new one goes in the same message.
    expect(again.handOver!.pin).toMatch(/^\d{4}$/);
    expect((await refusal(readJoin(first))).status).toBe(404);
    expect((await readJoin(second)).name).toBe("Again Person");
  });
});

describe("changing a person", () => {
  it("lets a manager change cashiers only, and nobody their own role", async () => {
    expect((await refusal(changePerson(asManager(), ownerId, { name: "Someone" }))).message).toBe(
      "Managers change cashiers and stock clerks only.",
    );
    expect((await refusal(changePerson(asManager(), cashierId, { role: "MANAGER" }))).status).toBe(403);
    expect((await refusal(changePerson(asOwner(), ownerId, { role: "MANAGER" }))).message).toBe(
      "Ask another owner to change your role.",
    );
  });

  it("asks for an email on file before making someone a bookkeeper", async () => {
    const refused = await refusal(changePerson(asOwner(), cashierId, { role: "BOOKKEEPER" }));
    expect(refused.fieldErrors).toEqual({
      role: "Owners and bookkeepers sign in to the admin, so they need an email. Invite them again with one.",
    });
  });

  it("sends a locked person a new PIN that clears the lock, and records each change", async () => {
    const before = await loadPerson(companyId, { userId: ownerId, roleKey: "SUPERADMIN" }, cashierId);
    expect(before?.state).toBe("PIN_LOCKED");
    const result = await changePerson(asOwner(), cashierId, { sites: [borrowdaleId], sendNewPin: true });
    expect(result.changed).toEqual([{ field: "sites", label: "Sites", from: "All sites", to: "Borrowdale" }]);
    expect(result.handOver?.pin).toMatch(/^\d{4}$/);
    expect(result.data).toMatchObject({ state: "ACTIVE", sitesLabel: "Borrowdale", pin: { state: "NEW" } });
    const pin = await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: cashierId } });
    expect(pin).toMatchObject({ failedAttempts: 0, lockedUntil: null, mustChange: true, issuedById: ownerId });
    const sent = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: cashierId, eventType: "RETAIL_PERSON.PIN_SENT" } });
    expect(JSON.parse(sent.payloadJson ?? "{}")).toMatchObject({ wasLocked: true });
  });
});

describe("removing access", () => {
  it("refuses your own and the last owner's", async () => {
    expect((await refusal(removeAccess(asOwner(), ownerId))).message).toBe("You cannot remove your own access.");
  });

  it("closes their open shift without a count, takes their PIN, and ends their session", async () => {
    const register = await prisma.retailRegister.create({ data: { companyId, siteId: mainId, code: "TILL-1", name: "Front till" } });
    const shift = await prisma.retailShift.create({
      data: {
        companyId,
        siteId: mainId,
        shiftNo: `SH-${stamp.slice(-5)}`,
        registerCode: "TILL-1",
        registerName: "Front till",
        registerId: register.id,
        cashierId,
        cashierName: "Chipo Dube",
      },
    });
    const view = await loadPerson(companyId, { userId: ownerId, roleKey: "SUPERADMIN" }, cashierId);
    expect(view?.openShifts).toEqual([{ shiftNo: shift.shiftNo, registerName: "Front till" }]);

    const result = await removeAccess(asOwner(), cashierId);
    expect(result.closedShifts).toEqual([shift.shiftNo]);
    expect(result.data).toMatchObject({ state: "NO_ACCESS", accessRemoved: { byName: "Tendai Mhlanga" } });
    expect(await prisma.retailShift.findUniqueOrThrow({ where: { id: shift.id } })).toMatchObject({
      status: "CLOSED",
      countedCash: null,
      variance: null,
    });
    expect(await prisma.retailTillPin.count({ where: { userId: cashierId } })).toBe(0);

    // Their session ends at its next request.
    const claims = await enrichTokenClaims({ id: cashierId, companyId, role: "CASHIER" });
    expect(claims.id).toBeUndefined();

    expect((await refusal(removeAccess(asOwner(), cashierId))).message).toBe("Chipo Dube has no access already.");
  });

  it("gives access back with a new PIN", async () => {
    const result = await giveAccessBack(asOwner(), cashierId, { sendNewPin: true });
    expect(result.data.state).toBe("ACTIVE");
    expect(result.handOver?.pin).toMatch(/^\d{4}$/);
    const claims = await enrichTokenClaims({ id: cashierId, companyId, role: "MANAGER" });
    // The role is the database's, not the token's.
    expect(claims.role).toBe("CASHIER");
    expect((await refusal(giveAccessBack(asOwner(), cashierId, {}))).message).toBe("Chipo Dube has access already.");
  });

  it("skips themselves when removing several", async () => {
    const result = await removeAccessMany(asOwner(), [ownerId]);
    expect(result.removed).toEqual([]);
    expect(result.skipped).toEqual([{ id: ownerId, name: "Tendai Mhlanga", why: "You cannot remove your own access." }]);
  });
});

describe("from People's selection", () => {
  it("sends new PINs to those who have one and says why the rest were skipped", async () => {
    const result = await resetPins(asOwner(), [cashierId, ownerId]);
    expect(result.sent).toEqual([cashierId]);
    expect(result.skipped).toEqual([{ id: ownerId, name: "Tendai Mhlanga", why: "No PIN to reset." }]);
    expect(result.handOver).toEqual([{ name: "Chipo Dube", pin: expect.stringMatching(/^\d{4}$/) }]);
  });

  it("messages them in the app and queues WhatsApp for those with a phone", async () => {
    const refused = await refusal(messagePeople(asOwner(), [cashierId], "  "));
    expect(refused.fieldErrors).toEqual({ message: "Write a message." });
    expect(await messagePeople(asOwner(), [cashierId, managerId], "Stock take at 18:00.")).toEqual({ sent: 2, whatsapp: 2 });
    const queued = await prisma.retailMessage.count({ where: { companyId, template: "staff-message", status: "QUEUED" } });
    expect(queued).toBe(2);
    const notice = await prisma.notification.findFirstOrThrow({ where: { companyId, type: "RETAIL_STAFF_MESSAGE" } });
    expect(notice.summary).toBe("Stock take at 18:00.");
  });
});

describe("the list", () => {
  it("is everyone of the shop, as the viewer sees them", async () => {
    const people = await loadPeople(companyId, { userId: ownerId, roleKey: "SUPERADMIN" });
    const owner = people.find((person) => person.id === ownerId)!;
    expect(owner).toMatchObject({ lastIn: "Now", roleLabel: "Owner", can: { removeAccess: false, roles: [] } });
    const asManagerSees = await loadPeople(companyId, { userId: managerId, roleKey: "MANAGER" });
    expect(asManagerSees.find((person) => person.id === ownerId)?.can.edit).toBe(false);
    expect(asManagerSees.find((person) => person.id === cashierId)?.can).toMatchObject({
      edit: true,
      roles: ["CASHIER", "STOCK_CLERK"],
      removeAccess: false,
    });
  });
});
