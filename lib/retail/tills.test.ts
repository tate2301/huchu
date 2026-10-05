import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { PairingRefusal, hashCode } from "./pairing";
import {
  cancelTillCode,
  createTill,
  deleteTill,
  getTill,
  issueTillCode,
  listTills,
  pairingCodeInput,
  sendTillMessages,
  tillMessageInput,
  tillPairing,
  unpairTill,
  updateTill,
} from "./tills";
import type { RetailAuditActor } from "./audit";

/** W-04 and W-76 from the back office, against the test database, on a shop with the Grow plan (8 paired tills). */

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let otherCompanyId: string;
let ownerId: string;
let planId: string;
let mainId: string;
let borrowdaleId: string;

const actor = (): RetailAuditActor => ({ companyId, userId: ownerId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" });

async function refusal(promise: Promise<unknown>): Promise<PairingRefusal> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PairingRefusal) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

/** What the device does with a code (SET-04's `devices/pair`), enough for the back office to see it. */
async function redeem(registerId: string, code: string, kind: "COUNTER_MINI" | "KORA" | "BROWSER" = "BROWSER") {
  const live = await prisma.retailPairingCode.findFirstOrThrow({
    where: { companyId, codeHash: hashCode(companyId, code), usedAt: null, expiresAt: { gt: new Date() } },
  });
  return prisma.$transaction(async (tx) => {
    if (live.purpose === "REPLACE") {
      await tx.retailDevice.updateMany({
        where: { registerId, unpairedAt: null },
        data: { unpairedAt: new Date(), unpairReason: "REPLACED", unpairedById: live.createdById },
      });
    }
    const device = await tx.retailDevice.create({
      data: {
        companyId,
        registerId,
        kind,
        label: kind === "BROWSER" ? "Windows PC" : null,
        keyHash: createHash("sha256").update(randomUUID()).digest("hex"),
        appVersion: "4.12.0",
        pairedById: live.createdById,
        lastSeenAt: new Date(),
      },
    });
    await tx.retailPairingCode.update({ where: { id: live.id }, data: { usedAt: new Date(), deviceId: device.id } });
    return device;
  });
}

/** A paired till straight in the database. */
async function pairedTill(name: string, siteId = mainId, kind: "COUNTER_MINI" | "KORA" | "BROWSER" = "COUNTER_MINI", lastSeenAt: Date | null = new Date()) {
  const till = await prisma.retailRegister.create({
    data: { companyId, siteId, code: `T-${randomUUID().slice(0, 8)}`, name, deviceKind: kind },
    select: { id: true, code: true },
  });
  await prisma.retailDevice.create({
    data: {
      companyId,
      registerId: till.id,
      kind,
      keyHash: createHash("sha256").update(randomUUID()).digest("hex"),
      pairedById: ownerId,
      lastSeenAt,
      appVersion: "4.12.0",
    },
  });
  return till;
}

const events = (entityId: string) =>
  prisma.platformAuditEvent.findMany({ where: { companyId, entityId }, orderBy: { createdAt: "asc" }, select: { eventType: true, payloadJson: true } });

beforeAll(async () => {
  const [shop, rival] = await Promise.all([
    prisma.company.create({ data: { name: `Tills ${stamp}`, slug: `tills-${stamp}` }, select: { id: true } }),
    prisma.company.create({ data: { name: `Tills rival ${stamp}`, slug: `tills-rival-${stamp}` }, select: { id: true } }),
  ]);
  companyId = shop.id;
  otherCompanyId = rival.id;
  ownerId = (
    await prisma.user.create({
      data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@tills.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  planId = (
    await prisma.subscriptionPlan.create({
      data: { code: `TEST-GROW-${stamp}`, name: "Grow", monthlyPrice: 49, maxSites: 3, maxTills: 8 },
      select: { id: true },
    })
  ).id;
  await prisma.companySubscription.create({ data: { companyId, planId, status: "ACTIVE" } });
  const retail = await prisma.priceList.create({ data: { companyId, name: "Retail", isDefault: true }, select: { id: true } });
  await prisma.priceList.create({ data: { companyId, name: "Wholesale" } });
  mainId = (
    await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE", priceListId: retail.id }, select: { id: true } })
  ).id;
  borrowdaleId = (await prisma.site.create({ data: { companyId, name: "Borrowdale", code: "BDL" }, select: { id: true } })).id;
  await prisma.retailShopProfile.create({ data: { companyId, defaultSiteId: mainId } });
});

afterAll(async () => {
  const ids = [companyId, otherCompanyId].filter(Boolean);
  await prisma.retailDeviceMessage.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.retailPairingCode.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.retailDevice.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.retailShift.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.retailRegister.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.site.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.priceList.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.companySubscription.deleteMany({ where: { companyId: { in: ids } } });
  if (planId) await prisma.subscriptionPlan.delete({ where: { id: planId } });
  await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
});

describe("Pair a till (W-04)", () => {
  let tillId: string;
  let code: string;

  it("makes the till at the default site and a six-digit code, keeping only the code's hash", async () => {
    const made = await createTill(actor(), { deviceKind: "COUNTER_MINI" });
    tillId = made.data.id;
    code = made.code;
    expect(code).toMatch(/^\d{6}$/);
    expect(new Date(made.expiresAt).getTime() - Date.now()).toBeGreaterThan(9 * 60 * 1000);
    expect(made.data).toMatchObject({
      name: "Till 1",
      site: { id: mainId, name: "Harare Main Branch" },
      device: "No device yet",
      state: "NOT_PAIRED",
      hasPrinter: true,
      hasDrawer: true,
      hasScale: false,
      siteCount: 2,
      sub: "Harare Main Branch · not paired",
    });
    const stored = await prisma.retailPairingCode.findMany({ where: { registerId: tillId } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ purpose: "PAIR", codeHash: hashCode(companyId, code), usedAt: null });
    expect(JSON.stringify(stored)).not.toContain(code);
    // Nothing is recorded until Done.
    expect(await events(tillId)).toEqual([]);
  });

  it("waits, then runs out after 10 minutes, and a new code expires the old one", async () => {
    expect(await tillPairing(companyId, tillId)).toMatchObject({ state: "waiting" });
    expect(await tillPairing(companyId, tillId, new Date(Date.now() + 11 * 60 * 1000))).toMatchObject({ state: "expired" });
    const fresh = await issueTillCode(actor(), tillId, "PAIR");
    expect(fresh.code).not.toBe(code);
    const live = await prisma.retailPairingCode.findMany({ where: { registerId: tillId, usedAt: null, expiresAt: { gt: new Date() } } });
    expect(live.map((row) => row.codeHash)).toEqual([hashCode(companyId, fresh.code)]);
    code = fresh.code;
  });

  it("Done saves what was chosen and records the till as created; later saves record each change", async () => {
    const saved = await updateTill(actor(), tillId, { name: "Cold room till", deviceKind: "KORA", hasScale: true });
    expect(saved).toMatchObject({ name: "Cold room till", deviceKind: "KORA", hasScale: true });
    await updateTill(actor(), tillId, { siteId: borrowdaleId });
    const recorded = await events(tillId);
    expect(recorded.map((event) => event.eventType)).toEqual(["RETAIL_TILL.CREATED", "RETAIL_TILL.CHANGED"]);
    expect(JSON.parse(String(recorded[1]!.payloadJson))).toMatchObject({ changes: { site: { from: "Harare Main Branch", to: "Borrowdale" } } });
  });

  it("refuses a name another till at that site has", async () => {
    await pairedTill("Front till", borrowdaleId);
    const clash = await refusal(updateTill(actor(), tillId, { name: "front till" }));
    expect(clash).toMatchObject({ status: 409, message: "There is already a till called Front till at Borrowdale.", opts: { field: "name" } });
  });

  it("shows the device once it redeems the code, and flips the state", async () => {
    await redeem(tillId, code, "KORA");
    const pairing = await tillPairing(companyId, tillId);
    expect(pairing).toMatchObject({ state: "paired", device: { kind: "KORA", label: "Kora", appVersion: "4.12.0" } });
    const till = await getTill(companyId, tillId);
    expect(till).toMatchObject({ device: "Kora", state: "CLOSED", current: { label: "Kora", pairedBy: "Tendai Mhlanga" } });
  });

  it("Cancel removes a till that never paired, and keeps one that did", async () => {
    const spare = await createTill(actor(), { name: "Spare", deviceKind: "BROWSER" });
    await deleteTill(actor(), spare.data.id);
    expect(await prisma.retailRegister.findUnique({ where: { id: spare.data.id } })).toBeNull();
    expect(await prisma.retailPairingCode.count({ where: { registerId: spare.data.id } })).toBe(0);
    expect(await refusal(deleteTill(actor(), tillId))).toMatchObject({ status: 409, opts: { code: "TILL_USED" } });
  });

  it("Cancel on a code stops it working", async () => {
    const spare = await createTill(actor(), { name: "Spare two", deviceKind: "COUNTER_MINI" });
    await cancelTillCode(actor(), spare.data.id);
    expect(await tillPairing(companyId, spare.data.id)).toMatchObject({ state: "expired" });
    await deleteTill(actor(), spare.data.id);
  });

  it("will not touch another shop's till", async () => {
    const rival = { ...actor(), companyId: otherCompanyId };
    expect(await refusal(issueTillCode(rival, tillId, "PAIR"))).toMatchObject({ status: 404 });
    expect(await getTill(otherCompanyId, tillId)).toBeNull();
  });
});

describe("the plan's till limit (C-07), on Grow", () => {
  it("refuses a ninth paired till, before it is made or a code issued, and still lets a paired till swap its device", async () => {
    const paired = await prisma.retailDevice.count({ where: { companyId, unpairedAt: null } });
    const extra: Array<{ id: string }> = [];
    for (let n = paired; n < 8; n += 1) extra.push(await pairedTill(`Paired ${n}`));
    expect(await prisma.retailDevice.count({ where: { companyId, unpairedAt: null } })).toBe(8);

    const tills = await prisma.retailRegister.count({ where: { companyId } });
    const ninth = await refusal(createTill(actor(), { name: "Ninth", deviceKind: "COUNTER_MINI" }));
    expect(ninth).toMatchObject({ status: 409, message: "Your Grow plan has 8 tills, all paired.", opts: { code: "PLAN_LIMIT" } });
    expect(await prisma.retailRegister.count({ where: { companyId } })).toBe(tills);

    const unpaired = await prisma.retailRegister.create({ data: { companyId, siteId: mainId, code: `T-none-${stamp}`, name: "No device" } });
    expect(await refusal(issueTillCode(actor(), unpaired.id, "PAIR"))).toMatchObject({ opts: { code: "PLAN_LIMIT" } });
    expect((await issueTillCode(actor(), extra[0]!.id, "REPLACE")).code).toMatch(/^\d{6}$/);

    // One unpaired makes room again.
    await unpairTill(actor(), extra[0]!.id);
    expect((await issueTillCode(actor(), unpaired.id, "PAIR")).code).toMatch(/^\d{6}$/);
  });
});

describe("Pair another device and Unpair (W-76)", () => {
  it("a REPLACE code swaps the device: the old one stops when the new one pairs", async () => {
    const till = await pairedTill("Back till", mainId, "BROWSER");
    const old = await prisma.retailDevice.findFirstOrThrow({ where: { registerId: till.id } });
    expect(await refusal(issueTillCode(actor(), till.id, "PAIR"))).toMatchObject({ opts: { code: "PAIRED" } });
    const { code } = await issueTillCode(actor(), till.id, "REPLACE");
    expect(await tillPairing(companyId, till.id)).toMatchObject({ state: "waiting" });
    const fresh = await redeem(till.id, code, "COUNTER_MINI");
    expect(await prisma.retailDevice.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ unpairReason: "REPLACED" });
    expect(await tillPairing(companyId, till.id)).toMatchObject({ state: "paired", device: { id: fresh.id, label: "CounterMini" } });
  });

  it("refuses Unpair while a shift is open on the till, with the sentence, then unpairs and records it", async () => {
    const till = await pairedTill("Front till", mainId);
    const shift = await prisma.retailShift.create({
      data: { companyId, siteId: mainId, shiftNo: `SH-${stamp}`, registerCode: till.code, registerName: "Front till", registerId: till.id, cashierId: ownerId, cashierName: "Chipo Dube" },
      select: { id: true },
    });
    const detail = await getTill(companyId, till.id);
    expect(detail).toMatchObject({ state: "SELLING", onItNow: "Chipo Dube", openShift: { cashier: "Chipo Dube" } });

    expect(await refusal(unpairTill(actor(), till.id))).toMatchObject({
      status: 409,
      message: "Close Chipo Dube’s shift on Front till first.",
      opts: { code: "SHIFT_OPEN" },
    });
    expect(await refusal(updateTill(actor(), till.id, { siteId: borrowdaleId }))).toMatchObject({ opts: { code: "SHIFT_OPEN" } });

    await prisma.retailShift.update({ where: { id: shift.id }, data: { status: "CLOSED", closedAt: new Date() } });
    const after = await unpairTill(actor(), till.id);
    expect(after).toMatchObject({ state: "NOT_PAIRED", device: "No device yet", current: null });
    const device = await prisma.retailDevice.findFirstOrThrow({ where: { registerId: till.id } });
    expect(device).toMatchObject({ unpairReason: "UNPAIRED", unpairedById: ownerId });
    expect((await events(till.id)).map((event) => event.eventType)).toEqual(["RETAIL_DEVICE.UNPAIRED"]);
    expect(await refusal(unpairTill(actor(), till.id))).toMatchObject({ opts: { code: "NOT_PAIRED" } });
  });
});

describe("the list and Send a message", () => {
  it("lists every working till with its state, and narrows by site, state and words", async () => {
    await pairedTill("Borrowdale till", borrowdaleId, "COUNTER_MINI", new Date(Date.now() - 2 * 60 * 60 * 1000 - 60 * 1000));
    const { data } = await listTills(companyId);
    const row = data.find((till) => till.name === "Borrowdale till")!;
    expect(row).toMatchObject({ site: { name: "Borrowdale" }, device: "CounterMini", state: "OFFLINE", stateLabel: "Offline 2 hours", onItNow: null });
    expect((await listTills(companyId, { siteId: borrowdaleId })).data.every((till) => till.site.id === borrowdaleId)).toBe(true);
    expect((await listTills(companyId, { state: "OFFLINE" })).data.map((till) => till.name)).toEqual(["Borrowdale till"]);
    expect((await listTills(companyId, { q: "kora" })).data.map((till) => till.name)).toEqual(["Cold room till"]);
    expect((await listTills(otherCompanyId)).data).toEqual([]);
  });

  it("lists the default site's tills first, then the other sites by name", async () => {
    const { data } = await listTills(companyId);
    const sites = data.map((till) => till.site.name);
    // Harare Main Branch is the default, so it comes before Borrowdale.
    expect(sites.indexOf("Borrowdale")).toBeGreaterThan(sites.lastIndexOf("Harare Main Branch"));
    expect(data.find((till) => till.site.name === "Harare Main Branch")?.site.isDefault).toBe(true);
    expect(data.find((till) => till.site.name === "Borrowdale")).toMatchObject({ site: { isDefault: false }, pairedKind: "COUNTER_MINI" });
  });

  it("sends one message per till and records each", async () => {
    const two = (await listTills(companyId)).data.slice(0, 2).map((till) => till.id);
    expect(await sendTillMessages(actor(), two, "Count the floats before 18:00.")).toEqual({ sent: 2 });
    const rows = await prisma.retailDeviceMessage.findMany({ where: { companyId, registerId: { in: two } } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.body === "Count the floats before 18:00." && row.sentById === ownerId && row.dismissedAt === null)).toBe(true);
    expect(await refusal(sendTillMessages({ ...actor(), companyId: otherCompanyId }, two, "Hello"))).toMatchObject({ status: 400 });
  });

  it("checks the message as the API reads it", () => {
    expect(tillMessageInput.safeParse({ tillIds: [randomUUID()], body: "x".repeat(281) }).error?.issues[0]?.message).toBe(
      "Keep the message to 280 characters.",
    );
    expect(tillMessageInput.safeParse({ tillIds: [], body: "Hi" }).success).toBe(false);
    expect(tillMessageInput.safeParse({ tillIds: [randomUUID()], body: "  " }).error?.issues[0]?.message).toBe("Write the message.");
  });

  it("answers a missing or malformed body in sentences, not zod's defaults", () => {
    const first = (schema: { safeParse: (value: unknown) => { error?: { issues: Array<{ message: string }> } } }, value: unknown) =>
      schema.safeParse(value).error?.issues.map((issue) => issue.message);
    expect(first(tillMessageInput, {})).toEqual(["Choose the tills.", "Write the message."]);
    expect(first(tillMessageInput, { tillIds: "a", body: 3 })).toEqual(["Choose the tills.", "Write the message."]);
    expect(first(tillMessageInput, [])).toEqual(["Send the tills and the message."]);
    expect(first(pairingCodeInput, { purpose: "SWAP" })).toEqual(["Say whether the code pairs a till or replaces its device."]);
    expect(first(pairingCodeInput, "PAIR")).toEqual(["Say whether the code pairs a till or replaces its device."]);
    expect(pairingCodeInput.parse({})).toEqual({ purpose: "PAIR" });
  });
});
