import { prisma } from "@/lib/prisma";
import { createCustomer, CustomerRefusal } from "@/lib/retail/customers/create";
import { searchCustomerIds } from "@/lib/retail/customers/stats";
import { phoneDisplay } from "@/lib/retail/people/words";

import { LookupFieldErrors, type LookupCtx, type LookupNoun } from "./types";

/**
 * Customers' noun (CUS-02): `customer`, every customer field's autocomplete.
 * Reads as the name, the number beside it ("+263 77 412 3388"); found by phone
 * digits, card, code or name. The quick add is the Customers sheet's service,
 * without consent to messages (nobody asked them).
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
  async search(ctx, q) {
    const ids = q.trim() ? await searchCustomerIds(ctx.companyId, q, LIMIT) : null;
    const rows = await prisma.customer.findMany({
      where: { companyId: ctx.companyId, archivedAt: null, mergedIntoId: null, ...(ids ? { id: { in: ids } } : {}) },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: LIMIT,
      select: { id: true, name: true, phone: true },
    });
    // Names starting with what was typed first, then the rest A–Z.
    const needle = q.trim().toLowerCase();
    const starts = rows.filter((row) => needle && row.name.toLowerCase().startsWith(needle));
    const rest = rows.filter((row) => !starts.includes(row));
    return [...starts, ...rest].map((row) => ({ id: row.id, label: row.name, sub: row.phone ? phoneDisplay(row.phone) : null }));
  },
  async add(ctx, fields) {
    try {
      const created = await prisma.$transaction((tx) =>
        createCustomer(tx, actorOf(ctx), { name: fields.name ?? "", phone: fields.phone ?? "", marketingConsent: false, via: "lookup" }),
      );
      return { id: created.id, label: created.name, sub: phoneDisplay(created.phone) };
    } catch (error) {
      if (error instanceof CustomerRefusal) {
        throw new LookupFieldErrors(error.fieldErrors);
      }
      throw error;
    }
  },
};

export const CUSTOMER_LOOKUPS: LookupNoun[] = [customer];
