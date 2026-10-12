import { prisma } from "@/lib/prisma";
import { createCustomer, CustomerRefusal } from "@/lib/retail/customers/create";
import { nameAndPhone, pointsAndVisits } from "@/lib/retail/customers/merge-words";
import { customerFigures, searchCustomerIds } from "@/lib/retail/customers/stats";
import { phoneDisplay } from "@/lib/retail/people/words";

import { LookupFieldErrors, type LookupCtx, type LookupNoun } from "./types";

/**
 * Customers' noun (CUS-02): `customer`, every customer field's autocomplete.
 * Reads as the name, the number beside it ("+263 77 412 3388"); found by phone
 * digits, card, code or name. The quick add is the Customers sheet's service,
 * without consent to messages (nobody asked them).
 *
 * Context `{ for: "merge", excludeId }` (CUS-05): the record itself left out,
 * each read as name and number over their points and visits.
 */

const actorOf = (ctx: LookupCtx) => ({
  companyId: ctx.companyId,
  userId: ctx.userId,
  userName: ctx.userName,
  userRole: ctx.session.user.role ?? null,
});

const LIMIT = 50;

const customer: LookupNoun = {
  noun: "customer",
  read: [
    ["retail.customers", "view"],
    ["retail.sell", "view"],
  ],
  create: ["retail.customers", "create"],
  quick: [
    { key: "name", label: "Name", placeholder: "" },
    { key: "phone", label: "Phone or WhatsApp", placeholder: "+263 7" },
  ],
  ranked: true,
  async search(ctx, q, context) {
    const merging = context.for === "merge";
    const excludeId = typeof context.excludeId === "string" ? context.excludeId : null;
    const ids = q.trim() ? await searchCustomerIds(ctx.companyId, q, LIMIT + 1) : null;
    const rows = await prisma.customer.findMany({
      where: {
        companyId: ctx.companyId,
        archivedAt: null,
        mergedIntoId: null,
        ...(ids ? { id: { in: ids } } : {}),
        ...(merging && excludeId ? { NOT: { id: excludeId } } : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: LIMIT,
      select: { id: true, name: true, phone: true },
    });
    // Names starting with what was typed first, then the rest A–Z.
    const needle = q.trim().toLowerCase();
    const starts = rows.filter((row) => needle && row.name.toLowerCase().startsWith(needle));
    const rest = rows.filter((row) => !starts.includes(row));
    const ordered = [...starts, ...rest];
    if (!merging) return ordered.map((row) => ({ id: row.id, label: row.name, sub: row.phone ? phoneDisplay(row.phone) : null }));
    // Merging (CUS-05): "T. Marange, +263 77 412 3380" over "412 points, 9 visits".
    const figures = new Map((await customerFigures(ctx.companyId, ordered.map((row) => row.id))).map((row) => [row.id, row]));
    return ordered.map((row) => {
      const found = figures.get(row.id);
      return { id: row.id, label: nameAndPhone(row), sub: pointsAndVisits(found?.points ?? 0, found?.visits ?? 0) };
    });
  },
  async add(ctx, fields, context) {
    try {
      const created = await prisma.$transaction((tx) =>
        createCustomer(tx, actorOf(ctx), { name: fields.name ?? "", phone: fields.phone ?? "", marketingConsent: false, via: "lookup" }),
      );
      return context.for === "merge"
        ? { id: created.id, label: nameAndPhone(created), sub: pointsAndVisits(0, 0) }
        : { id: created.id, label: created.name, sub: phoneDisplay(created.phone) };
    } catch (error) {
      if (error instanceof CustomerRefusal) {
        throw new LookupFieldErrors(error.fieldErrors);
      }
      throw error;
    }
  },
};

export const CUSTOMER_LOOKUPS: LookupNoun[] = [customer];
