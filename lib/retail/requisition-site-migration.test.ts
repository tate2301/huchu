/**
 * Migration witness for `20261003200000_requisition_site`.
 *
 * A requisition can name the shop it was raised at, and outlives that shop
 * being deleted by forgetting it — the money was still asked for and paid.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

describe("CrmRequisition.siteId, as stored", () => {
  it("is an optional link to a site that is forgotten when the site goes", async () => {
    const [column] = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'CrmRequisition' AND column_name = 'siteId'`;
    expect(column.is_nullable).toBe("YES");
    const [fk] = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
      SELECT delete_rule FROM information_schema.referential_constraints
      WHERE constraint_name = 'CrmRequisition_siteId_fkey'`;
    expect(fk.delete_rule).toBe("SET NULL");
  });
});
