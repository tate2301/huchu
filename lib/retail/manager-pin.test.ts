import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  ApprovalNeeded,
  ApprovalRefused,
  approvalFor,
  replayApproval,
  tillRuleResponse,
  verifyManagerPin,
} from "./manager-pin";
import { TILL_PIN_LOCKED } from "./till-pin";
import { TillRuleRefused } from "./till-rules";

const NEEDS = { needsApprover: true as const, reason: "Refunds over US$20.00 need a manager PIN." };

describe("a manager's PIN approving at the till", () => {
  let companyId: string;
  let managerId: string;
  let cashierId: string;
  let tillId: string;

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    companyId = (
      await prisma.company.create({ data: { name: `Manager PIN ${stamp}`, slug: `manager-pin-${stamp}` }, select: { id: true } })
    ).id;
    managerId = (
      await prisma.user.create({
        data: { email: `tafara-${stamp}@shop.test`, name: "Tafara Nyathi", role: "MANAGER", companyId },
        select: { id: true },
      })
    ).id;
    cashierId = (
      await prisma.user.create({
        data: { email: `chipo-${stamp}@shop.test`, name: "Chipo Dube", role: "CASHIER", companyId },
        select: { id: true },
      })
    ).id;
    const siteId = (
      await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: `HRE${stamp.slice(-4)}` }, select: { id: true } })
    ).id;
    tillId = (
      await prisma.retailRegister.create({ data: { companyId, siteId, code: `FT${stamp.slice(-4)}`, name: "Front till" }, select: { id: true } })
    ).id;
    const pinHash = await bcrypt.hash("2580", 4);
    await prisma.retailTillPin.createMany({
      data: [
        { companyId, userId: managerId, pinHash },
        { companyId, userId: cashierId, pinHash },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.retailTillPin.updateMany({ where: { companyId }, data: { failedAttempts: 0, lockedAt: null } });
  });

  afterAll(async () => {
    if (!companyId) return;
    await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
    await prisma.notification.deleteMany({ where: { companyId } });
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
    await prisma.retailTillPin.deleteMany({ where: { companyId } });
    await prisma.retailRegister.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("asks nothing when the rule does not, or the person holds the approve right", async () => {
    expect(await approvalFor({ companyId, actorRole: "CASHIER", decision: { needsApprover: false } })).toBeNull();
    expect(await approvalFor({ companyId, actorRole: "MANAGER", decision: NEEDS })).toBeNull();
  });

  it("answers 409 needsApprover when a cashier brings nobody", async () => {
    const asked = approvalFor({ companyId, actorRole: "CASHIER", decision: NEEDS });
    await expect(asked).rejects.toBeInstanceOf(ApprovalNeeded);
    const response = tillRuleResponse(new ApprovalNeeded(NEEDS.reason))!;
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: NEEDS.reason, needsApprover: true, reason: NEEDS.reason });
  });

  it("names the manager whose PIN matches", async () => {
    expect(
      await approvalFor({
        companyId,
        actorRole: "CASHIER",
        decision: NEEDS,
        approver: { userId: managerId, pin: "2580" },
      }),
    ).toEqual({ id: managerId, name: "Tafara Nyathi" });
  });

  it("refuses a cashier as the approver, and a wrong PIN, counting the miss", async () => {
    await expect(verifyManagerPin({ companyId, approver: { userId: cashierId, pin: "2580" } })).rejects.toMatchObject({
      status: 409,
      field: "approver",
    });
    await expect(verifyManagerPin({ companyId, approver: { userId: managerId, pin: "1111" } })).rejects.toMatchObject({
      status: 409,
      field: "pin",
      message: "That PIN is not right.",
    });
    const pin = await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: managerId } });
    expect(pin.failedAttempts).toBe(1);
  });

  it("answers a wrong or refused approval 409 needsApprover with the field (C-31), a locked PIN 423", async () => {
    const wrong = tillRuleResponse(new ApprovalRefused("That PIN is not right.", 409, "pin"))!;
    expect(wrong.status).toBe(409);
    expect(await wrong.json()).toEqual({
      error: "That PIN is not right.",
      needsApprover: true,
      reason: "That PIN is not right.",
      fieldErrors: { pin: "That PIN is not right." },
    });
    const notApprover = tillRuleResponse(new ApprovalRefused("Pick someone who can approve this.", 409, "approver"))!;
    expect(notApprover.status).toBe(409);
    expect(await notApprover.json()).toMatchObject({ needsApprover: true, fieldErrors: { approver: "Pick someone who can approve this." } });
    const locked = tillRuleResponse(new ApprovalRefused(TILL_PIN_LOCKED, 423, null))!;
    expect(locked.status).toBe(423);
    expect(await locked.json()).toEqual({ error: "Too many tries. Ask a manager to send you a new PIN." });
  });

  it("locks after five wrong tries at a till, naming the till, and answers 423, even to the right PIN", async () => {
    const atTheTill = () =>
      approvalFor({ companyId, actorRole: "CASHIER", decision: NEEDS, approver: { userId: managerId, pin: "0000" }, place: { registerId: tillId } });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(atTheTill()).rejects.toMatchObject({ status: 409 });
    }
    await expect(atTheTill()).rejects.toMatchObject({ status: 423 });
    const locked = verifyManagerPin({ companyId, approver: { userId: managerId, pin: "2580" } });
    await expect(locked).rejects.toBeInstanceOf(ApprovalRefused);
    await expect(locked).rejects.toMatchObject({ status: 423, message: "Too many tries. Ask a manager to send you a new PIN." });
    const later = verifyManagerPin({ companyId, approver: { userId: managerId, pin: "2580" }, now: new Date(Date.now() + 86_400_000) });
    await expect(later).rejects.toMatchObject({ status: 423 });
    const events = await prisma.platformAuditEvent.findMany({ where: { companyId, entityId: managerId, eventType: "RETAIL_PIN.LOCKED" } });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!.payloadJson ?? "{}")).toMatchObject({ registerName: "Front till", source: "TILL" });
    const notification = await prisma.notification.findFirstOrThrow({ where: { companyId, type: "RETAIL_PIN_LOCKED" } });
    expect(notification.summary).toMatch(/^Five wrong tries at Front till, /);
  });

  it("lets an act sent in late through: approved when its approver checks out, else marked for review", async () => {
    const review = (reason: string) => `Offline: ${reason}`;
    expect(
      await replayApproval({ companyId, actorRole: "CASHIER", decision: NEEDS, approver: { userId: managerId, pin: "2580" }, review }),
    ).toEqual({ approvedBy: { id: managerId, name: "Tafara Nyathi" }, review: null });
    expect(await replayApproval({ companyId, actorRole: "CASHIER", decision: NEEDS, review })).toEqual({
      approvedBy: null,
      review: `Offline: ${NEEDS.reason}`,
    });
    expect(
      await replayApproval({ companyId, actorRole: "CASHIER", decision: NEEDS, approver: { userId: managerId, pin: "9999" }, review }),
    ).toEqual({ approvedBy: null, review: `Offline: ${NEEDS.reason}` });
    expect(await replayApproval({ companyId, actorRole: "CASHIER", decision: { needsApprover: false }, review })).toEqual({
      approvedBy: null,
      review: null,
    });
  });

  it("answers a reason off the list with 400 under it", async () => {
    const response = tillRuleResponse(new TillRuleRefused("Pick a reason from the list.", "reason"))!;
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Pick a reason from the list.",
      fieldErrors: { reason: "Pick a reason from the list." },
    });
    expect(tillRuleResponse(new Error("other"))).toBeNull();
  });
});
