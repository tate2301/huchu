import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setUpVerticals, setUpWorkspace } from "@/lib/admin/set-up";
import type { SignedInOperator } from "@/lib/operators/guards";
import { getCompanyFeatureMap } from "@/lib/platform/entitlements";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";

const run = randomUUID().slice(0, 8);
let operator: SignedInOperator;
const made: string[] = [];

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `setup-${run}@corelith.test`, name: "Tafadzwa", role: "OWNER" } });
  operator = { sessionId: "z", id: op.id, email: op.email, name: op.name, role: op.role };
});

afterAll(async () => {
  for (const id of made) await destroyProvisionedTenant(id);
  await prisma.operator.deleteMany({ where: { id: operator.id } });
});

describe("the verticals a set-up runs", () => {
  it("keeps the catalogue's order and makes Flare a CRM", () => {
    expect(setUpVerticals("CORELITH", ["CRM", "RETAIL"])).toEqual(["RETAIL", "CRM"]);
    expect(setUpVerticals("FLARE", ["GOLD"])).toEqual(["CRM"]);
    expect(setUpVerticals("CORELITH", [])).toEqual([]);
  });
});

describe("setting up a workspace", () => {
  it(
    "refuses without a vertical",
    async () => {
      await expect(
        setUpWorkspace(operator, {
          name: "Nothing Ltd",
          slug: `nothing-${run}`,
          product: "CORELITH",
          verticals: [],
          ownerName: "Rudo",
          ownerEmail: `rudo-${run}@x.test`,
          start: "TRIAL",
        }),
      ).rejects.toThrow(/at least one/);
    },
    60_000,
  );

  it(
    "writes each vertical, turns its features on, and prices them",
    async () => {
      const company = await setUpWorkspace(operator, {
        name: "Two Lines",
        slug: `two-lines-${run}`,
        product: "CORELITH",
        verticals: ["CRM", "RETAIL"],
        ownerName: "Chipo",
        ownerEmail: `chipo-${run}@x.test`,
        start: "TRIAL",
      });
      made.push(company.id);

      const verticals = await prisma.companyVertical.findMany({ where: { companyId: company.id }, select: { vertical: true } });
      expect(verticals.map((row) => row.vertical).sort()).toEqual(["CRM", "RETAIL"]);

      // Two verticals, one member: $78.
      const subscription = await prisma.companySubscription.findFirstOrThrow({ where: { companyId: company.id } });
      expect(subscription.status).toBe("TRIALING");
      expect(subscription.effectiveMonthlyAmount).toBe(78);

      const features = await getCompanyFeatureMap(company.id);
      expect(features["retail.pos"]).toBe(true);
      expect(features["crm.core"]).toBe(true);
    },
    180_000,
  );
});
