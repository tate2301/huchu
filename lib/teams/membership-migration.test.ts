/**
 * Migration witness for `teams_membership`.
 *
 * Every user has exactly one membership; each workspace with someone eligible
 * has exactly one owner, the earliest active manager or superadmin; every other
 * superadmin is an admin; a workspace with nobody eligible has no owner; and
 * running the backfill again changes nothing.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { createMember, ensureOwner, syncMemberships } from "./members";

const run = crypto.randomUUID().slice(0, 8);
const companies: string[] = [];

async function company(label: string) {
  const made = await prisma.company.create({ data: { name: `${label} ${run}`, slug: `${label}-${run}` }, select: { id: true } });
  companies.push(made.id);
  return made.id;
}

function backfillStatements(): string[] {
  const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261021100000_teams_membership/migration.sql"), "utf8");
  const body = sql.slice(sql.indexOf("-- backfill"), sql.indexOf("-- report"));
  return body
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function backfill() {
  for (const statement of backfillStatements()) await prisma.$executeRawUnsafe(statement);
}

const at = (hour: number) => new Date(Date.UTC(2026, 0, 1, hour));

afterAll(async () => {
  await prisma.user.deleteMany({ where: { companyId: { in: companies } } });
  await prisma.company.deleteMany({ where: { id: { in: companies } } });
});

describe("workspace membership", () => {
  it("is one row per person per workspace, with a status and who owns it", async () => {
    const cols = await prisma.$queryRaw<Array<{ name: string; type: string; nullable: string }>>`
      SELECT column_name AS name, udt_name AS type, is_nullable AS nullable
      FROM information_schema.columns WHERE table_name = 'WorkspaceMembership'`;
    const byName = Object.fromEntries(cols.map((col) => [col.name, [col.type, col.nullable]]));
    expect(byName.status).toEqual(["MembershipStatus", "NO"]);
    expect(byName.isOwner).toEqual(["bool", "NO"]);
    expect(byName.isAdmin).toEqual(["bool", "NO"]);
    expect(byName.role).toEqual(["UserRole", "NO"]);
    expect(byName.removedAt).toEqual(["timestamp", "YES"]);
    const [{ labels }] = await prisma.$queryRaw<Array<{ labels: string[] }>>`
      SELECT array_agg(enumlabel ORDER BY enumsortorder)::text[] AS labels
      FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = 'MembershipStatus'`;
    expect(labels).toEqual(["INVITED", "ACTIVE", "SUSPENDED", "REMOVED"]);
  });

  it("backfills one membership per user, the earliest active manager or superadmin as owner, and the other superadmins as admins", async () => {
    const shop = await company("shop");
    const clerkOnly = await company("clerks");
    const lapsed = await company("lapsed");
    const make = (companyId: string, name: string, role: "SUPERADMIN" | "MANAGER" | "CLERK" | "PARENT", hour: number, extra: Record<string, unknown> = {}) =>
      prisma.user.create({ data: { companyId, name, email: `${name}-${run}@teams.test`, role, createdAt: at(hour), ...extra }, select: { id: true } });
    // Shop: a removed superadmin came first, then a manager (the owner), then two more superadmins.
    const removed = await make(shop, "removed", "SUPERADMIN", 1, { isActive: false, accessRemovedAt: at(30), accessRemovedById: null });
    const manager = await make(shop, "manager", "MANAGER", 2);
    const boss = await make(shop, "boss", "SUPERADMIN", 3);
    const deputy = await make(shop, "deputy", "SUPERADMIN", 4);
    const suspended = await make(shop, "suspended", "CLERK", 5, { isActive: false });
    const parent = await make(shop, "parent", "PARENT", 6);
    const clerk = await make(clerkOnly, "clerk", "CLERK", 1);
    const gone = await make(lapsed, "gone", "SUPERADMIN", 1, { isActive: false });

    const users = [removed, manager, boss, deputy, suspended, parent, clerk, gone].map((user) => user.id);
    expect(await prisma.workspaceMembership.count({ where: { userId: { in: users } } })).toBe(0);

    await backfill();

    const rows = await prisma.workspaceMembership.findMany({ where: { userId: { in: users } } });
    const of = (id: string) => rows.find((row) => row.userId === id)!;
    expect(rows).toHaveLength(users.length);
    expect(of(removed.id)).toMatchObject({ status: "REMOVED", removedAt: at(30), isOwner: false, isAdmin: true });
    expect(of(manager.id)).toMatchObject({ status: "ACTIVE", role: "MANAGER", isOwner: true, isAdmin: false });
    expect(of(boss.id)).toMatchObject({ status: "ACTIVE", isOwner: false, isAdmin: true });
    expect(of(deputy.id)).toMatchObject({ isOwner: false, isAdmin: true });
    expect(of(suspended.id)).toMatchObject({ status: "SUSPENDED", removedAt: null, isAdmin: false });
    expect(of(suspended.id).suspendedAt).not.toBeNull();
    expect(of(parent.id)).toMatchObject({ status: "ACTIVE", role: "PARENT", isOwner: false });
    expect(rows.filter((row) => row.companyId === shop && row.isOwner)).toHaveLength(1);
    // Nobody eligible: no owner, and the backfill says so rather than guessing.
    expect(of(clerk.id).isOwner).toBe(false);
    expect(of(gone.id)).toMatchObject({ status: "SUSPENDED", isOwner: false });
    expect(rows.filter((row) => row.companyId !== shop && row.isOwner)).toHaveLength(0);
  });

  it("changes nothing when it runs twice", async () => {
    // Other test files create users concurrently and the backfill is
    // database-wide, so compare this file's workspaces.
    const mine = { where: { companyId: { in: companies } }, orderBy: { id: "asc" } } as const;
    const before = await prisma.workspaceMembership.findMany(mine);
    expect(before.length).toBeGreaterThan(0);
    await backfill();
    const after = await prisma.workspaceMembership.findMany(mine);
    expect(after).toEqual(before);
  });

  it("allows one owner per workspace and removes memberships with the user", async () => {
    const id = await company("owners");
    const first = await createMember(prisma, { owner: true, data: { companyId: id, name: "A", email: `a-${run}@owners.test`, role: "SUPERADMIN" }, select: { id: true } });
    await expect(
      createMember(prisma, { owner: true, data: { companyId: id, name: "B", email: `b-${run}@owners.test`, role: "SUPERADMIN" }, select: { id: true } }),
    ).rejects.toThrow();
    expect(await prisma.user.count({ where: { companyId: id } })).toBe(1);
    await prisma.user.delete({ where: { id: first.id } });
    expect(await prisma.workspaceMembership.count({ where: { companyId: id } })).toBe(0);
  });
});

describe("creating and keeping memberships", () => {
  it("creates the membership with the user, in one write", async () => {
    const id = await company("born");
    const admin = await createMember(prisma, { data: { companyId: id, name: "Admin", email: `admin-${run}@born.test`, role: "SUPERADMIN" }, select: { id: true } });
    const clerk = await createMember(prisma, { data: { companyId: id, name: "Clerk", email: `clerk-${run}@born.test`, role: "CLERK", isActive: false }, select: { id: true } });
    const rows = await prisma.workspaceMembership.findMany({ where: { companyId: id } });
    expect(rows.find((row) => row.userId === admin.id)).toMatchObject({ status: "ACTIVE", role: "SUPERADMIN", isOwner: false, isAdmin: true });
    expect(rows.find((row) => row.userId === clerk.id)).toMatchObject({ status: "SUSPENDED", role: "CLERK", isAdmin: false });
  });

  it("follows the user when access or role changes, and names an owner when there is none", async () => {
    const id = await company("sync");
    const lead = await createMember(prisma, { data: { companyId: id, name: "Lead", email: `lead-${run}@sync.test`, role: "MANAGER" }, select: { id: true } });
    const rep = await createMember(prisma, { data: { companyId: id, name: "Rep", email: `rep-${run}@sync.test`, role: "CLERK" }, select: { id: true } });
    await ensureOwner(prisma, id);
    await ensureOwner(prisma, id);
    expect(await prisma.workspaceMembership.findMany({ where: { companyId: id, isOwner: true } })).toMatchObject([{ userId: lead.id }]);

    const now = new Date();
    await prisma.user.update({ where: { id: rep.id }, data: { role: "SUPERADMIN" } });
    await syncMemberships(prisma, { userId: rep.id });
    expect(await prisma.workspaceMembership.findFirst({ where: { userId: rep.id } })).toMatchObject({ role: "SUPERADMIN", isAdmin: true, status: "ACTIVE" });

    await prisma.user.update({ where: { id: rep.id }, data: { isActive: false, accessRemovedAt: now, accessRemovedById: lead.id } });
    await syncMemberships(prisma, { companyId: id });
    expect(await prisma.workspaceMembership.findFirst({ where: { userId: rep.id } })).toMatchObject({ status: "REMOVED", removedAt: now, removedById: lead.id });
    // Ownership is never touched by a sync.
    expect(await prisma.workspaceMembership.findFirst({ where: { userId: lead.id } })).toMatchObject({ isOwner: true });
  });
});
