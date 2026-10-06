import { prisma } from "@/lib/prisma";
import { addContact, createSupplier, REP_ROLE, SupplierRefusal } from "@/lib/retail/buying/suppliers";
import { supplierCategories, termsSub } from "@/lib/retail/buying/supplier-view";

import { LookupFieldErrors, type LookupCtx, type LookupNoun, type LookupOption, type QuickField } from "./types";

/**
 * Buying's nouns (40-buying 4.2): `supplier` and `payee` (the suppliers still
 * bought from), `contact` (one supplier's people) and `contact role` (the
 * words a contact's role is written in). Inline adds go through the same
 * services as the sheets.
 */

const actorOf = (ctx: LookupCtx) => ({
  companyId: ctx.companyId,
  userId: ctx.userId,
  userName: ctx.userName,
  userRole: ctx.session.user?.role ?? null,
});

const QUICK_SUPPLIER: QuickField[] = [
  { key: "name", label: "Name", placeholder: "" },
  { key: "phone", label: "Phone or WhatsApp", placeholder: "+263 7" },
];

/** A service refusal as the inline panel's field errors. */
function asFieldErrors(error: unknown, fallbackField: string): never {
  if (error instanceof SupplierRefusal) {
    throw new LookupFieldErrors(error.fieldErrors ?? { [fallbackField]: error.message });
  }
  throw error;
}

/** Suppliers still bought from whose name, code or phone has `q`, by name. */
async function boughtFrom(ctx: LookupCtx, q: string) {
  const term = q.trim();
  return prisma.vendor.findMany({
    where: {
      companyId: ctx.companyId,
      stoppedAt: null,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { code: { contains: term, mode: "insensitive" as const } },
              { phone: { contains: term } },
              { whatsapp: { contains: term } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, payTermsDays: true },
  });
}

async function addSupplier(ctx: LookupCtx, fields: Record<string, string>) {
  try {
    const created = await prisma.$transaction((tx) =>
      createSupplier(tx, actorOf(ctx), { name: fields.name ?? "", phone: fields.phone ?? null, pays: "On delivery" }, "sheet"),
    );
    return { id: created.id, label: created.name, sub: null, notice: `${created.name} added. It is in every supplier field now.` };
  } catch (error) {
    return asFieldErrors(error, "name");
  }
}

/** "Beverages, 30 days": the category most of its products are in, then its terms. */
const supplier: LookupNoun = {
  noun: "supplier",
  read: [
    ["retail.suppliers", "view"],
    // The product form's Supplier (PRD-03).
    ["retail.catalog", "create"],
  ],
  create: ["retail.suppliers", "create"],
  quick: QUICK_SUPPLIER,
  async search(ctx, q) {
    const [rows, categories] = await Promise.all([boughtFrom(ctx, q), supplierCategories(ctx.companyId)]);
    return rows.map(
      (row): LookupOption => ({
        id: row.id,
        label: row.name,
        sub: [categories.get(row.id)?.top ?? null, termsSub(row.payTermsDays)].filter(Boolean).join(", "),
      }),
    );
  },
  add: (ctx, fields) => addSupplier(ctx, fields),
};

/** A requisition's Pay to: the same suppliers. */
const payee: LookupNoun = {
  noun: "payee",
  read: [["retail.requisitions", "view"]],
  create: ["retail.suppliers", "create"],
  quick: QUICK_SUPPLIER,
  async search(ctx, q) {
    return (await boughtFrom(ctx, q)).map((row): LookupOption => ({ id: row.id, label: row.name, sub: "Supplier" }));
  },
  add: (ctx, fields) => addSupplier(ctx, fields),
};

const supplierIdOf = (context: Record<string, unknown>) => (typeof context.supplierId === "string" ? context.supplierId : null);

/** One supplier's people: "Tinashe Moyo, rep", "Delta orders desk"; the phone, else the email. */
const contact: LookupNoun = {
  noun: "contact",
  read: [["retail.suppliers", "view"]],
  create: ["retail.suppliers", "update"],
  quick: QUICK_SUPPLIER,
  async search(ctx, q, context) {
    const supplierId = supplierIdOf(context);
    if (!supplierId) return [];
    const vendor = await prisma.vendor.findFirst({ where: { id: supplierId, companyId: ctx.companyId }, select: { contactName: true } });
    if (!vendor) return [];
    const contacts = await prisma.vendorContact.findMany({
      where: { vendorId: supplierId, companyId: ctx.companyId, removedAt: null, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, phone: true, email: true },
    });
    return contacts.map(
      (row): LookupOption => ({
        id: row.id,
        label: vendor.contactName === row.name ? `${row.name}, rep` : row.name,
        sub: row.phone ?? row.email ?? null,
      }),
    );
  },
  async add(ctx, fields, context) {
    const supplierId = supplierIdOf(context);
    if (!supplierId) throw new LookupFieldErrors({ name: "Pick the supplier first." });
    try {
      const added = await prisma.$transaction(async (tx) => {
        const vendor = await tx.vendor.findFirst({ where: { id: supplierId, companyId: ctx.companyId }, select: { contactName: true } });
        return addContact(tx, actorOf(ctx), supplierId, {
          name: fields.name ?? "",
          phone: fields.phone ?? null,
          role: vendor && !vendor.contactName ? REP_ROLE : null,
          sends: "Orders",
        });
      });
      return { id: added.id, label: added.isRep ? `${added.name}, rep` : added.name, sub: added.phone ?? added.email };
    } catch (error) {
      return asFieldErrors(error, "name");
    }
  },
};

export const CONTACT_ROLES = [REP_ROLE, "Accounts", "Orders desk", "Driver"] as const;

/** A contact's role: the four words, then any other the shop has used; a new word is added as typed. */
const contactRole: LookupNoun = {
  noun: "contact role",
  read: [["retail.suppliers", "view"]],
  create: ["retail.suppliers", "update"],
  quick: [{ key: "name", label: "Name", placeholder: "" }],
  ranked: true,
  async search(ctx, q) {
    const used = await prisma.vendorContact.findMany({
      where: { companyId: ctx.companyId, removedAt: null, role: { not: null } },
      distinct: ["role"],
      select: { role: true },
      orderBy: { role: "asc" },
    });
    const known = new Set<string>(CONTACT_ROLES.map((role) => role.toLowerCase()));
    const words = [...CONTACT_ROLES, ...used.map((row) => row.role!).filter((role) => !known.has(role.toLowerCase()))];
    const needle = q.trim().toLowerCase();
    return words.filter((word) => !needle || word.toLowerCase().includes(needle)).map((word) => ({ id: word, label: word, sub: null }));
  },
  async add(_ctx, fields) {
    const word = (fields.name ?? "").replace(/\s+/g, " ").trim();
    if (!word) throw new LookupFieldErrors({ name: "Write the role." });
    if (word.length > 60) throw new LookupFieldErrors({ name: "Keep the role to 60 characters." });
    return { id: word, label: word, sub: null };
  },
};

export const BUYING_LOOKUPS: LookupNoun[] = [supplier, payee, contact, contactRole];
