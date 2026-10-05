import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { paymentsPage } from "@/lib/retail/settings-pages/payments";
import { checkSettingsChanges } from "@/lib/retail/settings-pages";
import { readSettings, saveSettings, settingsAccess } from "@/lib/retail/settings";

import {
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
  it("lets the owner change everything and the manager the rate only", () => {
    const owner = settingsAccess(paymentsPage, ([resource, action]) =>
      ["retail.payments:update", "retail.zig-rate:update"].includes(`${resource}:${action}`),
    );
    const manager = settingsAccess(paymentsPage, ([resource, action]) => `${resource}:${action}` === "retail.zig-rate:update");
    const bookkeeper = settingsAccess(paymentsPage, () => false);
    expect(owner).toEqual({ all: true, fields: [] });
    expect(manager).toEqual({ all: false, fields: ["zigRate", "zigSource"] });
    expect(bookkeeper).toEqual({ all: false, fields: [] });
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
  const managerAccess = { all: false, fields: ["zigRate", "zigSource"] };

  it("reads the defaults before anything is saved, and refuses ZiG with no rate", async () => {
    const settings = await loadPaymentSettings(companyId);
    expect(settings.tenders).toMatchObject({ cashUsd: true, cashZig: true, ecocash: true, innbucks: false });
    await saveSettings(owner(), "payments", { cashZig: false });
    expect(await saveSettings(owner(), "payments", { cashZig: true }).catch((error: Error) => error.message)).toBe(
      "Set today’s rate to take ZiG.",
    );
    await expect(paymentRate(companyId, "USD", "ZWG")).rejects.toBeInstanceOf(NoZigRate);
  });

  it("saves the owner's tenders and rate: the rate as its own row and event", async () => {
    const saved = await saveSettings(owner(), "payments", {
      cashZig: true,
      card: true,
      bankTransfer: true,
      zigRate: "26.80",
      ecocashMerchantCode: "0921 774",
      ecocashDisplayName: "harare bottle",
    });
    expect(saved).toMatchObject({ ok: true });
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

  it("lets the manager change the rate, and nothing else", async () => {
    expect(await saveSettings(manager(), "payments", { innbucks: true }, managerAccess)).toEqual({
      ok: false,
      forbidden: "Your role can change the ZiG rate only.",
    });
    const saved = await saveSettings(manager(), "payments", { zigRate: "27.10" }, managerAccess);
    expect(saved).toMatchObject({ ok: true, lastChanged: { by: "Tafara Nyathi", what: "rate" } });
    const rows = await prisma.currencyRate.findMany({ where: { companyId }, orderBy: { effectiveDate: "asc" } });
    expect(rows.map((row) => row.rate)).toEqual([26.8, 27.1]);
    expect(rows[1]!.createdById).toBe(managerId);
    const event = await prisma.platformAuditEvent.findFirst({
      where: { companyId, eventType: "RETAIL_ZIG_RATE.SET", actor: managerId },
      select: { payloadJson: true },
    });
    expect(JSON.parse(event!.payloadJson!)).toMatchObject({ rate: "27.10", previous: "26.80" });

    const read = await readSettings(companyId, "payments", managerAccess);
    expect(read).toMatchObject({ canEdit: true, editable: ["zigRate", "zigSource"], values: { zigRate: "27.10" } });
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
