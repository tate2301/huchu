import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { orderTotals } from "@/lib/retail/buying/figures";
import { addMoneyAccount, listMoneyAccounts, MoneyAccountRefusal, moneyAccountSub } from "@/lib/retail/buying/money-accounts";
import { LIVE_STATES } from "@/lib/retail/buying/requisition-words";
import { OrderRefusal, raiseOrder } from "@/lib/retail/buying/orders";
import { defaultSiteFor } from "@/lib/retail/floor/default-site";
import { formatMoney, parseDay } from "@/lib/workspace/format";
import { addContact, createSupplier, repOf, REP_ROLE, SupplierRefusal } from "@/lib/retail/buying/suppliers";
import { supplierCategories, termsSub } from "@/lib/retail/buying/supplier-view";
import { phoneSearchText } from "@/lib/retail/people/words";

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

/**
 * Suppliers still bought from whose name, code, phone or WhatsApp has `q`, by
 * name. A typed number matches by its digits, however it is spaced and with a
 * leading 0 or +263 or neither: "2701600", "0242701600" and "+263 24 270 1600"
 * all find "+263 24 270 1600". A shop has a handful of suppliers, so they are
 * matched in memory; names that start with `q` come first.
 */
async function boughtFrom(ctx: LookupCtx, q: string) {
  const rows = await prisma.vendor.findMany({
    where: { companyId: ctx.companyId, stoppedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, phone: true, whatsapp: true, payTermsDays: true },
  });
  const term = q.trim().toLowerCase();
  if (!term) return rows;
  const digits = /^[\d\s+()-]+$/.test(term) ? term.replace(/\D/g, "") : "";
  const found = rows.filter(
    (row) =>
      row.name.toLowerCase().includes(term) ||
      (row.code ?? "").toLowerCase().includes(term) ||
      (digits.length > 0 && [row.phone, row.whatsapp].some((phone) => phoneSearchText(phone?.replace(/\s/g, "")).includes(digits))),
  );
  // Ranked here (the nouns are `ranked`), since a match by code or number is not in the label: names that start with it first.
  const starts = (row: (typeof rows)[number]) => row.name.toLowerCase().startsWith(term);
  return [...found.filter(starts), ...found.filter((row) => !starts(row))];
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
  ranked: true,
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
  read: [
    ["retail.requisitions", "view"],
    ["retail.requisitions", "view-own"],
  ],
  create: ["retail.suppliers", "create"],
  quick: QUICK_SUPPLIER,
  ranked: true,
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
    // The rep is chosen over all of them, oldest first, before the typed name narrows the list.
    const contacts = await prisma.vendorContact.findMany({
      where: { vendorId: supplierId, companyId: ctx.companyId, removedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, phone: true, email: true },
    });
    const rep = repOf(vendor.contactName, contacts);
    const needle = q.trim().toLowerCase();
    return contacts
      .filter((row) => !needle || row.name.toLowerCase().includes(needle))
      .map(
        (row): LookupOption => ({
          id: row.id,
          label: row === rep ? `${row.name}, rep` : row.name,
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

/**
 * Orders a requisition can be for (40-buying 4.3): drafts and open orders not
 * in the bin, "PO-0005 · Afdis Distillers", sub the total with VAT. The quick
 * add makes an empty draft for the supplier named.
 */
const order: LookupNoun = {
  noun: "order",
  read: [["retail.requisitions", "create"]],
  create: ["retail.purchasing", "create"],
  quick: [
    { key: "supplier", label: "Supplier", placeholder: "" },
    { key: "expected", label: "Expected", placeholder: "" },
  ],
  ranked: true,
  async search(ctx, q) {
    const needle = q.trim();
    const rows = await prisma.retailPurchaseOrder.findMany({
      where: {
        companyId: ctx.companyId,
        archivedAt: null,
        status: { in: ["DRAFT", "SENT", "PARTIAL"] },
        // One live requisition per order: an order already asked for is not offered.
        requisitions: { none: { status: { in: LIVE_STATES } } },
        ...(needle
          ? { OR: [{ poNo: { contains: needle, mode: "insensitive" } }, { vendor: { name: { contains: needle, mode: "insensitive" } } }] }
          : {}),
      },
      orderBy: { poNo: "desc" },
      take: 100,
      select: { id: true, poNo: true, vendor: { select: { name: true } }, lines: { select: { quantity: true, unitCost: true, vatRate: true } } },
    });
    return rows.map((row): LookupOption => ({
      id: row.id,
      label: `${row.poNo} · ${row.vendor.name}`,
      sub: formatMoney(toNumberOrZero(orderTotals(row.lines).total)),
    }));
  },
  async add(ctx, fields) {
    const name = (fields.supplier ?? "").trim();
    if (!name) throw new LookupFieldErrors({ supplier: "Say who the order is for." });
    const vendor = await prisma.vendor.findFirst({
      where: { companyId: ctx.companyId, stoppedAt: null, name: { equals: name, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (!vendor) throw new LookupFieldErrors({ supplier: `There is no supplier called ${name}.` });
    const typed = (fields.expected ?? "").trim();
    const expected = typed ? parseDay(typed) : null;
    if (typed && !expected) throw new LookupFieldErrors({ expected: "Write a date, like 7 October 2026." });
    const siteId = await defaultSiteFor(ctx.companyId, ctx.userId);
    if (!siteId) throw new LookupFieldErrors({ supplier: "Add a site first." });
    try {
      const raised = await raiseOrder(
        actorOf(ctx),
        { supplierId: vendor.id, siteId, expectedDate: expected, lines: [], payment: "ON_ACCOUNT", send: false },
        { requestUrl: ctx.requestUrl ?? "http://localhost" },
      );
      return { id: raised.id, label: `${raised.poNo} · ${vendor.name}`, sub: formatMoney(0), notice: `${raised.poNo} saved as a draft.` };
    } catch (error) {
      if (error instanceof OrderRefusal) throw new LookupFieldErrors(error.fieldErrors ?? { supplier: error.message });
      throw error;
    }
  },
};

/**
 * Where money comes from (40-buying 4.5): the live money accounts, cash
 * first, sub the balance of a cash account or the last four of a number. The
 * quick add takes a name and "Cash, bank or mobile".
 */
const moneyAccount: LookupNoun = {
  noun: "money account",
  read: [
    ["retail.requisitions", "view"],
    ["retail.requisitions", "view-own"],
  ],
  // Owners and managers: the setup right ADM-01 removed stood for them.
  create: ["retail.requisitions", "approve"],
  quick: [
    { key: "name", label: "Name", placeholder: "" },
    { key: "kind", label: "Kind", placeholder: "Cash, bank or mobile" },
  ],
  async search(ctx, q) {
    const needle = q.trim().toLowerCase();
    const accounts = await listMoneyAccounts(ctx.companyId);
    return accounts
      .filter((account) => !needle || account.name.toLowerCase().includes(needle))
      .map((account): LookupOption => ({ id: account.id, label: account.name, sub: moneyAccountSub(account) }));
  },
  async add(ctx, fields) {
    try {
      const created = await addMoneyAccount(ctx.companyId, { name: fields.name ?? "", kind: fields.kind ?? "" });
      return { id: created.id, label: created.name, sub: moneyAccountSub(created), notice: `${created.name} added.` };
    } catch (error) {
      if (error instanceof MoneyAccountRefusal) throw new LookupFieldErrors(error.fieldErrors);
      throw error;
    }
  },
};

/** "Other expenses" when the account is left empty. */
const OTHER_EXPENSES = "5590";

/**
 * What a shop spends on that is not stock (40-buying 4.5): the live expense
 * types. The quick add takes a name and the expense account, matched to an
 * active expense ledger account by code or name.
 */
const expenseType: LookupNoun = {
  noun: "expense type",
  read: [
    ["retail.requisitions", "view"],
    ["retail.requisitions", "view-own"],
  ],
  create: ["retail.requisitions", "approve"],
  quick: [
    { key: "name", label: "Name", placeholder: "" },
    { key: "account", label: "Account", placeholder: "Expenses" },
  ],
  async search(ctx, q) {
    const needle = q.trim();
    const rows = await prisma.retailExpenseType.findMany({
      where: { companyId: ctx.companyId, archivedAt: null, ...(needle ? { name: { contains: needle, mode: "insensitive" } } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, ledgerAccount: { select: { code: true, name: true } } },
    });
    return rows.map((row): LookupOption => ({ id: row.id, label: row.name, sub: row.ledgerAccount ? `${row.ledgerAccount.code} ${row.ledgerAccount.name}` : null }));
  },
  async add(ctx, fields) {
    const name = (fields.name ?? "").replace(/\s+/g, " ").trim();
    if (!name) throw new LookupFieldErrors({ name: "Write its name." });
    if (name.length > 80) throw new LookupFieldErrors({ name: "Keep the name to 80 characters." });
    const typed = (fields.account ?? "").trim();
    const account = await prisma.chartOfAccount.findFirst({
      where: {
        companyId: ctx.companyId,
        type: "EXPENSE",
        isActive: true,
        ...(typed ? { OR: [{ code: typed }, { name: { equals: typed, mode: "insensitive" } }] } : { code: OTHER_EXPENSES }),
      },
      select: { id: true, code: true, name: true },
    });
    if (!account) throw new LookupFieldErrors({ account: `There is no expense account called ${typed || "Other expenses"}.` });
    const clash = await prisma.retailExpenseType.findFirst({ where: { companyId: ctx.companyId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (clash) throw new LookupFieldErrors({ name: `There is already an expense called ${name}.` });
    const created = await prisma.retailExpenseType.create({
      data: { companyId: ctx.companyId, name, category: "OTHER", ledgerAccountId: account.id },
      select: { id: true, name: true },
    });
    return { id: created.id, label: created.name, sub: `${account.code} ${account.name}`, notice: `${created.name} added.` };
  },
};

/**
 * Receive's "Paid in cash instead?" (40-buying 4.4): requisitions paid out
 * for `context.supplierId` (or for `context.orderId`) and not yet paying for
 * a delivery, "REQ-0014", sub "US$1,940.00 paid out"; newest first. None is
 * added here: "Ask for money" opens the requisition sheet.
 */
const requisition: LookupNoun = {
  noun: "requisition",
  read: [["retail.purchasing", "receive"]],
  quick: [],
  async search(ctx, q, context) {
    const supplierId = typeof context.supplierId === "string" ? context.supplierId : null;
    const orderId = typeof context.orderId === "string" ? context.orderId : null;
    if (!supplierId && !orderId) return [];
    const needle = q.trim();
    const rows = await prisma.crmRequisition.findMany({
      where: {
        companyId: ctx.companyId,
        siteId: { not: null },
        status: "DISBURSED",
        deliveries: { none: {} },
        OR: [...(supplierId ? [{ payeeVendorId: supplierId }] : []), ...(orderId ? [{ purchaseOrderId: orderId }] : [])],
        ...(needle ? { requisitionNo: { contains: needle, mode: "insensitive" as const } } : {}),
      },
      orderBy: { disbursedAt: "desc" },
      take: 50,
      select: { id: true, requisitionNo: true, amount: true, paidAmount: true, currency: true },
    });
    return rows.map((row): LookupOption => ({
      id: row.id,
      label: row.requisitionNo,
      sub: `${formatMoney(toNumberOrZero(row.paidAmount ?? row.amount), row.currency)} paid out`,
    }));
  },
};

export const BUYING_LOOKUPS: LookupNoun[] = [supplier, payee, contact, contactRole, order, moneyAccount, expenseType, requisition];
