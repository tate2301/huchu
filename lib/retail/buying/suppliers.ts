import { Prisma, type VendorContactSends } from "@prisma/client";
import { z } from "zod";

import { normalizePhoneE164 } from "@/lib/crm/phone";
import { reserveIdentifier } from "@/lib/id-generator";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { auditAmount, auditRecordEdited, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";

/**
 * Suppliers (40-buying W-29, BUY-01): a supplier is the accounting module's
 * `Vendor` with the shop's terms, its WhatsApp number and its people. Every
 * write runs in the caller's transaction with its audit event; messages are
 * queued in the outbox in that transaction and leave with the drain (SET-07).
 * Stopped suppliers keep their bills and payments and are never binned.
 */

type Tx = Prisma.TransactionClient;

/** A refusal the route answers with its status: under fields (400, 409) or as a sentence (404, 409). */
export class SupplierRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly fieldErrors: Record<string, string> | null = null,
  ) {
    super(message);
    this.name = "SupplierRefusal";
  }
}

export const NOT_FOUND = "Supplier not found";
export const CONTACT_NOT_FOUND = "Contact not found";
export const NAME_NEEDED = "Write the supplier's name.";
export const NAME_TOO_LONG = "Keep the name to 120 characters.";
export const PHONE_WRONG = "Write it as +263 77 123 4567.";
export const EMAIL_WRONG = "That is not an email address.";
export const LEAD_WRONG = "Write it as a number of days, like 2 days.";
export const MINIMUM_WRONG = "Write an amount, like 500.00.";
export const VAT_WRONG = "A VAT number has 8 digits.";
export const BP_WRONG = "A BP number has 9 or 10 digits.";
export const TOO_LONG_300 = "Keep it to 300 characters.";
export const DELIVERS_TOO_LONG = "Keep it to 80 characters.";
export const CONTACT_NAME_NEEDED = "Write their name.";
export const REACH_THEM = "Add a phone or an email so we can reach them.";
export const NO_WHATSAPP = "No WhatsApp number";
export const MESSAGE_NEEDED = "Write a message.";
export const MESSAGE_TOO_LONG = "Keep it to 1,000 characters.";

export const duplicateName = (name: string) => `There is already a supplier called ${name}.`;

/* ── Words both ways ────────────────────────────────────────────────────── */

export const PAYS = ["On delivery", "7 days", "14 days", "30 days"] as const;
export type PaysWord = (typeof PAYS)[number];

export function paysDays(word: PaysWord): number | null {
  return word === "On delivery" ? null : Number.parseInt(word, 10);
}

/** 30 → "30 days"; null → "On delivery"; anything else the shop kept → "<n> days". */
export function paysWord(days: number | null): string {
  return days === null ? "On delivery" : `${days} ${days === 1 ? "day" : "days"}`;
}

export const SENDS = ["Orders", "Statements", "Nothing"] as const;
export type SendsWord = (typeof SENDS)[number];
const SENDS_ENUM: Record<SendsWord, VendorContactSends> = { Orders: "ORDERS", Statements: "STATEMENTS", Nothing: "NOTHING" };
export const SENDS_WORD: Record<VendorContactSends, SendsWord> = { ORDERS: "Orders", STATEMENTS: "Statements", NOTHING: "Nothing" };

export const REP_ROLE = "Sales rep";

/**
 * A phone as the shop keeps it: grouped, "+263 77 301 2290" (a Zimbabwean
 * number from "0772…", "263…" or "+263…"), else "+" and its digits; 9–15
 * digits. Null when it is not a phone.
 */
export function supplierPhone(raw: string): string | null {
  const e164 = normalizePhoneE164(raw, "263");
  if (!e164) return null;
  const digits = e164.slice(1);
  if (!/^\d{9,15}$/.test(digits)) return null;
  const zim = /^263(\d{2})(\d{3})(\d{4})$/.exec(digits);
  return zim ? `+263 ${zim[1]} ${zim[2]} ${zim[3]}` : `+${digits}`;
}

/** "+263 77 214 9080" → "+263772149080", the outbox's address. */
export function e164Of(phone: string): string {
  return `+${phone.replace(/\D/g, "")}`;
}

/** "2", "2 days", "1 day" → whole days 0–60; anything else null. */
export function parseLeadTime(raw: string): number | null {
  const match = /^(\d{1,3})(\s*days?)?$/i.exec(raw.trim());
  if (!match) return null;
  const days = Number.parseInt(match[1]!, 10);
  return days <= 60 ? days : null;
}

export const leadWords = (days: number | null) => (days === null ? null : `${days} ${days === 1 ? "day" : "days"}`);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

const cleanText = (raw: string | null | undefined) => (raw ?? "").replace(/\s+/g, " ").trim();

/* ── Input ──────────────────────────────────────────────────────────────── */

const optionalText = z.string().max(2000).nullish();

export const supplierInput = z.object({
  name: z.string().max(2000).default(""),
  phone: optionalText,
  email: optionalText,
  sendOrdersOnWhatsapp: z.boolean().default(true),
  pays: z.enum(PAYS, { message: "Pick how they are paid." }).default("On delivery"),
  delivers: optionalText,
  leadTime: z.union([z.string().max(60), z.number()]).nullish(),
  minimumOrder: z.union([z.string().max(60), z.number()]).nullish(),
  vatNumber: optionalText,
  bpNumber: optionalText,
  bank: optionalText,
  address: optionalText,
});
export type SupplierInput = z.input<typeof supplierInput>;

export const supplierPatch = z
  .object({
    name: z.string().max(2000),
    repContactId: z.string().uuid().nullable(),
    phone: optionalText,
    whatsapp: optionalText,
    email: optionalText,
    sendOrdersOnWhatsapp: z.boolean(),
    pays: z.enum(PAYS, { message: "Pick how they are paid." }),
    delivers: optionalText,
    leadTime: z.union([z.string().max(60), z.number()]).nullish(),
    minimumOrder: z.union([z.string().max(60), z.number()]).nullish(),
    vatNumber: optionalText,
    bpNumber: optionalText,
    bank: optionalText,
    address: optionalText,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Change something first." });
export type SupplierPatch = z.infer<typeof supplierPatch>;

/** The sheet's field each body key is drawn under (5.11): the rail uses the body key. */
export const SHEET_FIELD: Record<string, string> = {
  name: "name",
  phone: "phone",
  email: "email",
  sendOrdersOnWhatsapp: "wa",
  pays: "pays",
  delivers: "days",
  leadTime: "lead",
  minimumOrder: "min",
  vatNumber: "vat",
  bpNumber: "bp",
  bank: "bank",
  address: "addr",
};

/** A body that did not parse, under the sheet's fields. */
export function supplierFieldErrors(error: z.ZodError, keyed: "sheet" | "body" = "sheet"): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const head = String(issue.path[0] ?? "name");
    const key = keyed === "sheet" ? (SHEET_FIELD[head] ?? head) : head;
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

type Values = {
  name?: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  sendOrdersOnWhatsapp?: boolean;
  payTermsDays?: number | null;
  deliversOn?: string | null;
  leadTimeDays?: number | null;
  minimumOrder?: Prisma.Decimal | null;
  vatNumber?: string | null;
  taxNumber?: string | null;
  bankDetails?: string | null;
  address?: string | null;
};

/**
 * Every field's rule (W-29), each refusal under its body key, all at once.
 * Only the keys present are checked and returned.
 */
export function checkSupplierFields(input: Partial<Omit<SupplierInput, "leadTime" | "minimumOrder">> & {
  whatsapp?: string | null;
  leadTime?: string | number | null;
  minimumOrder?: string | number | null;
}): { values: Values; errors: Record<string, string> } {
  const values: Values = {};
  const errors: Record<string, string> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key) && (input as Record<string, unknown>)[key] !== undefined;

  if (has("name")) {
    const name = cleanText(input.name);
    if (!name) errors.name = NAME_NEEDED;
    else if (name.length > 120) errors.name = NAME_TOO_LONG;
    else values.name = name;
  }
  for (const key of ["phone", "whatsapp"] as const) {
    if (!has(key)) continue;
    const raw = cleanText(input[key]);
    if (!raw) values[key] = null;
    else {
      const phone = supplierPhone(raw);
      if (phone) values[key] = phone;
      else errors[key] = PHONE_WRONG;
    }
  }
  if (has("email")) {
    const email = cleanText(input.email).toLowerCase();
    if (!email) values.email = null;
    else if (!EMAIL.test(email) || email.length > 320) errors.email = EMAIL_WRONG;
    else values.email = email;
  }
  if (has("sendOrdersOnWhatsapp")) values.sendOrdersOnWhatsapp = Boolean(input.sendOrdersOnWhatsapp);
  if (has("pays")) values.payTermsDays = paysDays(input.pays as PaysWord);
  if (has("delivers")) {
    const delivers = cleanText(input.delivers);
    if (delivers.length > 80) errors.delivers = DELIVERS_TOO_LONG;
    else values.deliversOn = delivers || null;
  }
  if (has("leadTime")) {
    const raw = cleanText(input.leadTime === null || input.leadTime === undefined ? "" : String(input.leadTime));
    if (!raw) values.leadTimeDays = null;
    else {
      const days = parseLeadTime(raw);
      if (days === null) errors.leadTime = LEAD_WRONG;
      else values.leadTimeDays = days;
    }
  }
  if (has("minimumOrder")) {
    const raw = cleanText(input.minimumOrder === null || input.minimumOrder === undefined ? "" : String(input.minimumOrder)).replace(/,/g, "");
    if (!raw) values.minimumOrder = null;
    else if (!MONEY.test(raw)) errors.minimumOrder = MINIMUM_WRONG;
    else values.minimumOrder = money(raw);
  }
  if (has("vatNumber")) {
    const raw = cleanText(input.vatNumber).replace(/\s/g, "");
    if (!raw) values.vatNumber = null;
    else if (!/^\d{8}$/.test(raw)) errors.vatNumber = VAT_WRONG;
    else values.vatNumber = raw;
  }
  if (has("bpNumber")) {
    const raw = cleanText(input.bpNumber).replace(/\s/g, "");
    if (!raw) values.taxNumber = null;
    else if (!/^\d{9,10}$/.test(raw)) errors.bpNumber = BP_WRONG;
    else values.taxNumber = raw;
  }
  if (has("bank")) {
    const raw = cleanText(input.bank);
    if (raw.length > 300) errors.bank = TOO_LONG_300;
    else values.bankDetails = raw || null;
  }
  if (has("address")) {
    const raw = (input.address ?? "").trim();
    if (raw.length > 300) errors.address = TOO_LONG_300;
    else values.address = raw || null;
  }
  return { values, errors };
}

/** Refused under the sheet's fields (`keyed: "sheet"`) or the body's keys (the rail). */
function refuseFields(errors: Record<string, string>, keyed: "sheet" | "body"): never {
  const keyedErrors = Object.fromEntries(
    Object.entries(errors).map(([key, message]) => [keyed === "sheet" ? (SHEET_FIELD[key] ?? key) : key, message]),
  );
  throw new SupplierRefusal(400, "Validation failed", keyedErrors);
}

/** One name write at a time per company, so two adds of the same name cannot both pass. */
async function lockSupplierNames(tx: Tx, companyId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${companyId}:supplier-name`}))`;
}

/** Refuses a name another supplier still bought from has, any case. */
async function checkNameFree(tx: Tx, companyId: string, name: string, except: string | null) {
  const taken = await tx.vendor.findFirst({
    where: { companyId, stoppedAt: null, name: { equals: name, mode: "insensitive" }, ...(except ? { id: { not: except } } : {}) },
    select: { name: true },
  });
  if (taken) {
    const message = duplicateName(taken.name);
    throw new SupplierRefusal(409, message, { name: message });
  }
}

/* ── Create ─────────────────────────────────────────────────────────────── */

export type SupplierCreated = { id: string; code: string; name: string };

/**
 * Add a supplier (W-29 Save): the New supplier sheet, the `supplier` and
 * `payee` lookups' inline add, an import row. `code` is the next `SUP-nnnn`;
 * the WhatsApp number starts as the phone.
 */
export async function createSupplier(
  tx: Tx,
  actor: RetailAuditActor,
  input: SupplierInput,
  keyed: "sheet" | "body" = "sheet",
): Promise<SupplierCreated> {
  const parsed = supplierInput.safeParse(input);
  if (!parsed.success) throw new SupplierRefusal(400, "Validation failed", supplierFieldErrors(parsed.error, keyed));
  const { values, errors } = checkSupplierFields(parsed.data);
  if (Object.keys(errors).length > 0) refuseFields(errors, keyed);

  await lockSupplierNames(tx, actor.companyId);
  await checkNameFree(tx, actor.companyId, values.name!, null);
  const code = await reserveIdentifier(tx, { companyId: actor.companyId, entity: "RETAIL_SUPPLIER" });
  const vendor = await tx.vendor.create({
    data: {
      companyId: actor.companyId,
      code,
      name: values.name!,
      phone: values.phone ?? null,
      whatsapp: values.phone ?? null,
      email: values.email ?? null,
      sendOrdersOnWhatsapp: values.sendOrdersOnWhatsapp ?? true,
      payTermsDays: values.payTermsDays ?? null,
      deliversOn: values.deliversOn ?? null,
      leadTimeDays: values.leadTimeDays ?? null,
      minimumOrder: values.minimumOrder ?? null,
      vatNumber: values.vatNumber ?? null,
      taxNumber: values.taxNumber ?? null,
      bankDetails: values.bankDetails ?? null,
      address: values.address ?? null,
      isActive: true,
      createdById: actor.userId,
    },
    select: { id: true, code: true, name: true },
  });
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.supplierCreated,
    entityType: "Vendor",
    entityId: vendor.id,
    payload: { code, name: vendor.name },
  });
  return { id: vendor.id, code, name: vendor.name };
}

/* ── Change (W-62) ──────────────────────────────────────────────────────── */

export type SupplierChange = { field: string; label: string; from: string | null; to: string | null };

const LABELS: Record<string, string> = {
  name: "Name",
  repContactId: "Rep",
  phone: "Phone",
  whatsapp: "WhatsApp",
  email: "Email",
  sendOrdersOnWhatsapp: "Send orders on WhatsApp",
  pays: "Pays",
  delivers: "Delivers",
  leadTime: "Lead time",
  minimumOrder: "Minimum",
  vatNumber: "VAT number",
  bpNumber: "BP number",
  bank: "Bank",
  address: "Address",
};

async function liveVendor(tx: Tx, companyId: string, id: string) {
  const vendor = await tx.vendor.findFirst({ where: { id, companyId } });
  if (!vendor) throw new SupplierRefusal(404, NOT_FOUND);
  return vendor;
}

/**
 * Change a supplier from its rail (FND 4.9): one or more fields, the same
 * rules as adding one; `repContactId` makes that contact the rep (`contactName`
 * follows it). One `RETAIL_RECORD.EDITED` per changed field.
 */
export async function updateSupplier(tx: Tx, actor: RetailAuditActor, id: string, patch: SupplierPatch): Promise<SupplierChange[]> {
  const vendor = await liveVendor(tx, actor.companyId, id);
  const { repContactId, ...fields } = patch;
  const { values, errors } = checkSupplierFields(fields);
  if (Object.keys(errors).length > 0) refuseFields(errors, "body");

  const changes: Array<SupplierChange & { kind?: "money" }> = [];
  const data: Prisma.VendorUpdateInput = {};
  const note = (field: string, from: string | null, to: string | null, kind?: "money") => {
    if (from !== to) changes.push({ field, label: LABELS[field]!, from, to, ...(kind ? { kind } : {}) });
  };

  if (values.name !== undefined && values.name !== vendor.name) {
    await lockSupplierNames(tx, actor.companyId);
    if (!vendor.stoppedAt) await checkNameFree(tx, actor.companyId, values.name, vendor.id);
    data.name = values.name;
    note("name", vendor.name, values.name);
  }
  if (values.phone !== undefined) {
    data.phone = values.phone;
    note("phone", vendor.phone, values.phone);
  }
  if (values.whatsapp !== undefined) {
    data.whatsapp = values.whatsapp;
    note("whatsapp", vendor.whatsapp, values.whatsapp);
  }
  if (values.email !== undefined) {
    data.email = values.email;
    note("email", vendor.email, values.email);
  }
  if (values.sendOrdersOnWhatsapp !== undefined) {
    data.sendOrdersOnWhatsapp = values.sendOrdersOnWhatsapp;
    note("sendOrdersOnWhatsapp", vendor.sendOrdersOnWhatsapp ? "On" : "Off", values.sendOrdersOnWhatsapp ? "On" : "Off");
  }
  if (values.payTermsDays !== undefined) {
    data.payTermsDays = values.payTermsDays;
    note("pays", paysWord(vendor.payTermsDays), paysWord(values.payTermsDays));
  }
  if (values.deliversOn !== undefined) {
    data.deliversOn = values.deliversOn;
    note("delivers", vendor.deliversOn, values.deliversOn);
  }
  if (values.leadTimeDays !== undefined) {
    data.leadTimeDays = values.leadTimeDays;
    note("leadTime", leadWords(vendor.leadTimeDays), leadWords(values.leadTimeDays));
  }
  if (values.minimumOrder !== undefined) {
    data.minimumOrder = values.minimumOrder;
    note("minimumOrder", auditAmount(vendor.minimumOrder), auditAmount(values.minimumOrder), "money");
  }
  if (values.vatNumber !== undefined) {
    data.vatNumber = values.vatNumber;
    note("vatNumber", vendor.vatNumber, values.vatNumber);
  }
  if (values.taxNumber !== undefined) {
    data.taxNumber = values.taxNumber;
    note("bpNumber", vendor.taxNumber, values.taxNumber);
  }
  if (values.bankDetails !== undefined) {
    data.bankDetails = values.bankDetails;
    // The audit chain keeps the bank's last four only, as the rail shows it.
    note("bank", maskBank(vendor.bankDetails), maskBank(values.bankDetails));
  }
  if (values.address !== undefined) {
    data.address = values.address;
    note("address", vendor.address, values.address);
  }
  if (repContactId !== undefined) {
    let repName: string | null = null;
    if (repContactId) {
      const contact = await tx.vendorContact.findFirst({
        where: { id: repContactId, vendorId: vendor.id, companyId: actor.companyId, removedAt: null },
        select: { name: true },
      });
      if (!contact) throw new SupplierRefusal(400, CONTACT_NOT_FOUND, { repContactId: "Pick one of their contacts." });
      repName = contact.name;
    }
    data.contactName = repName;
    note("repContactId", vendor.contactName, repName);
  }

  if (Object.keys(data).length > 0) await tx.vendor.update({ where: { id: vendor.id }, data });
  for (const change of changes) {
    await auditRecordEdited(tx, {
      actor,
      entityType: "Vendor",
      entityId: vendor.id,
      field: change.field,
      label: change.label,
      from: change.from,
      to: change.to,
      kind: change.kind ?? "text",
    });
  }
  return changes.map(({ field, label, from, to }) => ({ field, label, from, to }));
}

/** "CBZ, Kwame Nkrumah, 0112 3344 4471" → "CBZ · •••• 4471"; no digits, as typed. */
export function maskBank(details: string | null | undefined): string | null {
  if (!details) return null;
  const digits = details.replace(/\D/g, "");
  if (digits.length < 4) return details;
  const bank = details.split(/[,·\n]/)[0]!.trim();
  const last = `•••• ${digits.slice(-4)}`;
  return bank && !/\d/.test(bank) ? `${bank} · ${last}` : last;
}

/* ── Stop buying, and buy again ─────────────────────────────────────────── */

/**
 * "Stop buying from them": out of the list and every supplier field; bills and
 * payments stay. The 409 for an order still open with them arrives with the
 * orders that name a supplier (BUY-02, `RetailPurchaseOrder.vendorId`).
 */
export async function stopSupplier(tx: Tx, actor: RetailAuditActor, id: string, now = new Date()): Promise<void> {
  const vendor = await liveVendor(tx, actor.companyId, id);
  if (vendor.stoppedAt) return;
  await tx.vendor.update({ where: { id: vendor.id }, data: { isActive: false, stoppedAt: now, stoppedById: actor.userId } });
  await writeRetailAuditEvent(tx, { actor, eventType: RETAIL_AUDIT_EVENTS.supplierStopped, entityType: "Vendor", entityId: vendor.id });
}

/** "Buy from them again". Refused while another supplier bought from has the name. */
export async function resumeSupplier(tx: Tx, actor: RetailAuditActor, id: string): Promise<void> {
  const vendor = await liveVendor(tx, actor.companyId, id);
  if (!vendor.stoppedAt) return;
  await lockSupplierNames(tx, actor.companyId);
  const taken = await tx.vendor.findFirst({
    where: { companyId: actor.companyId, stoppedAt: null, id: { not: vendor.id }, name: { equals: vendor.name, mode: "insensitive" } },
    select: { name: true },
  });
  if (taken) throw new SupplierRefusal(409, `${duplicateName(taken.name)} Rename one of them first.`);
  await tx.vendor.update({ where: { id: vendor.id }, data: { isActive: true, stoppedAt: null, stoppedById: null } });
  await writeRetailAuditEvent(tx, { actor, eventType: RETAIL_AUDIT_EVENTS.supplierResumed, entityType: "Vendor", entityId: vendor.id });
}

/* ── Contacts ───────────────────────────────────────────────────────────── */

export const contactInput = z.object({
  name: z.string().max(2000).default(""),
  role: z.string().max(60, "Keep the role to 60 characters.").nullish(),
  phone: optionalText,
  email: optionalText,
  sends: z.enum(SENDS, { message: "Pick what they are sent." }).default("Orders"),
});
export type ContactInput = z.input<typeof contactInput>;

/** The sheet's field ids (5.12): `gets` is Sends them. */
const CONTACT_FIELD: Record<string, string> = { name: "name", role: "role", phone: "phone", email: "email", sends: "gets" };

export function contactFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = CONTACT_FIELD[String(issue.path[0])] ?? String(issue.path[0]);
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

export type ContactView = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  sends: SendsWord;
  isRep: boolean;
};

function checkContact(raw: z.infer<typeof contactInput>) {
  const errors: Record<string, string> = {};
  const name = cleanText(raw.name);
  if (!name) errors.name = CONTACT_NAME_NEEDED;
  else if (name.length > 120) errors.name = NAME_TOO_LONG;
  const role = cleanText(raw.role) || null;
  const typedPhone = cleanText(raw.phone);
  const phone = typedPhone ? supplierPhone(typedPhone) : null;
  if (typedPhone && !phone) errors.phone = PHONE_WRONG;
  const typedEmail = cleanText(raw.email).toLowerCase();
  const email = typedEmail && EMAIL.test(typedEmail) && typedEmail.length <= 320 ? typedEmail : null;
  if (typedEmail && !email) errors.email = EMAIL_WRONG;
  if (!typedPhone && !typedEmail) errors.phone = REACH_THEM;
  if (Object.keys(errors).length > 0) throw new SupplierRefusal(400, "Validation failed", errors);
  return { name, role, phone, email, sends: SENDS_ENUM[raw.sends] };
}

function contactView(contact: { id: string; name: string; role: string | null; phone: string | null; email: string | null; sends: VendorContactSends }, repName: string | null): ContactView {
  return { ...contact, sends: SENDS_WORD[contact.sends], isRep: repName !== null && contact.name === repName };
}

/** "Add a contact": a Sales rep becomes the rep while the supplier has none. */
export async function addContact(tx: Tx, actor: RetailAuditActor, vendorId: string, input: ContactInput): Promise<ContactView> {
  const vendor = await liveVendor(tx, actor.companyId, vendorId);
  const parsed = contactInput.safeParse(input);
  if (!parsed.success) throw new SupplierRefusal(400, "Validation failed", contactFieldErrors(parsed.error));
  const values = checkContact(parsed.data);
  const contact = await tx.vendorContact.create({
    data: { companyId: actor.companyId, vendorId: vendor.id, ...values },
    select: { id: true, name: true, role: true, phone: true, email: true, sends: true },
  });
  let repName = vendor.contactName;
  if (!repName && values.role?.toLowerCase() === REP_ROLE.toLowerCase()) {
    repName = contact.name;
    await tx.vendor.update({ where: { id: vendor.id }, data: { contactName: contact.name } });
  }
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.supplierContactAdded,
    entityType: "Vendor",
    entityId: vendor.id,
    payload: { contactId: contact.id, name: contact.name, role: contact.role, sends: contact.sends },
  });
  return contactView(contact, repName);
}

async function liveContact(tx: Tx, companyId: string, vendorId: string, contactId: string) {
  const vendor = await liveVendor(tx, companyId, vendorId);
  const contact = await tx.vendorContact.findFirst({ where: { id: contactId, vendorId: vendor.id, companyId, removedAt: null } });
  if (!contact) throw new SupplierRefusal(404, CONTACT_NOT_FOUND);
  return { vendor, contact };
}

/** "Change <name>": the same rules; the rep's new name follows to the supplier. */
export async function updateContact(tx: Tx, actor: RetailAuditActor, vendorId: string, contactId: string, input: ContactInput): Promise<ContactView> {
  const { vendor, contact } = await liveContact(tx, actor.companyId, vendorId, contactId);
  const parsed = contactInput.safeParse(input);
  if (!parsed.success) throw new SupplierRefusal(400, "Validation failed", contactFieldErrors(parsed.error));
  const values = checkContact(parsed.data);
  const wasRep = vendor.contactName !== null && vendor.contactName === contact.name;
  const updated = await tx.vendorContact.update({
    where: { id: contact.id },
    data: values,
    select: { id: true, name: true, role: true, phone: true, email: true, sends: true },
  });
  let repName = vendor.contactName;
  if (wasRep && updated.name !== contact.name) {
    repName = updated.name;
    await tx.vendor.update({ where: { id: vendor.id }, data: { contactName: updated.name } });
  }
  const pairs: Array<[string, string, string | null, string | null]> = [
    ["contact.name", "Contact name", contact.name, updated.name],
    ["contact.role", `${updated.name}'s role`, contact.role, updated.role],
    ["contact.phone", `${updated.name}'s phone`, contact.phone, updated.phone],
    ["contact.email", `${updated.name}'s email`, contact.email, updated.email],
    ["contact.sends", `What ${updated.name} gets`, SENDS_WORD[contact.sends], SENDS_WORD[updated.sends]],
  ];
  for (const [field, label, from, to] of pairs) {
    if (from === to) continue;
    await auditRecordEdited(tx, { actor, entityType: "Vendor", entityId: vendor.id, field, label, from, to });
  }
  return contactView(updated, repName);
}

/** "Remove": kept for what was sent to them; the rep's removal leaves the supplier with no rep. */
export async function removeContact(tx: Tx, actor: RetailAuditActor, vendorId: string, contactId: string, now = new Date()): Promise<void> {
  const { vendor, contact } = await liveContact(tx, actor.companyId, vendorId, contactId);
  await tx.vendorContact.update({ where: { id: contact.id }, data: { removedAt: now } });
  if (vendor.contactName !== null && vendor.contactName === contact.name) {
    await tx.vendor.update({ where: { id: vendor.id }, data: { contactName: null } });
  }
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.supplierContactRemoved,
    entityType: "Vendor",
    entityId: vendor.id,
    payload: { contactId: contact.id, name: contact.name },
  });
}

/* ── Message on WhatsApp ────────────────────────────────────────────────── */

export const messageInput = z.object({
  ids: z.array(z.string().uuid()).min(1, "Pick the suppliers first.").max(200, "Message at most 200 suppliers at a time."),
  message: z.string().max(5000).default(""),
});

export type Skipped = { id: string; name: string; why: string };

/**
 * Where a supplier's WhatsApp goes: the rep's phone when the rep gets
 * orders, else the supplier's WhatsApp number; null when there is neither.
 */
export function whatsAppOf(vendor: {
  whatsapp: string | null;
  contactName: string | null;
  contacts: Array<{ name: string; phone: string | null; sends: VendorContactSends }>;
}): string | null {
  const rep = vendor.contactName ? vendor.contacts.find((contact) => contact.name === vendor.contactName) : null;
  if (rep && rep.sends === "ORDERS" && rep.phone) return rep.phone;
  return vendor.whatsapp;
}

const RECIPIENT_SELECT = {
  id: true,
  name: true,
  whatsapp: true,
  contactName: true,
  contacts: { where: { removedAt: null }, select: { name: true, phone: true, sends: true } },
} satisfies Prisma.VendorSelect;

/** Who a message to these suppliers reaches: each and its WhatsApp number, or null. */
export async function messageRecipients(companyId: string, ids: string[]): Promise<Array<{ id: string; name: string; to: string | null }>> {
  if (ids.length === 0) return [];
  const vendors = await prisma.vendor.findMany({ where: { companyId, id: { in: ids } }, orderBy: { name: "asc" }, select: RECIPIENT_SELECT });
  return vendors.map((vendor) => ({ id: vendor.id, name: vendor.name, to: whatsAppOf(vendor) }));
}

/** "Message on WhatsApp": one queued `RetailMessage` per supplier with a number; the rest skipped with why. */
export async function messageSuppliers(
  tx: Tx,
  actor: RetailAuditActor,
  input: { ids: string[]; message: string },
): Promise<{ queued: number; skipped: Skipped[] }> {
  const message = input.message.trim();
  if (!message) throw new SupplierRefusal(400, "Validation failed", { message: MESSAGE_NEEDED });
  if (message.length > 1000) throw new SupplierRefusal(400, "Validation failed", { message: MESSAGE_TOO_LONG });
  const vendors = await tx.vendor.findMany({
    where: { companyId: actor.companyId, id: { in: input.ids } },
    orderBy: { name: "asc" },
    select: RECIPIENT_SELECT,
  });
  let queued = 0;
  const skipped: Skipped[] = [];
  for (const vendor of vendors) {
    const to = whatsAppOf(vendor);
    if (!to) {
      skipped.push({ id: vendor.id, name: vendor.name, why: NO_WHATSAPP });
      continue;
    }
    await tx.retailMessage.create({
      data: {
        companyId: actor.companyId,
        channel: "WHATSAPP",
        to: e164Of(to),
        template: "supplier-message",
        body: message,
        direction: "OUT",
        entityType: "Vendor",
        entityId: vendor.id,
        createdById: actor.userId,
      },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.suppliersMessaged,
      entityType: "Vendor",
      entityId: vendor.id,
      payload: { to },
    });
    queued += 1;
  }
  return { queued, skipped };
}

/* ── Read ───────────────────────────────────────────────────────────────── */

/** A supplier's contacts, the rep first. */
export async function contactsOf(companyId: string, vendorId: string): Promise<ContactView[]> {
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, companyId }, select: { contactName: true } });
  if (!vendor) return [];
  const contacts = await prisma.vendorContact.findMany({
    where: { vendorId, companyId, removedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, role: true, phone: true, email: true, sends: true },
  });
  const views = contacts.map((contact) => contactView(contact, vendor.contactName));
  return [...views.filter((c) => c.isRep), ...views.filter((c) => !c.isRep)];
}
