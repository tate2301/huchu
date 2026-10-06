import { prisma } from "@/lib/prisma";

import type { LookupNoun, LookupOption } from "./types";

/**
 * Buying's nouns. `supplier`, first version (PRD-03): the company's active
 * suppliers by name, read by whoever buys or adds products. BUY-01 replaces
 * it in this file with its sub ("Beverages, 30 days"), payee, contact and
 * quick add.
 */
const supplier: LookupNoun = {
  noun: "supplier",
  read: [
    ["retail.suppliers", "view"],
    ["retail.catalog", "create"],
  ],
  quick: [],
  async search(ctx, q) {
    const rows = await prisma.vendor.findMany({
      where: { companyId: ctx.companyId, isActive: true, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return rows.map((row): LookupOption => ({ id: row.id, label: row.name, sub: null }));
  },
};

export const BUYING_LOOKUPS: LookupNoun[] = [supplier];
