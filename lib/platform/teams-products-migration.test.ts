/**
 * Migration witness for `teams_products`.
 *
 * Tender and Pabasa are products a workspace can be sold as; Corelith and Flare
 * keep their values, so no existing workspace changes.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

describe("teams products", () => {
  it("adds Tender and Pabasa after the two that existed", async () => {
    const [{ labels }] = await prisma.$queryRaw<Array<{ labels: string[] }>>`
      SELECT array_agg(enumlabel ORDER BY enumsortorder)::text[] AS labels
      FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = 'WorkspaceProduct'`;
    expect(labels).toEqual(["CORELITH", "FLARE", "TENDER", "PABASA"]);
  });

  it("lets a workspace be created as either", async () => {
    const run = crypto.randomUUID().slice(0, 8);
    const made = await Promise.all(
      (["TENDER", "PABASA"] as const).map((product) =>
        prisma.company.create({ data: { name: `${product} ${run}`, slug: `${product.toLowerCase()}-${run}`, product }, select: { id: true, product: true } }),
      ),
    );
    expect(made.map((company) => company.product)).toEqual(["TENDER", "PABASA"]);
    await prisma.company.deleteMany({ where: { id: { in: made.map((company) => company.id) } } });
  });
});
