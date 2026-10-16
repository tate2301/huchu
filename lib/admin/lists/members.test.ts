import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { membersSource } from "./members";
import { peopleSource } from "./people";

const run = randomUUID().slice(0, 8);
let companyIds: string[] = [];
let ownerId: string;
let removedId: string;

beforeAll(async () => {
  const here = await prisma.company.create({ data: { name: `Mvura ${run}`, slug: `mvura-${run}`, workspaceProfile: "GENERAL" } });
  const there = await prisma.company.create({ data: { name: `Gomo ${run}`, slug: `gomo-${run}`, workspaceProfile: "GENERAL", product: "FLARE" } });
  companyIds = [here.id, there.id];
  ownerId = (await prisma.user.create({ data: { name: "Tendai", email: `tendai-${run}@x.test`, role: "SUPERADMIN", companyId: here.id } })).id;
  removedId = (
    await prisma.user.create({ data: { name: "Rudo", email: `rudo-${run}@x.test`, role: "CLERK", isActive: false, companyId: here.id } })
  ).id;
  await prisma.user.create({ data: { name: "Chipo", email: `chipo-${run}@x.test`, role: "MANAGER", companyId: there.id } });
  // Tendai signed in once, in Mvura.
  await prisma.platformAuditEvent.create({
    data: { companyId: here.id, eventType: "auth.login.success", actor: `tendai-${run}@x.test`, eventHash: `members-list-${run}` },
  });
});

afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
});

describe("the Members list", () => {
  it("loads only the workspace its parent names, and nothing without one", async () => {
    expect(await membersSource.load({})).toEqual([]);
    const rows = await membersSource.load({ w: `mvura-${run}` });
    expect(rows.map((row) => [row.name, row.state, row.ownerMark, row.workspaceSlug])).toEqual([
      ["Tendai", "Active", " · owner", `mvura-${run}`],
      ["Rudo", "Access removed", null, `mvura-${run}`],
    ]);
    expect(rows.find((row) => row.id === removedId)?.roleText).toBe("Clerk");
    const owner = rows.find((row) => row.id === ownerId);
    expect(owner?.added).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(owner?.lastSignIn).toBe(owner?.added);
  });
});

describe("the People list", () => {
  it("holds everyone in every workspace, each with their workspace and product", async () => {
    const rows = (await peopleSource.load({})).filter((row) => String(row.workspaceSlug).endsWith(run));
    expect(rows.map((row) => [row.name, row.workspaceName, row.product]).sort()).toEqual(
      [
        ["Chipo", `Gomo ${run}`, "Flare"],
        ["Rudo", `Mvura ${run}`, "Corelith"],
        ["Tendai", `Mvura ${run}`, "Corelith"],
      ].sort(),
    );
  });
});
