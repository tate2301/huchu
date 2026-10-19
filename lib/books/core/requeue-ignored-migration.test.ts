/**
 * Migration witness for `20261019120000_books_requeue_ignored_money` (D14,
 * approved 19 Oct for P1).
 *
 * Money written IGNORED waits again: PENDING on its own date for the drain;
 * held for a person in Needs posting when its month is closed, never posted
 * there on its own; POSTED where the ledger already has it. A record with no
 * money stays IGNORED, and running it twice changes nothing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { HELD_UNTIL } from "./holds";

const NAME = "20261019120000_books_requeue_ignored_money";
const SQL = readFileSync(path.resolve(__dirname, `../../../prisma/migrations/${NAME}/migration.sql`), "utf8");

/** The migration, statement by statement, as `migrate deploy` runs it. */
async function backfill() {
  const statements = SQL.split(/;\s*\n/)
    .map((part) => part.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  for (const statement of statements) await prisma.$executeRawUnsafe(statement);
}

let companyId: string;
let userId: string;
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const ignored = (key: string, data: Record<string, unknown>) =>
  prisma.accountingIntegrationEvent.create({
    data: { companyId, sourceDomain: "crm-requisitions", sourceAction: "disbursed", eventKey: `${stamp}:${key}`, status: "IGNORED", ...data },
  });

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `D14 ${stamp}`, slug: `d14-${stamp}` }, select: { id: true } })).id;
  userId = (await prisma.user.create({ data: { email: `d14-${stamp}@books.test`, name: "Owner", role: "SUPERADMIN", companyId }, select: { id: true } })).id;
});

afterAll(async () => {
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("money written IGNORED, re-queued", () => {
  it("is applied to the database", async () => {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${NAME} AND finished_at IS NOT NULL`;
    expect(rows).toHaveLength(1);
  });

  it("waits again, holds a closed month for a person, and leaves records alone", async () => {
    await prisma.accountingPeriod.create({
      data: { companyId, startDate: new Date(Date.UTC(2025, 8, 1)), endDate: new Date(Date.UTC(2025, 8, 30)), status: "CLOSED" },
    });
    const open = await ignored("open", { sourceType: "CRM_REQUISITION_DISBURSEMENT", sourceId: "req-open", amount: 400, entryDate: new Date(Date.UTC(2026, 9, 2)) });
    const closed = await ignored("closed", { sourceType: "CRM_REQUISITION_TOPUP", sourceId: "req-closed", amount: 45, entryDate: new Date(Date.UTC(2025, 8, 30, 14)) });
    const record = await ignored("record", { sourceDomain: "gold", sourceAction: "shift-allocation-approved", sourceId: "alloc-1" });
    const zero = await ignored("zero", { sourceType: "CRM_COST_ENTRY_SPEND", sourceId: "cost-zero", amount: 0 });
    const entry = await prisma.journalEntry.create({
      data: { companyId, entryNumber: 1, entryDate: new Date(), description: "Posted another way", status: "POSTED", sourceType: "CRM_COST_ENTRY_SPEND", sourceId: "cost-posted", createdById: userId },
    });
    const posted = await ignored("posted", { sourceType: "CRM_COST_ENTRY_SPEND", sourceId: "cost-posted", amount: 75 });

    await backfill();
    const read = async (id: string) => prisma.accountingIntegrationEvent.findUniqueOrThrow({ where: { id } });

    expect(await read(open.id)).toMatchObject({ status: "PENDING", nextRetryAt: null, attemptCount: 0, entryDate: open.entryDate });
    const held = await read(closed.id);
    expect(held).toMatchObject({ status: "FAILED", nextRetryAt: HELD_UNTIL });
    expect(held.lastError).toBe("September 2025 is closed, so this was not posted on its own. Post it in this month, or reopen September 2025.");
    expect(await read(posted.id)).toMatchObject({ status: "POSTED", journalEntryId: entry.id });
    expect(await read(record.id)).toMatchObject({ status: "IGNORED" });
    expect(await read(zero.id)).toMatchObject({ status: "IGNORED" });

    // Twice changes nothing.
    const before = await prisma.accountingIntegrationEvent.findMany({ where: { companyId }, orderBy: { id: "asc" }, select: { id: true, status: true, nextRetryAt: true, lastError: true, journalEntryId: true } });
    await backfill();
    expect(await prisma.accountingIntegrationEvent.findMany({ where: { companyId }, orderBy: { id: "asc" }, select: { id: true, status: true, nextRetryAt: true, lastError: true, journalEntryId: true } })).toEqual(before);
  });
});
