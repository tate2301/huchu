import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import { rolesView } from "@/lib/retail/roles-matrix";

import { readSettings, saveSettings } from "./index";
import { SettingsRefused } from "./types";

/**
 * Management › Approvals saved through the settings contract (80-admin W-58):
 * the board's values read back, a changed limit saved with one
 * `RETAIL_SETTINGS.CHANGED`, read by `getApprovalLimits` and the Roles sheet,
 * and the page's refusals.
 */

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let ownerId: string;
let managerId: string;

const actor = () => ({ companyId, userId: ownerId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" });

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Limits ${stamp}`, slug: `limits-${stamp}` } })).id;
  ownerId = (
    await prisma.user.create({
      data: { companyId, name: "Tendai Mhlanga", email: `owner-${stamp}@limits.test`, role: "SUPERADMIN" },
    })
  ).id;
  managerId = (
    await prisma.user.create({
      data: { companyId, name: "Tafara Nyathi", email: `manager-${stamp}@limits.test`, role: "MANAGER" },
    })
  ).id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.retailApprovalSettings.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("the Approvals page", () => {
  it("reads the defaults, in the page's words, before anything is saved", async () => {
    const read = await readSettings(companyId, "approvals", true);
    expect(read).toEqual({
      canEdit: true,
      lastChanged: null,
      values: {
        requisitionOwnerOver: "500.00",
        ownerApproverId: null,
        priceChanges: "Managers, no approval",
        belowCostNeedsOwner: true,
        adjustmentPinOver: "50.00",
        countDifferences: "Owner approves over US$100",
        accountOwnerOver: "250.00",
        askBy: "WhatsApp and the app",
        countDifferencesOptions: ["Any manager", "Owner approves over US$100"],
      },
    });
  });

  it("saves a new requisition limit and an approver; the limits and the Roles sheet follow", async () => {
    const saved = await saveSettings(actor(), "approvals", {
      requisitionOwnerOver: "750",
      ownerApproverId: { id: ownerId, label: "Tendai Mhlanga", sub: "Owner" },
      countDifferences: "Any manager",
      askBy: "The app only",
    });
    expect(saved).toMatchObject({
      ok: true,
      values: {
        requisitionOwnerOver: "750.00",
        ownerApproverId: { id: ownerId, label: "Tendai Mhlanga", sub: "Owner" },
        countDifferences: "Any manager",
        askBy: "The app only",
      },
      lastChanged: { by: "Tendai Mhlanga" },
    });
    const limits = await getApprovalLimits(companyId);
    expect(limits.requisitionOwnerOver.toFixed(2)).toBe("750.00");
    expect(limits.ownerApproverId).toBe(ownerId);
    expect(limits.countDifferences).toBe("ANY_MANAGER");
    expect(limits.askBy).toBe("APP");
    const requisitions = rolesView(limits)
      .sections.flatMap((section) => section.rows)
      .find((row) => row.label === "Requisitions");
    expect(requisitions?.limit).toBe("Managers approve up to US$750.");

    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId, eventType: RETAIL_AUDIT_EVENTS.settingsChanged, entityId: "approvals" },
    });
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0]!.payloadJson ?? "{}");
    expect(payload.page).toBe("approvals");
    expect(payload.changes).toContainEqual({
      field: "requisitionOwnerOver",
      label: "Requisitions need the owner over",
      from: "500.00",
      to: "750.00",
    });
  });

  it("refuses an amount it cannot read and a person who is not an owner", async () => {
    expect(await saveSettings(actor(), "approvals", { adjustmentPinOver: "50.555" })).toEqual({
      ok: false,
      fieldErrors: { adjustmentPinOver: "Write an amount such as 500.00." },
    });
    expect(await saveSettings(actor(), "approvals", { accountOwnerOver: "2000000" })).toEqual({
      ok: false,
      fieldErrors: { accountOwnerOver: "Write an amount such as 500.00." },
    });
    await expect(saveSettings(actor(), "approvals", { ownerApproverId: managerId })).rejects.toBeInstanceOf(
      SettingsRefused,
    );
    expect((await getApprovalLimits(companyId)).ownerApproverId).toBe(ownerId);
  });
});
