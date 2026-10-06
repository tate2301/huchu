import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getApprovalLimits } from "./limits";
import { approvalAskText, notifyApprover } from "./notify";

/**
 * Asking for an approval against the test database (80-admin 3.5, ADM-04):
 * the owner approver named on Approvals is asked, in the app always and on
 * WhatsApp when "Ask by" says so; with nobody named, every active owner.
 */

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let tendaiId: string;
let secondOwnerId: string;
let managerId: string;
let mainId: string;
let borrowdaleId: string;
const TENDAI_PHONE = "+263774120098";

let phoneSeq = Math.floor(Math.random() * 9_000_000) + 1_000_000;
const phone = () => `+26371${String(phoneSeq++).padStart(7, "0").slice(-7)}`;

const ask = (level: "owner" | "manager", entityId: string, siteId?: string) => ({
  companyId,
  level,
  siteId,
  type: "RETAIL_PRICE_APPROVAL" as const,
  title: "Price changes wait for you",
  summary: "Tafara Nyathi changed 2 prices on Retail.",
  entityType: "RETAIL_PRICE_APPROVAL" as const,
  entityId,
  viewPath: `/retail/manage/approvals?sheet=price-approval&id=${entityId}`,
  requestUrl: "http://localhost:3000/retail/products",
});

async function notified(entityId: string) {
  const rows = await prisma.notification.findMany({
    where: { companyId, entityId },
    include: { recipients: { select: { userId: true } } },
  });
  return rows;
}

async function messages() {
  return prisma.retailMessage.findMany({ where: { companyId, template: "approval-ask" }, orderBy: { createdAt: "asc" } });
}

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `Approvals ${stamp}`, slug: `approvals-${stamp}` } });
  companyId = company.id;
  const [main, borrowdale] = await Promise.all([
    prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" } }),
    prisma.site.create({ data: { companyId, name: "Borrowdale", code: "BDL" } }),
  ]);
  mainId = main.id;
  borrowdaleId = borrowdale.id;
  tendaiId = (
    await prisma.user.create({
      data: { companyId, name: "Tendai Mhlanga", email: `owner-${stamp}@approvals.test`, role: "SUPERADMIN", phone: TENDAI_PHONE },
    })
  ).id;
  secondOwnerId = (
    await prisma.user.create({
      data: { companyId, name: "Rumbi Mhlanga", email: `owner2-${stamp}@approvals.test`, role: "SUPERADMIN", phone: phone() },
    })
  ).id;
  managerId = (
    await prisma.user.create({
      data: {
        companyId,
        name: "Tafara Nyathi",
        email: `manager-${stamp}@approvals.test`,
        role: "MANAGER",
        phone: phone(),
        allSites: false,
        siteAccess: { create: { siteId: mainId, companyId } },
      },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.retailMessage.deleteMany({ where: { companyId } });
});

afterAll(async () => {
  if (!companyId) return;
  const users = await prisma.user.findMany({ where: { companyId }, select: { id: true } });
  await prisma.notificationRecipient.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.retailApprovalSettings.deleteMany({ where: { companyId } });
  await prisma.userSiteAccess.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("getApprovalLimits", () => {
  it("answers the defaults for a shop that never saved Approvals, the first owner as approver", async () => {
    const limits = await getApprovalLimits(companyId);
    expect({
      requisitionOwnerOver: limits.requisitionOwnerOver.toFixed(2),
      ownerApproverId: limits.ownerApproverId,
      ownerApprover: limits.ownerApprover?.id,
      priceChanges: limits.priceChanges,
      belowCostNeedsOwner: limits.belowCostNeedsOwner,
      adjustmentPinOver: limits.adjustmentPinOver.toFixed(2),
      countDifferences: limits.countDifferences,
      countOwnerOver: limits.countOwnerOver.toFixed(2),
      accountOwnerOver: limits.accountOwnerOver.toFixed(2),
      askBy: limits.askBy,
    }).toEqual({
      requisitionOwnerOver: "500.00",
      ownerApproverId: null,
      ownerApprover: tendaiId,
      priceChanges: "MANAGERS",
      belowCostNeedsOwner: true,
      adjustmentPinOver: "50.00",
      countDifferences: "OWNER_OVER_LIMIT",
      countOwnerOver: "100.00",
      accountOwnerOver: "250.00",
      askBy: "WHATSAPP_AND_APP",
    });
  });
});

describe("notifyApprover", () => {
  it("with nobody named, asks every active owner", async () => {
    const result = await notifyApprover(ask("owner", `none-${stamp}`));
    expect(result.recipientIds.sort()).toEqual([tendaiId, secondOwnerId].sort());
    const [row] = await notified(`none-${stamp}`);
    expect(row?.recipients.map((r) => r.userId).sort()).toEqual([tendaiId, secondOwnerId].sort());
    expect(await messages()).toHaveLength(2);
  });

  it("with WhatsApp and the app, an owner-level ask is one notification and one approval-ask to Tendai Mhlanga's phone", async () => {
    await prisma.retailApprovalSettings.upsert({
      where: { companyId },
      update: { ownerApproverId: tendaiId, askBy: "WHATSAPP_AND_APP" },
      create: { companyId, ownerApproverId: tendaiId, askBy: "WHATSAPP_AND_APP" },
    });
    await notifyApprover(ask("owner", `wa-${stamp}`));
    const rows = await notified(`wa-${stamp}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipients.map((r) => r.userId)).toEqual([tendaiId]);
    expect(rows[0]!.title).toBe("Price changes wait for you");
    const sent = await messages();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ channel: "WHATSAPP", to: TENDAI_PHONE, template: "approval-ask", status: "QUEUED" });
    expect(sent[0]!.body).toBe(
      `Price changes wait for you. Tafara Nyathi changed 2 prices on Retail. Open it: http://localhost:3000/retail/manage/approvals?sheet=price-approval&id=wa-${stamp}`,
    );
  });

  it("with the app only, sends no message", async () => {
    await prisma.retailApprovalSettings.update({ where: { companyId }, data: { askBy: "APP" } });
    const result = await notifyApprover(ask("owner", `app-${stamp}`));
    expect(result).toEqual({ recipientIds: [tendaiId], whatsapp: 0 });
    expect(await notified(`app-${stamp}`)).toHaveLength(1);
    expect(await messages()).toHaveLength(0);
  });

  it("asks every owner when the named approver no longer has access", async () => {
    await prisma.retailApprovalSettings.update({ where: { companyId }, data: { askBy: "APP" } });
    await prisma.user.update({ where: { id: tendaiId }, data: { isActive: false } });
    try {
      const result = await notifyApprover(ask("owner", `gone-${stamp}`));
      expect(result.recipientIds).toEqual([secondOwnerId]);
      expect((await getApprovalLimits(companyId)).ownerApprover?.id).toBe(secondOwnerId);
    } finally {
      await prisma.user.update({ where: { id: tendaiId }, data: { isActive: true } });
    }
  });

  it("a manager-level ask reaches the owners and the managers who work at the site", async () => {
    await prisma.retailApprovalSettings.update({ where: { companyId }, data: { askBy: "APP" } });
    const atMain = await notifyApprover(ask("manager", `main-${stamp}`, mainId));
    expect(atMain.recipientIds.sort()).toEqual([tendaiId, secondOwnerId, managerId].sort());
    const atBorrowdale = await notifyApprover(ask("manager", `bdl-${stamp}`, borrowdaleId));
    expect(atBorrowdale.recipientIds.sort()).toEqual([tendaiId, secondOwnerId].sort());
  });
});

describe("approvalAskText", () => {
  it("reads title, summary and the link", () => {
    expect(approvalAskText("Price changes wait for you", "Two prices.", "https://x/y")).toBe(
      "Price changes wait for you. Two prices. Open it: https://x/y",
    );
  });
});
