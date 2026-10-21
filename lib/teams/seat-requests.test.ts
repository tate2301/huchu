import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { createMember } from "./members";
import { addSeatForRequest, declineSeatRequest, listSeatRequests, removeSeatRequest } from "./seat-requests";
import { requestSeat } from "./seats";

const run = crypto.randomUUID().slice(0, 8);
let companyId: string;
let sean: string;
let tatenda: string;

async function add(name: string, role: "SUPERADMIN", owner = false) {
  return (await createMember(prisma, { owner, data: { companyId, name, email: `${name}-${run}@seats.test`, role }, select: { id: true } })).id;
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Seats ${run}`, slug: `seats-${run}`, seatLimit: 2, product: "PABASA" }, select: { id: true } })).id;
  sean = await add("sean", "SUPERADMIN", true);
  tatenda = await add("tatenda", "SUPERADMIN");
});

afterAll(async () => {
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.workspaceInvite.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

const ask = (name: string) => requestSeat({ companyId, userId: tatenda }, { name, role: "SALES_REP", phone: "+263775402186" });

describe("a request for a seat", () => {
  it("waits for the owner, who can say not now, and the admin can then remove it", async () => {
    await ask("Tariro");
    const [open] = await listSeatRequests(prisma, companyId);
    expect(open).toMatchObject({ name: "Tariro", state: "open", askedById: tatenda });

    await expect(declineSeatRequest({ companyId, userId: tatenda }, open.ref)).rejects.toMatchObject({ code: "OWNER_ONLY" });
    await declineSeatRequest({ companyId, userId: sean }, open.ref);
    expect((await listSeatRequests(prisma, companyId, open.ref))[0].state).toBe("not-now");

    await removeSeatRequest({ companyId, userId: tatenda }, open.ref);
    expect((await listSeatRequests(prisma, companyId)).filter((r) => r.state !== "removed")).toHaveLength(0);
  });

  it("adds the seat and sends the invite as the person who asked, landing on the deals", async () => {
    await ask("Kundai");
    const [open] = (await listSeatRequests(prisma, companyId)).filter((r) => r.state === "open");
    const added = await addSeatForRequest({ companyId, userId: sean }, open.ref);
    const invite = await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: added.inviteId } });
    expect(invite).toMatchObject({ name: "Kundai", invitedById: tatenda, landsOn: "/crm/deals", status: "SENT" });
    expect(await listSeatRequests(prisma, companyId, open.ref)).toHaveLength(0);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).seatLimit).toBe(3);
  });
});
