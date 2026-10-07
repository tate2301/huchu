/**
 * A shop's requisition, from asking to paid, against a real database.
 *
 * A cashier asks; a manager decides and pays; the asker sees their own and
 * nobody else's. Approving your own request is refused unless you own the
 * shop, and a paid requisition is finished.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  actOnRetailRequisition,
  listRetailRequisitions,
  loadRetailRequisition,
  raiseRetailRequisition,
  RequisitionRefused,
  requisitionPermissions,
} from "./requisitions";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let siteId: string;
const people: Record<"owner" | "manager" | "cashier" | "clerk", string> = { owner: "", manager: "", cashier: "", clerk: "" };
const roles = { owner: "SUPERADMIN", manager: "MANAGER", cashier: "CASHIER", clerk: "STOCK_CLERK" } as const;

const as = (who: keyof typeof people) => ({ companyId, userId: people[who], role: roles[who] });

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Req ${stamp}`, slug: `req-${stamp}` }, select: { id: true } })).id;
  siteId = (await prisma.site.create({ data: { companyId, code: `R-${stamp}`, name: "Borrowdale" }, select: { id: true } })).id;
  for (const who of Object.keys(people) as Array<keyof typeof people>) {
    people[who] = (
      await prisma.user.create({
        data: { email: `${who}-${stamp}@shop.test`, name: who, role: roles[who], companyId },
        select: { id: true },
      })
    ).id;
  }
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.notification.deleteMany({ where: { companyId } }).catch(() => undefined);
  await prisma.crmRequisition.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("a shop's requisition", () => {
  let id: string;

  it("is raised by a cashier at the shop and sent to a manager", async () => {
    const requisition = await raiseRetailRequisition(as("cashier"), {
      siteId,
      category: "MATERIALS",
      purpose: "Cleaning materials for the floor",
      amount: 25,
      submit: true,
    });
    id = requisition.id;
    expect(requisition).toMatchObject({ status: "SUBMITTED", siteId, requestedById: people.cashier });
    expect(requisition.requisitionNo).toMatch(/^REQ-/);
  });

  it("is the cashier's to see, and not the stock clerk's", async () => {
    expect(await loadRetailRequisition(as("cashier"), id)).not.toBeNull();
    expect(await loadRetailRequisition(as("clerk"), id)).toBeNull();
    expect((await listRetailRequisitions(as("clerk"))).map((row) => row.id)).not.toContain(id);
    expect((await listRetailRequisitions(as("manager"))).map((row) => row.id)).toContain(id);
  });

  it("cannot be approved by the cashier who asked", async () => {
    await expect(actOnRetailRequisition(as("cashier"), id, { action: "decide", approve: true })).rejects.toThrow(
      new RequisitionRefused("You cannot approve requisitions", 403),
    );
  });

  it("is approved by a manager, who may cut the amount but not raise it", async () => {
    await expect(
      actOnRetailRequisition(as("manager"), id, { action: "decide", approve: true, approvedAmount: 40 }),
    ).rejects.toThrow("Approve the amount asked for, or less");
    const approved = await actOnRetailRequisition(as("manager"), id, { action: "decide", approve: true, approvedAmount: 20 });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedAmount?.toFixed(2)).toBe("20.00");
  });

  it("is paid by a manager, not by the cashier, and is then finished", async () => {
    await expect(actOnRetailRequisition(as("cashier"), id, { action: "pay" })).rejects.toThrow(
      "You cannot pay out requisitions",
    );
    const paid = await actOnRetailRequisition(as("manager"), id, { action: "pay" });
    expect(paid.status).toBe("DISBURSED");
    await expect(actOnRetailRequisition(as("manager"), id, { action: "cancel" })).rejects.toThrow(RequisitionRefused);
  });

  it("lets the owner approve their own, and nobody else", async () => {
    const managers = await raiseRetailRequisition(as("manager"), {
      siteId, category: "EQUIPMENT", purpose: "Fridge seal", amount: 12, submit: true,
    });
    expect(requisitionPermissions(as("manager"), managers).mayDecide).toBe(false);
    await expect(actOnRetailRequisition(as("manager"), managers.id, { action: "decide", approve: true })).rejects.toThrow(
      "Somebody else has to approve your own request",
    );

    const owners = await raiseRetailRequisition(as("owner"), {
      siteId, category: "TRANSPORT", purpose: "Delivery to Avondale", amount: 8, submit: true,
    });
    expect((await actOnRetailRequisition(as("owner"), owners.id, { action: "decide", approve: true })).status).toBe("APPROVED");
  });

  it("keeps a draft until it is sent, and lets the asker withdraw it", async () => {
    const draft = await raiseRetailRequisition(as("clerk"), { siteId, category: "OTHER", purpose: "Padlock", amount: 5 });
    expect(draft.status).toBe("DRAFT");
    expect((await actOnRetailRequisition(as("clerk"), draft.id, { action: "submit" })).status).toBe("SUBMITTED");
    expect((await actOnRetailRequisition(as("clerk"), draft.id, { action: "cancel", reason: "Found one" })).status).toBe(
      "CANCELLED",
    );
  });

  it("refuses a shop that is not this business's", async () => {
    await expect(
      raiseRetailRequisition(as("cashier"), {
        siteId: "00000000-0000-0000-0000-000000000000", category: "OTHER", purpose: "x", amount: 1,
      }),
    ).rejects.toThrow("That shop is not this business's");
  });
});
