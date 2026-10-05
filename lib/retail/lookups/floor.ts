import type { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { createRetailTill, NoSiteForTill, TillNameTaken } from "@/lib/retail/tills";

import { LookupFieldErrors, type LookupNoun } from "./types";

/**
 * The floor's nouns: `till` (with its inline add) and `person`, read only —
 * the admin spec registers the person's create service.
 */

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
      where: { companyId: ctx.companyId, status: "OPEN", registerCode: { in: registers.map((row) => row.code) } },
      select: { registerCode: true, siteId: true },
    });
    const busy = new Set(open.map((row) => `${row.siteId}:${row.registerCode}`));
    return registers.map((row) => ({
      id: row.id,
      label: row.name,
      sub: busy.has(`${row.siteId}:${row.code}`) ? "Open" : "Closed",
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

/** What a person's role reads as beside their name. */
const ROLE_WORDS: Partial<Record<UserRole, string>> = {
  SUPERADMIN: "Owner",
  MANAGER: "Manager",
  SHOP_MANAGER: "Manager",
  CASHIER: "Cashier",
  STOCK_CLERK: "Stock clerk",
  FINANCE_OFFICER: "Bookkeeper",
};

/**
 * People of the shop. `context.can = "sell"` keeps those who may sell at a till
 * (open a shift), which is what the Cashier field asks for.
 */
const person: LookupNoun = {
  noun: "person",
  read: [
    ["retail.people", "view"],
    ["retail.cash-control", "open-shift"],
  ],
  quick: [],
  async search(ctx, q, context) {
    const users = await prisma.user.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        role: { in: Object.keys(ROLE_WORDS) as UserRole[] },
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: [{ name: "asc" }],
      take: 200,
      select: { id: true, name: true, role: true },
    });
    const sellersOnly = context.can === "sell";
    return users
      .filter((user) => !sellersOnly || canRetailRoleDo(user.role, "retail.sell", "open-shift"))
      .map((user) => ({ id: user.id, label: user.name, sub: ROLE_WORDS[user.role] ?? null }));
  },
};

export const FLOOR_LOOKUPS: LookupNoun[] = [till, person];
