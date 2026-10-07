import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";

/**
 * Discarding a held sale at the till: `RELEASED`, with who and when. A
 * cashier discards their own, a manager anyone's; only on a paired till.
 * Against the test database, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST } from "./route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `discard-key-${stamp}`;
let companyId = "";
let chipoId = "";
let rudoId = "";
let managerId = "";
let shiftId = "";

function signIn(id: string, role: string, name: string) {
  validateSessionMock.mockResolvedValue({
    session: { user: { id, companyId, role, name, email: `${id}@discard.test`, enabledFeatures: ["retail.core"] } },
  });
}

async function discard(id: string, cookie = `${DEVICE_COOKIE}=${key}`) {
  const response = await POST(
    new NextRequest(`http://pos.test.localtest.me/api/v2/retail/pos/held-carts/${id}/discard`, {
      method: "POST",
      headers: { cookie },
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status, body: await response.json() };
}

async function hold(holdNo: string, cashierId: string) {
  return (
    await prisma.retailHeldCart.create({
      data: { companyId, holdNo: `${holdNo}-${stamp}`, shiftId, cashierId, cartSnapshot: { items: [] } },
      select: { id: true },
    })
  ).id;
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Discard ${stamp}`, slug: `discard-${stamp}` }, select: { id: true } })).id;
  const user = (name: string, role: "SUPERADMIN" | "MANAGER" | "CASHIER", handle: string) =>
    prisma.user
      .create({ data: { companyId, name, role, email: `${handle}-${stamp}@discard.test`, password: "x" }, select: { id: true } })
      .then((created) => created.id);
  const ownerId = await user("Tendai Mhlanga", "SUPERADMIN", "owner");
  managerId = await user("Tafara Nyathi", "MANAGER", "tafara");
  chipoId = await user("Chipo Dube", "CASHIER", "chipo");
  rudoId = await user("Rudo Moyo", "CASHIER", "rudo");
  const site = await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" }, select: { id: true } });
  const till = await prisma.retailRegister.create({
    data: { companyId, siteId: site.id, code: "FRONT", name: "Front till" },
    select: { id: true },
  });
  await prisma.retailDevice.create({
    data: { companyId, registerId: till.id, kind: "BROWSER", label: "Windows PC", keyHash: hashDeviceKey(key), pairedById: ownerId },
  });
  shiftId = (
    await prisma.retailShift.create({
      data: {
        companyId,
        shiftNo: `SH-${stamp}`,
        registerCode: "FRONT",
        registerName: "Front till",
        registerId: till.id,
        siteId: site.id,
        cashierId: chipoId,
        cashierName: "Chipo Dube",
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailHeldCart.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("discarding a held sale", () => {
  it("releases the cashier's own, saying who and when, and only once", async () => {
    const id = await hold("H-1", chipoId);
    signIn(chipoId, "CASHIER", "Chipo Dube");
    expect(await discard(id)).toMatchObject({ status: 200, body: { data: { id, status: "RELEASED" } } });
    const cart = await prisma.retailHeldCart.findUniqueOrThrow({ where: { id } });
    expect(cart).toMatchObject({ status: "RELEASED", releasedById: chipoId });
    expect(cart.releasedAt).not.toBeNull();
    expect(await discard(id)).toMatchObject({ status: 409, body: { error: `H-1-${stamp} is no longer held.` } });
  });

  it("refuses another cashier's, and lets a manager discard it", async () => {
    const id = await hold("H-2", chipoId);
    signIn(rudoId, "CASHIER", "Rudo Moyo");
    expect(await discard(id)).toMatchObject({
      status: 403,
      body: { error: "Only the cashier who held it, or a manager, can discard it." },
    });
    signIn(managerId, "MANAGER", "Tafara Nyathi");
    expect((await discard(id)).status).toBe(200);
    expect(await prisma.retailHeldCart.findUniqueOrThrow({ where: { id } })).toMatchObject({ releasedById: managerId });
  });

  it("works only on a paired till", async () => {
    const id = await hold("H-3", chipoId);
    signIn(chipoId, "CASHIER", "Chipo Dube");
    expect((await discard(id, "")).status).toBe(409);
    expect(await prisma.retailHeldCart.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "HELD" });
  });
});
