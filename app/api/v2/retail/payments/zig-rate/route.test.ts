import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

/**
 * The ZiG rate's own action (W-05, C-14): owners and managers set it, the
 * bookkeeper may not, and only the rate and how it is updated go through it.
 * Against the test database, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST } from "./route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId = "";
const people: Record<string, { id: string; name: string; role: string }> = {};

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Rate ${stamp}`, slug: `rate-${stamp}` }, select: { id: true } })).id;
  for (const [key, name, role] of [
    ["manager", "Tafara Nyathi", "MANAGER"],
    ["bookkeeper", "Ruvimbo Chari", "FINANCE_OFFICER"],
  ] as const) {
    const user = await prisma.user.create({
      data: { companyId, name, role, email: `${key}-${stamp}@rate.test`, password: "x" },
      select: { id: true },
    });
    people[key] = { id: user.id, name, role };
  }
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.currencyRate.deleteMany({ where: { companyId } });
  await prisma.retailPaymentSettings.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

async function post(as: "manager" | "bookkeeper", changes: Record<string, unknown>) {
  const person = people[as]!;
  validateSessionMock.mockResolvedValue({
    session: { user: { id: person.id, companyId, role: person.role, name: person.name, enabledFeatures: ["retail.core"] } },
  });
  const response = await POST(
    new NextRequest("http://shop.test/api/v2/retail/payments/zig-rate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ changes }),
    }),
  );
  return { status: response.status, body: await response.json() };
}

describe("POST /api/v2/retail/payments/zig-rate", () => {
  it("sets the manager's rate and answers with the page", async () => {
    const saved = await post("manager", { zigRate: "27.10" });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      values: { zigRate: "27.10", zigSetBy: "Tafara Nyathi" },
      lastChanged: { by: "Tafara Nyathi", what: "rate" },
    });
    const row = await prisma.currencyRate.findFirstOrThrow({ where: { companyId } });
    expect(row).toMatchObject({ baseCurrency: "USD", quoteCurrency: "ZWG", rate: 27.1, createdById: people.manager!.id });
  });

  it("takes nothing but the rate and how it is updated", async () => {
    const refused = await post("manager", { innbucks: true, zigRate: "27.20" });
    expect(refused.status).toBe(400);
    expect(refused.body.fieldErrors).toEqual({ innbucks: "Only the ZiG rate is changed here." });
    expect(await prisma.currencyRate.count({ where: { companyId } })).toBe(1);
  });

  it("checks the rate, and the RBZ option while no feed is connected", async () => {
    expect((await post("manager", { zigRate: "0" })).body.fieldErrors).toEqual({ zigRate: "The rate must be more than nothing." });
    expect((await post("manager", { zigSource: "Daily, RBZ rate" })).body.fieldErrors).toEqual({
      zigSource: "The RBZ rate is not connected yet.",
    });
  });

  it("names who last changed how the rate is updated, once that is the newest change", async () => {
    process.env.RBZ_RATE_URL = "https://rbz.test/rate";
    try {
      const saved = await post("manager", { zigSource: "Daily, RBZ rate" });
      expect(saved.status).toBe(200);
      expect(saved.body.values).toMatchObject({ zigSource: "Daily, RBZ rate" });
      // Not the rate's line any more: "Last changed by Tafara Nyathi, …".
      expect(saved.body.lastChanged).toEqual({ by: "Tafara Nyathi", at: expect.any(String) });
      expect(new Date(saved.body.lastChanged.at).getTime()).toBeGreaterThan(
        (await prisma.currencyRate.findFirstOrThrow({ where: { companyId } })).effectiveDate.getTime(),
      );
      await post("manager", { zigSource: "By hand" });
    } finally {
      delete process.env.RBZ_RATE_URL;
    }
  });

  it("refuses the bookkeeper", async () => {
    const refused = await post("bookkeeper", { zigRate: "30" });
    expect(refused.status).toBe(403);
    expect(await prisma.currencyRate.count({ where: { companyId } })).toBe(1);
  });
});
