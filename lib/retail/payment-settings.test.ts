import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { paymentsPage } from "@/lib/retail/settings-pages/payments";
import { checkSettingsChanges } from "@/lib/retail/settings-pages";
import { readSettings, saveSettings } from "@/lib/retail/settings";

import {
  changeZigRate,
  latestZigRate,
  loadPaymentSettings,
  NoZigRate,
  ON_ACCOUNT_NOT_AT_THE_TILL,
  paymentRate,
  tenderOffProblem,
  tillPayments,
  tillTenders,
} from "./payment-settings";

describe("the Payments page's rules", () => {
  it("saves the settings itself and the rate through its own action", () => {
    expect(paymentsPage.change).toEqual(["retail.payments", "update"]);
    expect(paymentsPage.action).toEqual({
      fields: ["zigRate", "zigSource"],
      endpoint: "/api/v2/retail/payments/zig-rate",
      can: ["retail.zig-rate", "update"],
    });
  });

  it("checks the rate, the rounding and the merchant", () => {
    expect(checkSettingsChanges(paymentsPage, { zigRate: "0", zigRounding: "Nearest 2", ecocashMerchantCode: "EC-1" })).toEqual({
      ok: false,
      fieldErrors: {
        zigRate: "The rate must be more than nothing.",
        zigRounding: "Choose 0.50, 1 or 5.",
        ecocashMerchantCode: "Use digits and spaces only.",
      },
    });
    expect(checkSettingsChanges(paymentsPage, { ecocashDisplayName: "harare bottle " })).toEqual({
      ok: true,
      values: { ecocashDisplayName: "HARARE BOTTLE" },
    });
  });

  it("hints the EcoCash merchant, or asks for it", () => {
    const ecocash = paymentsPage.sections[0]!.fields.find((field) => field.id === "ecocash")!;
    const hint = ecocash.h as (values: Record<string, unknown>) => string;
    expect(hint({ ecocashMerchantCode: "0921 774" })).toBe("Merchant 0921 774. The cashier types the confirmation code.");
    expect(hint({ ecocashMerchantCode: "" })).toBe("Add your merchant code below.");
  });
});

describe("saving Payments and taking ZiG", () => {
  let companyId: string;
  let ownerId: string;
  let managerId: string;

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    companyId = (
      await prisma.company.create({ data: { name: `Payments ${stamp}`, slug: `payments-${stamp}` }, select: { id: true } })
    ).id;
    ownerId = (
      await prisma.user.create({
        data: { email: `owner-${stamp}@shop.test`, name: "Tendai Mhlanga", role: "SUPERADMIN", companyId },
        select: { id: true },
      })
    ).id;
    managerId = (
      await prisma.user.create({
        data: { email: `manager-${stamp}@shop.test`, name: "Tafara Nyathi", role: "MANAGER", companyId },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (!companyId) return;
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
    await prisma.currencyRate.deleteMany({ where: { companyId } });
    await prisma.retailPaymentSettings.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  });

  const owner = () => ({ companyId, userId: ownerId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" });
  const manager = () => ({ companyId, userId: managerId, userName: "Tafara Nyathi", userRole: "MANAGER" });

  it("reads the defaults before anything is saved, and refuses ZiG with no rate", async () => {
    const settings = await loadPaymentSettings(companyId);
    expect(settings.tenders).toMatchObject({ cashUsd: true, cashZig: true, ecocash: true, innbucks: false });
    await saveSettings(owner(), "payments", { cashZig: false });
    expect(await saveSettings(owner(), "payments", { cashZig: true }).catch((error: Error) => error.message)).toBe(
      "Set today’s rate to take ZiG.",
    );
    await expect(paymentRate(companyId, "USD", "ZWG")).rejects.toBeInstanceOf(NoZigRate);
  });

  it("keeps the rate out of the settings save: it is its own action", async () => {
    expect(await saveSettings(owner(), "payments", { zigRate: "26.80", card: true })).toEqual({
      ok: false,
      fieldErrors: { zigRate: "This is saved on its own, not with the page." },
    });
  });

  it("saves the owner's rate, then tenders: the rate as its own row and event", async () => {
    await changeZigRate(owner(), { rate: "26.80" });
    const saved = await saveSettings(owner(), "payments", {
      cashZig: true,
      card: true,
      bankTransfer: true,
      ecocashMerchantCode: "0921 774",
      ecocashDisplayName: "harare bottle",
    });
    expect(saved).toMatchObject({ ok: true, lastChanged: { by: "Tendai Mhlanga" } });
    const rate = await latestZigRate(companyId);
    expect(rate).toMatchObject({ rate: "26.80", setBy: "Tendai Mhlanga", source: "MANUAL" });
    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId, entityId: "payments" },
      orderBy: { createdAt: "desc" },
      select: { eventType: true, payloadJson: true },
    });
    expect(events.filter((event) => event.eventType === "RETAIL_ZIG_RATE.SET")).toHaveLength(1);
    const settingsEvent = events.find((event) => event.eventType === "RETAIL_SETTINGS.CHANGED")!;
    const fields = (JSON.parse(settingsEvent.payloadJson!) as { changes: Array<{ field: string }> }).changes.map((c) => c.field);
    expect(fields).not.toContain("zigRate");
    expect((await loadPaymentSettings(companyId)).ecocashDisplayName).toBe("HARARE BOTTLE");
  });

  it("records the manager's new rate as history, and says so on the page", async () => {
    await changeZigRate(manager(), { rate: "27.10" });
    // The same rate again writes nothing.
    await changeZigRate(manager(), { rate: "27.1" });
    const rows = await prisma.currencyRate.findMany({ where: { companyId }, orderBy: { effectiveDate: "asc" } });
    expect(rows.map((row) => row.rate)).toEqual([26.8, 27.1]);
    expect(rows[1]!.createdById).toBe(managerId);
    const event = await prisma.platformAuditEvent.findFirst({
      where: { companyId, eventType: "RETAIL_ZIG_RATE.SET", actor: managerId },
      select: { payloadJson: true },
    });
    expect(JSON.parse(event!.payloadJson!)).toMatchObject({ rate: "27.10", previous: "26.80" });

    const read = await readSettings(companyId, "payments", false);
    expect(read).toMatchObject({
      canEdit: false,
      values: { zigRate: "27.10", zigSetBy: "Tafara Nyathi" },
      lastChanged: { by: "Tafara Nyathi", what: "rate" },
    });
  });

  it("changes how the rate is updated, and refuses a typed rate while the RBZ sets it", async () => {
    await changeZigRate(manager(), { source: "RBZ_DAILY" });
    expect((await loadPaymentSettings(companyId)).zigRateSource).toBe("RBZ_DAILY");
    await expect(changeZigRate(manager(), { rate: "28" })).rejects.toThrow("The RBZ sets the rate while it is updated daily.");
    await changeZigRate(manager(), { source: "MANUAL" });
    const sources = await prisma.platformAuditEvent.findMany({
      where: { companyId, eventType: "RETAIL_ZIG_RATE.SET", payloadJson: { contains: "previousSource" } },
      orderBy: { createdAt: "asc" },
      select: { payloadJson: true },
    });
    expect(sources.map((event) => JSON.parse(event.payloadJson!).source)).toEqual(["RBZ_DAILY", "MANUAL"]);
  });

  it("refuses to turn every tender off", async () => {
    const all = Object.fromEntries(
      ["cashUsd", "cashZig", "card", "ecocash", "innbucks", "bankTransfer", "onAccount", "vouchers"].map((id) => [id, false]),
    );
    await expect(saveSettings(owner(), "payments", all)).rejects.toThrow("Take at least one tender.");
  });

  it("gives the till the tenders that are on, in order, with today's rate", async () => {
    await saveSettings(owner(), "payments", { innbucks: true, onAccount: true, zigRounding: "Nearest 5" });
    const till = await tillPayments(companyId);
    expect(till.tenders.map((tender) => tender.label)).toEqual([
      "Cash US$",
      "Cash ZiG",
      "Card",
      "EcoCash",
      "InnBucks",
      "Bank transfer",
    ]);
    expect(till.zig).toMatchObject({ rate: "27.10", rounding: "5" });
    const settings = await loadPaymentSettings(companyId);
    expect(tillTenders(settings).some((tender) => tender.tender === "ON_ACCOUNT")).toBe(false);
  });

  it("refuses a tender that is off, and on account at the till", async () => {
    const settings = await loadPaymentSettings(companyId);
    expect(tenderOffProblem(settings, "VOUCHER", null)).toBe("Vouchers is turned off in Payments.");
    expect(tenderOffProblem(settings, "CASH", "ZWG")).toBeNull();
    expect(tenderOffProblem(settings, "ON_ACCOUNT", null)).toBe(ON_ACCOUNT_NOT_AT_THE_TILL);
  });

  it("stamps the shop's rate on a ZiG payment, and its inverse on dollars in a ZiG shop", async () => {
    expect((await paymentRate(companyId, "USD", "USD")).toString()).toBe("1");
    expect((await paymentRate(companyId, "USD", "ZWG")).toNumber()).toBe(27.1);
    expect((await paymentRate(companyId, "ZWG", "USD")).toFixed(4)).toBe("0.0369");
  });
});
