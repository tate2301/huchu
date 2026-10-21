/**
 * Witness for `teams_record_team`.
 *
 * The migration's own follower statements, run on a scratch schema that still
 * has `CrmFollower`, turn every follower into a team member who only follows,
 * create the membership of one who somehow had none, and change nothing when
 * run twice. Then the rules: being on the team follows the record; handing
 * over moves `isOwner` and raises a needs-you notice; a record with a
 * stranger asking is opened by its owner; and a retail customer, product and
 * supplier can each have a team.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listInbox } from "@/lib/inbox/query";
import { prisma } from "@/lib/prisma";

import { createMember, removeMember } from "./members";
import { canSeeRecord, denyAccess, followRecord, followByCommenting, grantAccess, handOver, joinTeam, leaveTeam, ownedRecordCount, recordTeam, requestAccess } from "./record-team";

class Rollback extends Error {
  constructor(readonly result: unknown) {
    super("rollback");
  }
}

function followerStatements(): string[] {
  const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261021140000_teams_record_team/migration.sql"), "utf8");
  const start = sql.indexOf("-- Followers are on the team");
  const body = sql
    .slice(start, sql.indexOf("DROP TABLE", start))
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return body.split(/;\s*$/m).map((statement) => statement.trim()).filter(Boolean);
}

describe("the migration", () => {
  it("renames the subject enum, adds the retail subjects and drops CrmFollower", async () => {
    const labels = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = 'RecordSubjectType'`;
    expect(labels.map((row) => row.enumlabel)).toEqual(expect.arrayContaining(["DEAL", "STUDENT", "PROJECT", "RETAIL_CUSTOMER", "RETAIL_PRODUCT", "RETAIL_SUPPLIER"]));
    const [{ old }] = await prisma.$queryRaw<Array<{ old: bigint }>>`SELECT count(*) AS old FROM pg_type WHERE typname = 'CrmFieldEntity'`;
    expect(Number(old)).toBe(0);
    const [{ gone }] = await prisma.$queryRaw<Array<{ gone: bigint }>>`SELECT count(*) AS gone FROM information_schema.tables WHERE table_name = 'CrmFollower'`;
    expect(Number(gone)).toBe(0);
    const [{ owner }] = await prisma.$queryRaw<Array<{ owner: bigint }>>`SELECT count(*) AS owner FROM pg_indexes WHERE indexname = 'RecordTeamMember_one_owner'`;
    expect(Number(owner)).toBe(1);
  });

  it("makes every follower a team member who only follows, once", async () => {
    const result = await prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA m6_witness`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path = m6_witness, public`);
        for (const table of ["User", "WorkspaceMembership", "RecordTeamMember"]) {
          await tx.$executeRawUnsafe(`CREATE TABLE m6_witness."${table}" (LIKE public."${table}" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`);
        }
        await tx.$executeRawUnsafe(`
          CREATE TABLE m6_witness."CrmFollower" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "userId" TEXT NOT NULL,
            "entity" "RecordSubjectType" NOT NULL, "recordId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
        const user = (id: string, active = true) =>
          tx.$executeRawUnsafe(`INSERT INTO m6_witness."User" ("id", "name", "role", "companyId", "isActive", "updatedAt") VALUES ('${id}', '${id}', 'CLERK', 'A', ${active}, now())`);
        await user("u1");
        await user("u2");
        await user("u3", false);
        // u1 has a membership; u2 and u3 were made between M2 and M6.
        await tx.$executeRawUnsafe(`INSERT INTO m6_witness."WorkspaceMembership" ("id", "companyId", "userId", "role", "updatedAt") VALUES ('m1', 'A', 'u1', 'CLERK', now())`);
        await tx.$executeRawUnsafe(`INSERT INTO m6_witness."CrmFollower" ("id", "companyId", "userId", "entity", "recordId") VALUES ('f1', 'A', 'u1', 'DEAL', 'd1'), ('f2', 'A', 'u2', 'DEAL', 'd1'), ('f3', 'A', 'u1', 'LEAD', 'l1'), ('f4', 'A', 'u3', 'DEAL', 'd1')`);

        for (const statement of followerStatements()) await tx.$executeRawUnsafe(statement);
        const read = () =>
          tx.$queryRawUnsafe<Array<{ userId: string; subjectType: string; subjectId: string; isOwner: boolean; followsOnly: boolean; status: string }>>(
            `SELECT m."userId", t."subjectType"::text AS "subjectType", t."subjectId", t."isOwner", t."followsOnly", m."status"::text AS status
             FROM m6_witness."RecordTeamMember" t JOIN m6_witness."WorkspaceMembership" m ON m."id" = t."membershipId" ORDER BY 1, 2, 3`,
          );
        const first = await read();
        for (const statement of followerStatements()) await tx.$executeRawUnsafe(statement);
        const second = await read();
        throw new Rollback({ first, second });
      })
      .catch((error) => {
        if (error instanceof Rollback) return error.result as { first: unknown[]; second: unknown[] };
        throw error;
      });
    expect(result.first).toEqual([
      { userId: "u1", subjectType: "DEAL", subjectId: "d1", isOwner: false, followsOnly: true, status: "ACTIVE" },
      { userId: "u1", subjectType: "LEAD", subjectId: "l1", isOwner: false, followsOnly: true, status: "ACTIVE" },
      { userId: "u2", subjectType: "DEAL", subjectId: "d1", isOwner: false, followsOnly: true, status: "ACTIVE" },
      { userId: "u3", subjectType: "DEAL", subjectId: "d1", isOwner: false, followsOnly: true, status: "REMOVED" },
    ].map((row) => (row.userId === "u3" ? { ...row, status: "SUSPENDED" } : row)));
    expect(result.second).toEqual(result.first);
  });
});

const run = crypto.randomUUID().slice(0, 8);
let companyId: string;
const people: Record<"sean" | "tatenda" | "gerald" | "munashe" | "tariro", { userId: string; membershipId: string }> = {} as never;
const deal = { type: "DEAL", id: crypto.randomUUID() } as const;
const label = { label: "Campus for Nyatsime College", viewPath: "/crm/deals/d-14" };

async function add(key: keyof typeof people, role: "SUPERADMIN" | "MANAGER" | "SALES_REP", owner = false) {
  const user = await createMember(prisma, {
    owner,
    data: { companyId, name: key, email: `${key}-${run}@team.test`, role },
    select: { id: true, memberships: { select: { id: true } } },
  });
  people[key] = { userId: user.id, membershipId: user.memberships[0].id };
}
const as = (key: keyof typeof people) => ({ companyId, userId: people[key].userId });
const events = (change: string) => prisma.platformAuditEvent.findMany({ where: { companyId, eventType: `teams.${change}` } });
const refused = async (work: Promise<unknown>, code: string) => {
  await expect(work).rejects.toMatchObject({ name: "TeamsRefusal", code });
};
const needs = async (key: keyof typeof people) =>
  (await listInbox({ userId: people[key].userId, companyId, viewerName: null, filters: { view: "needs", module: null }, page: 1, limit: 40 })).items;

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Team ${run}`, slug: `team-${run}`, seatLimit: 10 }, select: { id: true } })).id;
  await add("sean", "SUPERADMIN", true);
  await add("tatenda", "MANAGER");
  await add("gerald", "SALES_REP");
  await add("munashe", "SALES_REP");
  await add("tariro", "SALES_REP");
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("the team on a record", () => {
  it("has one owner, others working on it, and followers", async () => {
    // A manager cannot join a record she cannot open; the workspace owner starts it.
    await refused(joinTeam(as("tatenda"), deal, { owner: true }), "NOT_ALLOWED");
    await joinTeam(as("sean"), deal, { owner: true });
    await joinTeam(as("sean"), deal, { membershipId: people.gerald.membershipId });
    await followRecord(as("sean"), deal, { membershipId: people.tatenda.membershipId });
    const team = await recordTeam(prisma, companyId, deal);
    expect(team.map((entry) => [entry.name, entry.isOwner, entry.followsOnly])).toEqual([
      ["sean", true, false],
      ["gerald", false, false],
      ["tatenda", false, true],
    ]);
    await refused(joinTeam(as("sean"), deal, { owner: true }), "ALREADY_ON_TEAM");
    await refused(joinTeam(as("gerald"), deal, { membershipId: people.munashe.membershipId }), "NOT_ALLOWED");
    expect(await events("record_team.joined")).toHaveLength(2);
    expect(await events("record_team.followed")).toHaveLength(1);
  });

  it("makes following a person who comments, and a person who joins stays working", async () => {
    await followByCommenting(prisma, companyId, people.munashe.userId, deal);
    await followByCommenting(prisma, companyId, people.munashe.userId, deal);
    await followByCommenting(prisma, companyId, people.gerald.userId, deal);
    const team = await recordTeam(prisma, companyId, deal);
    expect(team.find((entry) => entry.name === "munashe")).toMatchObject({ followsOnly: true });
    expect(team.find((entry) => entry.name === "gerald")).toMatchObject({ followsOnly: false });
    // Following more than once, or as a worker, writes one line.
    expect(await events("record_team.followed")).toHaveLength(2);
    await joinTeam(as("munashe"), deal);
    expect((await recordTeam(prisma, companyId, deal)).find((entry) => entry.name === "munashe")).toMatchObject({ followsOnly: false });
  });

  it("lets someone leave or unfollow, but not the owner", async () => {
    await leaveTeam(as("munashe"), deal);
    expect((await recordTeam(prisma, companyId, deal)).map((entry) => entry.name)).not.toContain("munashe");
    await refused(leaveTeam(as("sean"), deal), "IS_OWNER");
    expect(await events("record_team.left")).toHaveLength(1);
  });
});

describe("handing over", () => {
  it("moves isOwner, keeps the old owner on the team and raises a needs-you notice with the note", async () => {
    await refused(handOver(as("sean"), deal, people.tariro.membershipId, label), "NOT_ALLOWED");
    await handOver(as("sean"), deal, people.tatenda.membershipId, { ...label, note: "Away 26 to 30 October." });
    const team = await recordTeam(prisma, companyId, deal);
    expect(team.filter((entry) => entry.isOwner).map((entry) => entry.name)).toEqual(["tatenda"]);
    expect(team.find((entry) => entry.name === "sean")).toMatchObject({ isOwner: false, followsOnly: false });
    const [notice] = await needs("tatenda");
    expect(notice).toMatchObject({ type: "TEAMS_RECORD_HANDED_OVER", needsYou: true });
    expect(notice.second ?? "").toContain("Away 26 to 30 October");
    expect(await events("record_team.handed_over")).toHaveLength(1);
    await refused(handOver(as("gerald"), deal, people.gerald.membershipId, label), "NOT_ALLOWED");
  });

  it("can let the new owner in first", async () => {
    await handOver(as("tatenda"), deal, people.tariro.membershipId, { ...label, letIn: true });
    expect(await canSeeRecord(prisma, companyId, deal, people.tariro.userId)).toBe(true);
    expect((await recordTeam(prisma, companyId, deal)).find((entry) => entry.isOwner)?.name).toBe("tariro");
    expect(await events("record_access.granted")).toHaveLength(1);
  });

  it("is what removing the owner of records does: refused until someone takes them, then done in the same step", async () => {
    expect(await ownedRecordCount(prisma, companyId, people.tariro.membershipId)).toBe(1);
    await refused(removeMember(as("sean"), people.tariro.membershipId), "OPEN_WORK");
    await removeMember(as("sean"), people.tariro.membershipId, { handTo: people.gerald.membershipId });
    expect((await recordTeam(prisma, companyId, deal)).find((entry) => entry.isOwner)?.name).toBe("gerald");
    expect(await ownedRecordCount(prisma, companyId, people.tariro.membershipId)).toBe(0);
    expect((await prisma.workspaceMembership.findUniqueOrThrow({ where: { id: people.tariro.membershipId } })).status).toBe("REMOVED");
  });
});

describe("access to a record you are not on", () => {
  it("is asked for, shown to the owner as a needs-you notice, and granted or turned down", async () => {
    const hidden = { type: "DEAL", id: crypto.randomUUID() } as const;
    await joinTeam(as("sean"), hidden, { owner: true });
    expect(await canSeeRecord(prisma, companyId, hidden, people.munashe.userId)).toBe(false);
    await refused(joinTeam(as("munashe"), hidden), "NOT_ALLOWED");
    await requestAccess(as("munashe"), hidden, label);
    await requestAccess(as("munashe"), hidden, label);
    const asked = (await needs("sean")).filter((item) => item.type === "TEAMS_ACCESS_REQUEST");
    expect(asked).toHaveLength(1);

    await refused(grantAccess(as("gerald"), hidden, people.munashe.membershipId), "NOT_ALLOWED");
    await denyAccess(as("sean"), hidden, people.munashe.membershipId);
    expect((await needs("sean")).filter((item) => item.type === "TEAMS_ACCESS_REQUEST")).toHaveLength(0);
    expect(await canSeeRecord(prisma, companyId, hidden, people.munashe.userId)).toBe(false);

    await requestAccess(as("munashe"), hidden, label);
    expect((await needs("sean")).filter((item) => item.type === "TEAMS_ACCESS_REQUEST")).toHaveLength(1);
    await grantAccess(as("sean"), hidden, people.munashe.membershipId);
    expect(await canSeeRecord(prisma, companyId, hidden, people.munashe.userId)).toBe(true);
    expect((await needs("sean")).filter((item) => item.type === "TEAMS_ACCESS_REQUEST")).toHaveLength(0);
    expect(await events("record_access.requested")).toHaveLength(2);
    expect(await events("record_access.denied")).toHaveLength(1);
    await refused(requestAccess(as("munashe"), hidden, label), "ALREADY_ON_TEAM");
  });
});

describe("retail records", () => {
  it("each of a customer, a product and a supplier can have a team", async () => {
    for (const type of ["RETAIL_CUSTOMER", "RETAIL_PRODUCT", "RETAIL_SUPPLIER"] as const) {
      const record = { type, id: crypto.randomUUID() };
      await joinTeam(as("sean"), record, { owner: true });
      await followRecord(as("gerald"), record);
      expect((await recordTeam(prisma, companyId, record)).find((entry) => entry.isOwner)?.name).toBe("sean");
    }
  });
});
