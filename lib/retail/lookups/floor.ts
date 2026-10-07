import { prisma } from "@/lib/prisma";
import { createRetailTill, NoSiteForTill, TillNameTaken } from "@/lib/retail/tills";

import { LookupFieldErrors, type LookupNoun } from "./types";

/** The floor's noun: `till`, with its inline add. `person` is People's (`./people.ts`). */

/** A till reads "Open" while a shift is open on it, else "Closed". */
const till: LookupNoun = {
  noun: "till",
  // Tills and devices, or anybody who opens a shift on one.
  read: [
    ["retail.tills", "view"],
    ["retail.sell", "open-shift"],
    ["retail.cash-control", "open-shift"],
  ],
  create: ["retail.tills", "create"],
  quick: [{ key: "name", label: "Name", placeholder: "" }],
  async search(ctx, q) {
    const registers = await prisma.retailRegister.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        site: { isActive: true },
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: [{ code: "asc" }],
      take: 200,
      select: { id: true, name: true, code: true, siteId: true },
    });
    if (registers.length === 0) return [];
    const open = await prisma.retailShift.findMany({
      where: { companyId: ctx.companyId, status: "OPEN", registerId: { in: registers.map((row) => row.id) } },
      select: { registerId: true },
    });
    const busy = new Set(open.map((row) => row.registerId));
    return registers.map((row) => ({
      id: row.id,
      label: row.name,
      sub: busy.has(row.id) ? "Open" : "Closed",
    }));
  },
  async add(ctx, fields) {
    const name = (fields.name ?? "").trim();
    if (!name) throw new LookupFieldErrors({ name: "Name is needed." });
    if (name.length > 120) throw new LookupFieldErrors({ name: "Keep the name to 120 characters." });
    try {
      const created = await createRetailTill(ctx.companyId, name);
      return { id: created.id, label: created.name, sub: "Closed" };
    } catch (error) {
      if (error instanceof TillNameTaken || error instanceof NoSiteForTill) {
        throw new LookupFieldErrors({ name: error.message });
      }
      throw error;
    }
  },
};

export const FLOOR_LOOKUPS: LookupNoun[] = [till];
