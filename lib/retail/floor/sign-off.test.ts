import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { recoveryBackfillTask } from "@/lib/accounting/integration";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { activityWords } from "@/lib/retail/activity-words";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * Signing off a drawer (50-floor W-40, FLR-05), as the browser calls it:
 * who may, the drawer's own cashier refused (the owner allowed), recover only
 * a short drawer and only with a note, look into it then accept, a final
 * sign-off happening once even when two managers press together, the
 * recovery journal (Dr 1150 / Cr 5420) balancing, the cashier told with the
 * note, the record's and the Shifts list's reads, and a drawer with nothing
 * to sign off. Against the test database, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { GET as listGet } from "@/app/api/v2/reports/[key]/route";
import { GET as shiftGet } from "@/app/api/v2/retail/shifts/[id]/route";
import { POST as signOffPost } from "@/app/api/v2/retail/shifts/[id]/sign-off/route";

let shop: TestShop;
let front: string;
const people: Record<string, { id: string; name: string; role: string }> = {};
let seq = 0;

const sessionOf = (who: string) => {
  const person = people[who]!;
  return {
    user: { id: person.id, companyId: shop.companyId, role: person.role, name: person.name, email: `${who}@sign-off.test`, enabledFeatures: ["retail.core", "retail.shifts"] },
  };
};

function as(who: string) {
  validateSessionMock.mockResolvedValue({ session: sessionOf(who) });
}

async function signOff(id: string, body: unknown) {
  const request = new NextRequest(`http://hurudza.test/api/v2/retail/shifts/${id}/sign-off`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await signOffPost(request, { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

async function record(id: string) {
  const response = await shiftGet(new NextRequest(`http://hurudza.test/api/v2/retail/shifts/${id}`), { params: Promise.resolve({ id }) });
  return (await response.json()).data;
}

/** A drawer closed some days ago: counted against expected (null: closed without a count). */
async function closedDrawer(cashier: string, expected: string, counted: string | null, status: "OPEN" | "CLOSED" = "CLOSED", openedHoursAgo = 30) {
  seq += 1;
  return prisma.retailShift.create({
    data: {
      companyId: shop.companyId,
      shiftNo: `SH-${String(80000 + seq)}-${shop.companyId.slice(0, 4)}`,
      registerId: front,
      registerCode: "FRONT",
      registerName: "Front till",
      siteId: shop.mainId,
      cashierId: people[cashier]!.id,
      cashierName: people[cashier]!.name,
      openingFloat: "100.00",
      expectedCash: expected,
      status,
      openedAt: new Date(Date.now() - openedHoursAgo * 3600_000),
      ...(status === "CLOSED"
        ? {
            closedAt: new Date(Date.now() - (openedHoursAgo - 8) * 3600_000),
            closedById: people[cashier]!.id,
            countedCash: counted,
            countedUsd: counted,
            variance: counted === null ? null : (Number(counted) - Number(expected)).toFixed(2),
          }
        : {}),
    },
  });
}

async function journal(sourceId: string) {
  await runRetailPosting(shop.companyId, "BY_HAND", null);
  const entries = await prisma.journalEntry.findMany({
    where: { companyId: shop.companyId, sourceType: "RETAIL_SHIFT_RECOVERY", sourceId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
  return entries.map((entry) => entry.lines.map((line) => ({ code: line.account.code, debit: line.debit, credit: line.credit })).sort((a, b) => a.code.localeCompare(b.code)));
}

beforeAll(async () => {
  shop = await makeTestShop("Sign off");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  front = (await prisma.retailRegister.create({ data: { companyId: shop.companyId, siteId: shop.mainId, code: `FRONT-${shop.companyId.slice(0, 6)}`, name: "Front till" }, select: { id: true } })).id;
  people.owner = { id: shop.ownerId, name: "Tendai Mhlanga", role: "SUPERADMIN" };
  people.manager = { id: shop.managerId, name: "Tafara Nyathi", role: "MANAGER" };
  for (const [key, name, role] of [
    ["chipo", "Chipo Dube", "CASHIER"],
    ["books", "Ruvimbo Chari", "FINANCE_OFFICER"],
  ] as const) {
    const user = await prisma.user.create({ data: { companyId: shop.companyId, name, role, email: `${key}-${shop.companyId}@sign-off.test` }, select: { id: true } });
    people[key] = { id: user.id, name, role };
  }
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.approvalAction.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("who may sign off", () => {
  it("refuses a cashier and the bookkeeper, who only reads the outcome", async () => {
    const shift = await closedDrawer("chipo", "432.50", "412.50");
    for (const who of ["chipo", "books"]) {
      as(who);
      expect(await signOff(shift.id, { outcome: "ACCEPT" })).toEqual({ status: 403, body: expect.objectContaining({ error: "Your role cannot approve shifts and cash" }) });
    }
    as("books");
    expect(await record(shift.id)).toMatchObject({ needsSignOff: true, signOff: null });
  });

  it("refuses a manager his own drawer, and lets the owner sign off hers", async () => {
    const his = await closedDrawer("manager", "200.00", "190.00");
    as("manager");
    expect(await signOff(his.id, { outcome: "ACCEPT" })).toEqual({ status: 403, body: expect.objectContaining({ error: "Somebody else signs off your own drawer." }) });
    const hers = await closedDrawer("owner", "200.00", "203.17");
    as("owner");
    expect(await signOff(hers.id, { outcome: "ACCEPT" })).toMatchObject({ status: 200, body: { data: { outcome: "ACCEPT", amount: "3.17" } } });
  });
});

describe("what a sign-off checks", () => {
  it("recovers only a short drawer", async () => {
    as("manager");
    const over = await closedDrawer("chipo", "100.00", "103.17");
    expect(await signOff(over.id, { outcome: "RECOVER", note: "Agreed" })).toMatchObject({
      status: 400,
      body: { fieldErrors: { do: "Only a short drawer can be recovered." } },
    });
    const uncounted = await closedDrawer("chipo", "72.95", null);
    expect(await signOff(uncounted.id, { outcome: "RECOVER", note: "Agreed" })).toMatchObject({ status: 400, body: { fieldErrors: { do: "Only a short drawer can be recovered." } } });
  });

  it("needs a decision, and a note to recover or look into it", async () => {
    as("manager");
    const short = await closedDrawer("chipo", "432.50", "412.50");
    expect(await signOff(short.id, {})).toMatchObject({ status: 400, body: { fieldErrors: { do: "Choose what happens to it." } } });
    expect(await signOff(short.id, { outcome: "RECOVER", note: " " })).toMatchObject({ status: 400, body: { fieldErrors: { note: "Note how Chipo agreed." } } });
    expect(await signOff(short.id, { outcome: "LOOK_INTO" })).toMatchObject({ status: 400, body: { fieldErrors: { note: "Say what you are looking into." } } });
    expect(await signOff(short.id, { outcome: "ACCEPT", note: "x".repeat(501) })).toMatchObject({ status: 400, body: { fieldErrors: { note: "Keep it to 500 characters." } } });
    expect(await signOff(short.id, { outcome: "ACCEPT", note: 42 })).toMatchObject({ status: 400, body: { fieldErrors: { note: "Write the note as text." } } });
    expect(await prisma.retailShift.findUniqueOrThrow({ where: { id: short.id } })).toMatchObject({ signOffOutcome: null });
  });

  it("refuses a balanced drawer and an open one: nothing to sign off", async () => {
    as("manager");
    const balanced = await closedDrawer("chipo", "300.00", "300.00");
    expect(await signOff(balanced.id, { outcome: "ACCEPT" })).toMatchObject({ status: 409, body: { error: `${balanced.shiftNo} has nothing to sign off.` } });
    const open = await closedDrawer("chipo", "300.00", null, "OPEN");
    expect(await signOff(open.id, { outcome: "ACCEPT" })).toMatchObject({ status: 409, body: { error: `${open.shiftNo} has nothing to sign off.` } });
  });
});

describe("recovering a short drawer", () => {
  it("records what Chipo owes, moves it from cash over short to what staff owe, and tells her with the note", async () => {
    as("manager");
    const shift = await closedDrawer("chipo", "432.50", "412.50");
    const note = "Chipo says a US$20 note went out as change for a US$10. Agreed to recover.";
    expect(await signOff(shift.id, { outcome: "RECOVER", note })).toEqual({ status: 200, body: { data: { shiftNo: shift.shiftNo, outcome: "RECOVER", amount: "20.00" } } });

    const stored = await prisma.retailShift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(stored).toMatchObject({ signOffOutcome: "RECOVER", signedOffById: people.manager!.id, signOffNote: note });
    expect(stored.recoverAmount?.toFixed(2)).toBe("20.00");
    expect(stored.signedOffAt).toBeInstanceOf(Date);

    expect(await journal(shift.id)).toEqual([
      [
        { code: "1150", debit: 20, credit: 0 },
        { code: "5420", debit: 0, credit: 20 },
      ],
    ]);

    const told = await prisma.notification.findMany({
      where: { companyId: shop.companyId, entityId: shift.id, type: "RETAIL_SHIFT_SIGNED_OFF" },
      select: { title: true, summary: true, severity: true, payloadJson: true, recipients: { select: { userId: true } } },
    });
    expect(told).toEqual([
      {
        title: `${shift.shiftNo} signed off`,
        summary: `US$20.00 to be recovered. ${note}`,
        severity: "WARNING",
        payloadJson: expect.stringContaining(`"viewPath":"/retail/shifts/${shift.id}"`),
        recipients: [{ userId: people.chipo!.id }],
      },
    ]);

    const approvals = await prisma.approvalAction.findMany({ where: { companyId: shop.companyId, entityId: shift.id } });
    expect(approvals).toEqual([expect.objectContaining({ action: "APPROVE", fromStatus: "CLOSED", toStatus: "SIGNED_OFF", actedById: people.manager!.id, note })]);

    const [event] = await prisma.platformAuditEvent.findMany({ where: { companyId: shop.companyId, eventType: RETAIL_AUDIT_EVENTS.shiftSignedOff, entityId: shift.id } });
    const payload = JSON.parse(event!.payloadJson ?? "{}");
    expect(payload).toMatchObject({ outcome: "RECOVER", amount: "-20.00", note });
    expect(activityWords(RETAIL_AUDIT_EVENTS.shiftSignedOff, payload)).toEqual({ what: "Signed off: US$20.00 to recover", tone: "warn" });

    as("chipo");
    expect(await record(shift.id)).toMatchObject({
      needsSignOff: false,
      signOff: { outcome: "RECOVER", by: "Tafara Nyathi", note, recover: 20 },
    });
  });
});

describe("a recovery whose journal was lost", () => {
  it("is what the retail backfill posts: Dr 1150 / Cr 5420 for what the cashier owes", async () => {
    // As if the process died between the sign-off's commit and its journal.
    const shift = await closedDrawer("chipo", "60.00", "48.50");
    const stored = await prisma.retailShift.update({
      where: { id: shift.id },
      data: { signOffOutcome: "RECOVER", signedOffAt: new Date(), signedOffById: people.manager!.id, signOffNote: "Agreed with Chipo", recoverAmount: "11.50" },
    });
    const task = recoveryBackfillTask(stored, { companyId: shop.companyId, actorId: people.owner!.id });
    expect(task).toMatchObject({ key: `RETAIL_SHIFT_RECOVERY:${shift.id}`, context: { amount: 11.5, createdById: people.manager!.id, entryDate: stored.signedOffAt } });
    expect(await createJournalEntryFromSource(task!.context, prisma, { postNow: true })).toMatchObject({ entryId: expect.any(String) });
    expect(await journal(shift.id)).toEqual([
      [
        { code: "1150", debit: 11.5, credit: 0 },
        { code: "5420", debit: 0, credit: 11.5 },
      ],
    ]);

    // An accepted drawer, or one still being looked into, owes nothing.
    expect(recoveryBackfillTask({ ...stored, signOffOutcome: "ACCEPT", recoverAmount: null }, { companyId: shop.companyId, actorId: people.owner!.id })).toBeNull();
    expect(recoveryBackfillTask({ ...stored, signOffOutcome: "LOOK_INTO", recoverAmount: null }, { companyId: shop.companyId, actorId: people.owner!.id })).toBeNull();
  });
});

describe("look into it, then decide", () => {
  it("keeps the drawer waiting until a later accept, which happens once", async () => {
    as("manager");
    const shift = await closedDrawer("chipo", "107.15", "100.00");
    expect(await signOff(shift.id, { outcome: "LOOK_INTO", note: "Checking the camera at 14:00" })).toMatchObject({ status: 200, body: { data: { outcome: "LOOK_INTO" } } });
    expect(await record(shift.id)).toMatchObject({ needsSignOff: true, signOff: { outcome: "LOOK_INTO", note: "Checking the camera at 14:00" } });
    expect(await prisma.approvalAction.count({ where: { companyId: shop.companyId, entityId: shift.id } })).toBe(0);

    expect(await signOff(shift.id, { outcome: "ACCEPT" })).toMatchObject({ status: 200, body: { data: { outcome: "ACCEPT", amount: "-7.15" } } });
    expect(await record(shift.id)).toMatchObject({ needsSignOff: false, signOff: { outcome: "ACCEPT", note: null, recover: null } });
    expect(await signOff(shift.id, { outcome: "RECOVER", note: "Changed my mind" })).toMatchObject({ status: 409, body: { error: `${shift.shiftNo} is signed off already.` } });
    expect(await journal(shift.id)).toEqual([]);

    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId: shop.companyId, eventType: RETAIL_AUDIT_EVENTS.shiftSignedOff, entityId: shift.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => activityWords(event.eventType, JSON.parse(event.payloadJson ?? "{}")))).toEqual([
      { what: "Being looked into", tone: "warn" },
      { what: "Signed off: accepted −US$7.15", tone: "ok" },
    ]);
  });

  it("lets only one of two managers pressing together sign it off", async () => {
    const shift = await closedDrawer("chipo", "50.00", "41.86");
    validateSessionMock.mockResolvedValueOnce({ session: sessionOf("owner") }).mockResolvedValueOnce({ session: sessionOf("manager") });
    const answers = await Promise.all([signOff(shift.id, { outcome: "ACCEPT" }), signOff(shift.id, { outcome: "RECOVER", note: "Agreed with Chipo" })]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    expect(answers.find((answer) => answer.status === 409)?.body.error).toBe(`${shift.shiftNo} is signed off already.`);
    expect(await prisma.approvalAction.count({ where: { companyId: shop.companyId, entityId: shift.id } })).toBe(1);
  });
});

describe("the Shifts list", () => {
  it("lists exactly the drawers that need a sign-off under State › Needs sign-off, however long ago they opened", async () => {
    as("manager");
    // Looked into 40 days ago and still waiting: past the list's default Opened (30 days).
    const old = await closedDrawer("chipo", "80.00", "71.00", "CLOSED", 40 * 24);
    expect(await signOff(old.id, { outcome: "LOOK_INTO", note: "Waiting on the bank statement" })).toMatchObject({ status: 200 });
    const response = await listGet(new NextRequest("http://hurudza.test/api/v2/reports/retail-shifts?page=1&size=200&state=needs-sign-off"), {
      params: Promise.resolve({ key: "retail-shifts" }),
    });
    const body = await response.json();
    const listed = new Set<string>(((body.data?.rows ?? body.rows) as Array<{ id: string }>).map((row) => row.id));
    const all = await prisma.retailShift.findMany({ where: { companyId: shop.companyId }, select: { id: true, status: true, countedCash: true, variance: true, signOffOutcome: true } });
    const waiting = all
      .filter((shift) => shift.status === "CLOSED" && (shift.signOffOutcome === null || shift.signOffOutcome === "LOOK_INTO"))
      .filter((shift) => shift.countedCash === null || shift.variance === null || !shift.variance.isZero())
      .map((shift) => shift.id);
    expect(waiting).toContain(old.id);
    expect([...listed].sort()).toEqual(waiting.sort());
    expect(body.data?.query?.filters?.opened ?? body.query?.filters?.opened).toBe("any");

    // A period picked with it still narrows.
    const narrowed = await listGet(new NextRequest("http://hurudza.test/api/v2/reports/retail-shifts?page=1&size=200&state=needs-sign-off&opened=30d"), {
      params: Promise.resolve({ key: "retail-shifts" }),
    });
    const narrowedBody = await narrowed.json();
    const narrowedIds = ((narrowedBody.data?.rows ?? narrowedBody.rows) as Array<{ id: string }>).map((row) => row.id);
    expect(narrowedIds).not.toContain(old.id);
    expect(narrowedIds.length).toBe(waiting.length - 1);
  });
});
