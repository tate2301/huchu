/**
 * Witness for `teams_needs_action`.
 *
 * `Notification.needsAction` exists and the backfill flags what the old reader
 * called "needs you" (the type list, critical, a payload that says so) and
 * nothing else. Then the change the column exists for: reading a needs-you item
 * does not clear it; acting on it, or dismissing it, does.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listInbox } from "@/lib/inbox/query";
import { emitCrmNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

import { createMember } from "./members";
import { offerOwnership, acceptOwnership } from "./ownership";
import { requestSeat, setSeatLimit } from "./seats";

const run = crypto.randomUUID().slice(0, 8);
let companyId: string;
let ownerId: string;
let adminId: string;
let ownerMembership: string;
let adminMembership: string;

function backfill(): string {
  const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261021130000_teams_needs_action/migration.sql"), "utf8");
  const start = sql.indexOf("UPDATE");
  return sql.slice(start, sql.indexOf(";", start));
}

const needs = async (userId = ownerId) =>
  (await listInbox({ userId, companyId, viewerName: null, filters: { view: "needs", module: null }, page: 1, limit: 40 })).items;
const counts = async (userId = ownerId) =>
  (await listInbox({ userId, companyId, viewerName: null, filters: { view: "all", module: null }, page: 1, limit: 40 })).counts;

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Needs ${run}`, slug: `needs-${run}`, seatLimit: 2 }, select: { id: true } })).id;
  const owner = await createMember(prisma, { owner: true, data: { companyId, name: "Sean Owner", email: `owner-${run}@needs.test`, role: "SUPERADMIN" }, select: { id: true, memberships: { select: { id: true } } } });
  const admin = await createMember(prisma, { data: { companyId, name: "Tatenda Admin", email: `admin-${run}@needs.test`, role: "SUPERADMIN" }, select: { id: true, memberships: { select: { id: true } } } });
  ownerId = owner.id;
  adminId = admin.id;
  ownerMembership = owner.memberships[0].id;
  adminMembership = admin.memberships[0].id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("the migration", () => {
  it("adds the column, defaulting to false, with its index", async () => {
    const [column] = await prisma.$queryRaw<Array<{ type: string; nullable: string; def: string }>>`
      SELECT udt_name AS type, is_nullable AS nullable, column_default AS def FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'needsAction'`;
    expect(column).toEqual({ type: "bool", nullable: "NO", def: "false" });
    const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) AS count FROM pg_indexes WHERE indexname = 'Notification_companyId_needsAction_idx'`;
    expect(Number(count)).toBe(1);
  });

  it("flags what the old reader called needs-you, and nothing else, and again changes nothing", async () => {
    const make = (type: "CRM_TASK_ASSIGNED" | "CRM_COMMENT_ADDED", severity: "INFO" | "CRITICAL", payload: object | null, tag: string) =>
      prisma.notification.create({
        data: { companyId, type, severity, title: tag, summary: tag, payloadJson: payload ? JSON.stringify(payload) : null },
        select: { id: true },
      });
    const rows = {
      listed: await make("CRM_TASK_ASSIGNED", "INFO", null, "listed"),
      critical: await make("CRM_COMMENT_ADDED", "CRITICAL", null, "critical"),
      said: await make("CRM_COMMENT_ADDED", "INFO", { needsYou: true }, "said"),
      denied: await make("CRM_TASK_ASSIGNED", "CRITICAL", { needsYou: false }, "denied"),
      plain: await make("CRM_COMMENT_ADDED", "INFO", null, "plain"),
    };
    await prisma.$executeRawUnsafe(backfill());
    await prisma.$executeRawUnsafe(backfill());
    const flags = Object.fromEntries(
      await Promise.all(Object.entries(rows).map(async ([key, row]) => [key, (await prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).needsAction])),
    );
    expect(flags).toEqual({ listed: true, critical: true, said: true, denied: false, plain: false });
  });

  it("adds the four teams types", async () => {
    const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = 'NotificationType' AND enumlabel LIKE 'TEAMS_%'`;
    expect(rows.map((row) => row.enumlabel).sort()).toEqual(["TEAMS_ACCESS_REQUEST", "TEAMS_OWNERSHIP_OFFER", "TEAMS_RECORD_HANDED_OVER", "TEAMS_SEAT_REQUEST"]);
  });
});

describe("a needs-you item", () => {
  it("is written flagged, stays after it is read, and leaves when acted on", async () => {
    await prisma.notification.deleteMany({ where: { companyId } });
    // Two seats, both taken: the admin asks the owner for a third.
    await requestSeat({ companyId, userId: adminId }, { name: "Tariro Mhlanga", role: "SALES_REP" });
    const [asked] = await needs();
    expect(asked).toMatchObject({ type: "TEAMS_SEAT_REQUEST", needsYou: true, isRead: false });
    expect(asked.sentence.map((s) => s.text).join("")).toContain("Tatenda Admin");
    expect((await counts()).needs).toBe(1);

    // Opening it, and "mark all read", do not clear it.
    await prisma.notificationRecipient.updateMany({ where: { userId: ownerId }, data: { isRead: true, readAt: new Date() } });
    expect(await needs()).toHaveLength(1);
    expect((await needs())[0]).toMatchObject({ isRead: true, needsYou: true });
    expect((await counts()).needs).toBe(1);

    // Raising the limit is the act the request asked for.
    await setSeatLimit({ companyId, userId: ownerId }, 3);
    expect(await needs()).toHaveLength(0);
    expect((await counts()).needs).toBe(0);
  });

  it("is also cleared by dismissing it", async () => {
    await setSeatLimit({ companyId, userId: ownerId }, 2);
    await requestSeat({ companyId, userId: adminId }, { name: "Farai", role: "MANAGER" });
    expect(await needs()).toHaveLength(1);
    await prisma.notificationRecipient.updateMany({ where: { userId: ownerId }, data: { isArchived: true, archivedAt: new Date() } });
    expect(await needs()).toHaveLength(0);
  });

  it("is written flagged by the existing writers too, and an ordinary notice is not", async () => {
    await emitCrmNotification({ companyId, recipientIds: [ownerId], type: "CRM_TASK_ASSIGNED", title: "A task", summary: "Call back", viewPath: "/crm" });
    await emitCrmNotification({ companyId, recipientIds: [ownerId], type: "CRM_COMMENT_ADDED", title: "A comment", summary: "Said hello", viewPath: "/crm" });
    const rows = await prisma.notification.findMany({ where: { companyId, type: { in: ["CRM_TASK_ASSIGNED", "CRM_COMMENT_ADDED"] } }, select: { type: true, needsAction: true } });
    expect(Object.fromEntries(rows.map((row) => [row.type, row.needsAction]))).toEqual({ CRM_TASK_ASSIGNED: true, CRM_COMMENT_ADDED: false });
    expect((await needs()).map((item) => item.type)).toEqual(["CRM_TASK_ASSIGNED"]);
  });

  it("an ownership offer waits for its reader and leaves when it is answered", async () => {
    const offer = await offerOwnership({ companyId, userId: ownerId }, adminMembership);
    const waiting = (await needs(adminId)).filter((item) => item.type === "TEAMS_OWNERSHIP_OFFER");
    expect(waiting).toHaveLength(1);
    await acceptOwnership({ companyId, userId: adminId }, offer.id);
    expect((await needs(adminId)).filter((item) => item.type === "TEAMS_OWNERSHIP_OFFER")).toHaveLength(0);
    expect(ownerMembership).toBeTruthy();
  });
});
