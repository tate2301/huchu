import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  ApprovalNeeded,
  ApprovalRefused,
  approvalFor,
  tillRuleResponse,
  verifyManagerPin,
} from "./manager-pin";
import { TillRuleRefused } from "./till-rules";

const NEEDS = { needsApprover: true as const, reason: "Refunds over US$20.00 need a manager PIN." };

describe("a manager's PIN approving at the till", () => {
  let companyId: string;
  let managerId: string;
  let cashierId: string;

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
    const pinHash = await bcrypt.hash("2580", 4);
    await prisma.retailTillPin.createMany({
      data: [
        { companyId, userId: managerId, pinHash },
        { companyId, userId: cashierId, pinHash },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.retailTillPin.updateMany({ where: { companyId }, data: { failedAttempts: 0, lockedUntil: null } });
  });

  afterAll(async () => {
    if (!companyId) return;
    await prisma.retailTillPin.deleteMany({ where: { companyId } });
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
      status: 400,
      field: "approver",
    });
    await expect(verifyManagerPin({ companyId, approver: { userId: managerId, pin: "1111" } })).rejects.toMatchObject({
      status: 400,
      field: "pin",
      message: "That PIN is not right.",
    });
    const pin = await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: managerId } });
    expect(pin.failedAttempts).toBe(1);
  });

  it("locks after five wrong tries and answers 423, even to the right PIN", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(verifyManagerPin({ companyId, approver: { userId: managerId, pin: "0000" } })).rejects.toMatchObject({
        status: 400,
      });
    }
    await expect(verifyManagerPin({ companyId, approver: { userId: managerId, pin: "0000" } })).rejects.toMatchObject({
      status: 423,
    });
    const locked = verifyManagerPin({ companyId, approver: { userId: managerId, pin: "2580" } });
    await expect(locked).rejects.toBeInstanceOf(ApprovalRefused);
    await expect(locked).rejects.toMatchObject({ status: 423 });
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
