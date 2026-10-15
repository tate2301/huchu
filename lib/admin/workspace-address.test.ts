import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { changeWorkspaceAddress } from "@/lib/admin/workspace-settings";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";

/** Settings › Address: a workspace's address changed from the portal, on signup's rules. */

const run = randomUUID().slice(0, 8);
let owner: SignedInOperator;
let workspace: { id: string; name: string; slug: string };
let otherId: string;

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `addr-${run}@corelith.test`, name: "Tafadzwa", role: "OWNER" } });
  owner = { sessionId: "o", id: op.id, email: op.email, name: op.name, role: op.role };
  const company = await prisma.company.create({ data: { name: `Lux ${run}`, slug: `lux-${run}` } });
  workspace = { id: company.id, name: company.name, slug: company.slug };
  await prisma.subdomainReservation.create({ data: { companyId: company.id, subdomain: company.slug } });
  otherId = (await prisma.company.create({ data: { name: `Other ${run}`, slug: `other-${run}` } })).id;
  await prisma.subdomainReservation.create({ data: { companyId: otherId, subdomain: `held-${run}` } });
});

afterAll(async () => {
  const ids = [workspace.id, otherId];
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.subdomainReservation.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
  await prisma.operator.deleteMany({ where: { id: owner.id } });
});

describe("changing a workspace's address", () => {
  it("refuses an address signup would refuse, or another workspace's", async () => {
    await expect(changeWorkspaceAddress(owner, workspace, "ab")).rejects.toThrow(/at least 3/);
    await expect(changeWorkspaceAddress(owner, workspace, "Lux Liquor!")).rejects.toThrow(/lowercase letters/);
    await expect(changeWorkspaceAddress(owner, workspace, "admin")).rejects.toThrow(/kept for the platform/);
    await expect(changeWorkspaceAddress(owner, workspace, `other-${run}`)).rejects.toThrow(/another workspace's address/);
    await expect(changeWorkspaceAddress(owner, workspace, `held-${run}`)).rejects.toThrow(/another workspace's address/);
  });

  it("does nothing for the same address", async () => {
    expect(await changeWorkspaceAddress(owner, workspace, ` ${workspace.slug.toUpperCase()} `)).toBe(false);
  });

  it("moves the address and the one it holds, on the operator's audit line", async () => {
    const next = `luxliquor-${run}`;
    expect(await changeWorkspaceAddress(owner, workspace, next)).toBe(true);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: workspace.id } })).slug).toBe(next);
    expect(await prisma.subdomainReservation.findUnique({ where: { subdomain: next } })).toMatchObject({ companyId: workspace.id });
    expect(await prisma.subdomainReservation.findUnique({ where: { subdomain: workspace.slug } })).toBeNull();
    const line = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: workspace.id, eventType: "operator.workspace.address_changed" } });
    expect(line.actor).toBe(`operator:${owner.id}`);
  });
});
