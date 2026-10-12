import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

/**
 * Message customers (CUS-06, W-50): a role that may message nobody is refused
 * in the matrix's words before its body is read, and a malformed body from
 * one who may is answered under the sheet's own fields. Against the test
 * database, with only the sign-in faked.
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
  companyId = (await prisma.company.create({ data: { name: `Messages ${stamp}`, slug: `messages-${stamp}` }, select: { id: true } })).id;
  for (const [key, name, role] of [
    ["manager", "Tafara Nyathi", "MANAGER"],
    ["cashier", "Chipo Dube", "CASHIER"],
    ["bookkeeper", "Ruvimbo Chari", "FINANCE_OFFICER"],
  ] as const) {
    const user = await prisma.user.create({ data: { companyId, name, role, email: `${key}-${stamp}@messages.test`, password: "x" }, select: { id: true } });
    people[key] = { id: user.id, name, role };
  }
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

async function post(as: keyof typeof people, body: unknown) {
  const person = people[as]!;
  validateSessionMock.mockResolvedValue({
    session: { user: { id: person.id, companyId, role: person.role, name: person.name, enabledFeatures: ["retail.core"] } },
  });
  const response = await POST(
    new NextRequest("http://shop.test/api/v2/retail/customers/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as { error?: string; fieldErrors?: Record<string, string>; details?: unknown } };
}

describe("POST customers/messages", () => {
  it("refuses a cashier and a bookkeeper in the role's words, whatever the body", async () => {
    for (const who of ["cashier", "bookkeeper"] as const) {
      const sent = await post(who, { purpose: "OFFER", body: "" });
      expect(sent.status).toBe(403);
      expect(sent.body.error).toMatch(/^Your role cannot/);
      expect(sent.body.details).toBeUndefined();
    }
  });

  it("answers a malformed body from a manager under the sheet's fields", async () => {
    const sent = await post("manager", { purpose: "OFFER", body: "", sendAt: "tomorrow" });
    expect(sent.status).toBe(400);
    expect(sent.body.fieldErrors).toEqual({ msg: "Write the message.", when: "Pick when it goes." });
  });
});
