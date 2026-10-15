/**
 * Migration witness for `20261015100000_vane_finish`.
 *
 * A work order has its own workspace (backfilled from its equipment's site),
 * a maker who may leave, a priority, Vane's mark and Vane's note, and a
 * status of draft before open. Vane's reader scopes work orders by that
 * workspace and reads the new columns. A reader connection can be bound to
 * a rep, and `vane_reader_rep` exists: no sign-in of its own, switched to by
 * `vane_reader`, its rows narrowed by a policy on each table it reads.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { makeTestShop } from "@/lib/retail/products/test-fixtures";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261015100000_vane_finish/migration.sql");

const column = async (table: string, name: string) =>
  (
    await prisma.$queryRaw<Array<{ is_nullable: string; column_default: string | null }>>`
      SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${name}`
  )[0] ?? null;

const onDelete = async (table: string, name: string) =>
  (
    await prisma.$queryRaw<Array<{ rule: string }>>`
      SELECT rc.delete_rule AS rule FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name = ${table} AND kcu.column_name = ${name}`
  )[0]?.rule ?? null;

const reads = async (role: string, table: string, name: string) =>
  (
    await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM information_schema.column_privileges
      WHERE grantee = ${role} AND privilege_type = 'SELECT' AND table_name = ${table} AND column_name = ${name}`
  )[0]!.n > BigInt(0);

class RolledBack extends Error {}

describe("Vane's finished boards, as stored", () => {
  it("gives a work order its workspace, maker, priority and Vane's mark, and a draft status before open", async () => {
    expect(await column("WorkOrder", "companyId")).toMatchObject({ is_nullable: "NO" });
    expect(await onDelete("WorkOrder", "companyId")).toBe("CASCADE");
    expect(await column("WorkOrder", "createdById")).toMatchObject({ is_nullable: "YES" });
    expect(await onDelete("WorkOrder", "createdById")).toBe("SET NULL");
    expect((await column("WorkOrder", "priority"))?.column_default).toContain("NORMAL");
    expect((await column("WorkOrder", "madeByVane"))?.column_default).toBe("false");
    expect(await column("WorkOrder", "vaneNote")).toMatchObject({ is_nullable: "YES" });
    const [statuses] = await prisma.$queryRaw<Array<{ values: string }>>`SELECT enum_range(NULL::"WorkOrderStatus")::text AS values`;
    expect(statuses!.values).toBe("{DRAFT,OPEN,IN_PROGRESS,COMPLETED,CANCELLED}");
  });

  it("backfills a work order's workspace from its equipment's site", async () => {
    const shop = await makeTestShop("Vane finish witness");
    try {
      const location = await prisma.stockLocation.findFirstOrThrow({ where: { siteId: shop.mainId }, select: { id: true } });
      const equipment = await prisma.equipment.create({ data: { equipmentCode: "C-1", name: "Crusher", category: "CRUSHER", siteId: shop.mainId, locationId: location.id } });
      const order = await prisma.workOrder.create({ data: { companyId: shop.companyId, equipmentId: equipment.id, issue: "Jaw plate", downtimeStart: new Date() } });
      const backfill = readFileSync(MIGRATION, "utf8")
        .split(/;\s*\n/)
        .find((statement) => /^\s*(--.*\n)*\s*UPDATE "WorkOrder"/m.test(statement))!;
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`ALTER TABLE "WorkOrder" ALTER COLUMN "companyId" DROP NOT NULL`);
          await tx.$executeRawUnsafe(`UPDATE "WorkOrder" SET "companyId" = NULL WHERE "id" = $1`, order.id);
          await tx.$executeRawUnsafe(backfill);
          const [row] = await tx.$queryRaw<Array<{ companyId: string }>>`SELECT "companyId" FROM "WorkOrder" WHERE "id" = ${order.id}`;
          expect(row!.companyId).toBe(shop.companyId);
          throw new RolledBack();
        }),
      ).rejects.toBeInstanceOf(RolledBack);
      await prisma.workOrder.deleteMany({ where: { companyId: shop.companyId } });
      await prisma.equipment.deleteMany({ where: { id: equipment.id } });
    } finally {
      await destroyProvisionedTenant(shop.companyId);
    }
  });

  it("scopes Vane's reading of work orders by their workspace, and reads the new columns", async () => {
    for (const name of ["companyId", "createdById", "madeByVane", "priority", "vaneNote"]) expect(await reads("vane_reader", "WorkOrder", name)).toBe(true);
    const [policy] = await prisma.$queryRaw<Array<{ qual: string }>>`SELECT qual FROM pg_policies WHERE tablename = 'WorkOrder' AND policyname = 'vane_workspace'`;
    expect(policy!.qual).toContain(`"companyId"`);
  });

  it("binds a reader connection to a rep, and narrows a rep's role table by table", async () => {
    expect(await column("VaneReaderScope", "userId")).toMatchObject({ is_nullable: "YES" });
    const [role] = await prisma.$queryRaw<Array<{ rolcanlogin: boolean }>>`SELECT rolcanlogin FROM pg_roles WHERE rolname = 'vane_reader_rep'`;
    expect(role).toEqual({ rolcanlogin: false });
    const [member] = await prisma.$queryRaw<Array<{ yes: boolean }>>`SELECT pg_has_role('vane_reader', 'vane_reader_rep', 'MEMBER') AS yes`;
    expect(member!.yes).toBe(true);
    const narrowed = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_policies WHERE policyname = 'vane_rep' ORDER BY tablename`;
    expect(narrowed.map((row) => row.tablename)).toEqual(expect.arrayContaining(["CrmAppointment", "CrmDeal", "CrmLead", "CrmLeadDocument", "SalesQuotation", "SalesQuotationLine"]));
    expect(await reads("vane_reader_rep", "CrmDeal", "assignedToId")).toBe(true);
    expect(await reads("vane_reader_rep", "SalesInvoice", "id")).toBe(false);
  });
});
