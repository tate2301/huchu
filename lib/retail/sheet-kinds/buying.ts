import { removeContactAsk } from "@/lib/retail/asks/buying";
import type { ContactView } from "@/lib/retail/buying/suppliers";
import type { SupplierView } from "@/lib/retail/buying/supplier-view";
import { formatCount } from "@/lib/workspace/format";
import type { PickedOption, SheetCtx, SheetKind, SheetRequest, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * Buying's sheets for suppliers (40-buying 5.11–5.14, BUY-01): New supplier,
 * Add a contact (and change one), Message suppliers and Import suppliers.
 * Each talks to `/api/v2/retail/buying/suppliers/**`.
 */

const SUB = "Buying › Suppliers";
const API = "/api/v2/retail/buying/suppliers";

const PAYS = ["On delivery", "7 days", "14 days", "30 days"];
const SENDS = ["Orders", "Statements", "Nothing"];
const ROLE_SENDS: Record<string, string> = { "sales rep": "Orders", "orders desk": "Orders", accounts: "Statements", driver: "Nothing" };

const invalidateSuppliers = [["list", "retail-suppliers"], ["lookup", "supplier"], ["lookup", "payee"]];
const invalidateSupplier = [...invalidateSuppliers, ["retail-supplier"], ["reports"], ["record-activity"], ["lookup", "contact"], ["lookup", "contact role"]];

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const payload = (await response.json().catch(() => null)) as { error?: string; data?: T } | T | null;
  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error ?? "That could not be read. Close it and try again.");
  }
  return ((payload as { data?: T })?.data ?? payload) as T;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const orNull = (value: unknown) => text(value) || null;
const suppliersWord = (n: number) => `${formatCount(n)} ${n === 1 ? "supplier" : "suppliers"}`;

/* ── 5.11 New supplier ──────────────────────────────────────────────────── */

const supplierNew: SheetKind = {
  title: "New supplier",
  sub: SUB,
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "name", t: "text", l: "Name", needed: "Write the supplier's name.", max: 120 },
        { id: "phone", t: "text", l: "Phone", half: true, mono: true, opt: true, optQuiet: true },
        { id: "email", t: "text", l: "Email", half: true, opt: true },
        {
          id: "wa",
          t: "toggle",
          l: "Send orders on WhatsApp",
          v: true,
          h: (values) =>
            text(values.phone)
              ? `Orders go to ${text(values.phone)} as a message with a PDF.`
              : "Orders go to their WhatsApp number as a message with a PDF.",
        },
      ],
    },
    {
      title: "Terms",
      fields: [
        { id: "pays", t: "seg", l: "Pays", o: PAYS, v: "On delivery" },
        { id: "days", t: "text", l: "Delivers", half: true, opt: true, optQuiet: true, max: 80 },
        { id: "lead", t: "text", l: "Lead time", half: true, opt: true, optQuiet: true },
        { id: "min", t: "money", l: "Minimum order", half: true, opt: true },
      ],
    },
    {
      title: "Details",
      fold: ["More details", "VAT, BP number, bank, address"],
      fields: [
        { id: "vat", t: "text", l: "VAT number", half: true, mono: true, opt: true, optQuiet: true, p: "10000000" },
        { id: "bp", t: "text", l: "BP number", half: true, mono: true, opt: true, optQuiet: true, p: "200000000" },
        { id: "bank", t: "text", l: "Bank account", opt: true, optQuiet: true, p: "Bank, branch, account" },
        { id: "addr", t: "area", l: "Address", rows: 2, opt: true, optQuiet: true, p: "Street, town" },
      ],
    },
  ],
  note: "Only the name is needed. Terms fill in their orders.",
  primary: "Add supplier",
  done: (result) => `${(result as SupplierView).name} added. It is in every supplier field now.`,
  open: (result) => `/retail/buying/suppliers/${(result as SupplierView).id}`,
  submit: (values): SheetRequest => ({
    method: "POST",
    url: API,
    body: {
      name: text(values.name),
      phone: orNull(values.phone),
      email: orNull(values.email),
      sendOrdersOnWhatsapp: values.wa !== false,
      pays: text(values.pays) || "On delivery",
      delivers: orNull(values.days),
      leadTime: orNull(values.lead),
      minimumOrder: orNull(values.min),
      vatNumber: orNull(values.vat),
      bpNumber: orNull(values.bp),
      bank: orNull(values.bank),
      address: orNull(values.addr),
    },
  }),
  invalidate: invalidateSuppliers,
  requires: [["retail.suppliers", "create"]],
};

/* ── 5.12 Add a contact, or change one ──────────────────────────────────── */

const supplierIdOf = (ctx: SheetCtx) => ctx.params.get("supplierId") ?? "";
const contactOf = (values: SheetValues) => (values._contact as ContactView | undefined) ?? null;

const contactNew: SheetKind = {
  title: (_ctx, values) => (contactOf(values) ? `Change ${contactOf(values)!.name}` : "Add a contact"),
  sub: (_ctx, values) => String(values._supplier ?? ""),
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "name", t: "text", l: "Name", needed: "Write their name.", max: 120 },
        { id: "role", t: "auto", l: "Role", noun: "contact role", half: true, opt: true, optQuiet: true },
        { id: "phone", t: "text", l: "Phone or WhatsApp", half: true, mono: true, opt: true, optQuiet: true },
        { id: "email", t: "text", l: "Email", opt: true },
        {
          id: "gets",
          t: "seg",
          l: "Sends them",
          o: SENDS,
          v: "Orders",
          // Follows the role until it is picked: Accounts get statements, a driver nothing.
          derive: (values) => ROLE_SENDS[((values.role as PickedOption | null)?.label ?? "").toLowerCase()] ?? "Orders",
        },
      ],
    },
  ],
  note: "Orders go to the contact who gets orders; statements to the one who gets statements.",
  primary: (values) => (contactOf(values) ? "Save" : "Add contact"),
  done: (result, values) => {
    const name = (result as ContactView | null)?.name ?? text(values.name);
    return contactOf(values) ? `${name} saved.` : `${name} added to ${String(values._supplier ?? "the supplier")}.`;
  },
  load: async (ctx) => {
    const supplier = await readJson<SupplierView>(`${API}/${encodeURIComponent(supplierIdOf(ctx))}`);
    const contact = ctx.id ? (supplier.contacts.find((candidate) => candidate.id === ctx.id) ?? null) : null;
    if (ctx.id && !contact) throw new Error("Contact not found");
    return {
      _supplier: supplier.name,
      _contact: contact,
      ...(contact
        ? {
            name: contact.name,
            role: contact.role ? { id: contact.role, label: contact.role } : null,
            phone: contact.phone ?? "",
            email: contact.email ?? "",
            gets: contact.sends,
          }
        : {}),
    };
  },
  danger: {
    label: "Remove",
    show: (_ctx, values) => Boolean(contactOf(values)),
    ask: (_ctx, values) => removeContactAsk(contactOf(values)?.name ?? "them", String(values._supplier ?? "The supplier")),
    request: (ctx) => ({ method: "DELETE", url: `${API}/${encodeURIComponent(supplierIdOf(ctx))}/contacts/${encodeURIComponent(ctx.id ?? "")}` }),
    done: (values) => `${contactOf(values)?.name ?? "They"} removed.`,
  },
  submit: (values, ctx): SheetRequest => {
    const body = {
      name: text(values.name),
      role: (values.role as PickedOption | null)?.id ?? null,
      phone: orNull(values.phone),
      email: orNull(values.email),
      sends: text(values.gets) || "Orders",
    };
    const base = `${API}/${encodeURIComponent(supplierIdOf(ctx))}/contacts`;
    return ctx.id ? { method: "PATCH", url: `${base}/${encodeURIComponent(ctx.id)}`, body } : { method: "POST", url: base, body };
  },
  invalidate: invalidateSupplier,
  requires: [["retail.suppliers", "update"]],
};

/* ── 5.13 Message suppliers ─────────────────────────────────────────────── */

type Recipient = { id: string; name: string; to: string | null };

const idsOf = (ctx: SheetCtx) => (ctx.params.get("ids") ?? "").split(",").filter(Boolean);
const recipientsOf = (values: SheetValues) => (values._recipients as Recipient[] | undefined) ?? [];
const reachable = (values: SheetValues) => recipientsOf(values).filter((recipient) => recipient.to).length;

const supplierMessage: SheetKind = {
  title: (_ctx, values) => {
    const recipients = recipientsOf(values);
    return recipients.length === 1 ? `Message ${recipients[0]!.name}` : "Message suppliers";
  },
  sub: (_ctx, values) => {
    const recipients = recipientsOf(values);
    if (recipients.length === 1) return recipients[0]!.to ?? "No WhatsApp number";
    return `${formatCount(recipients.length)} ticked · ${formatCount(reachable(values))} on WhatsApp`;
  },
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "message",
          t: "area",
          l: "Message",
          rows: 4,
          maxRows: 8,
          max: 1000,
          needed: "Write a message.",
          h: "Each gets it on WhatsApp, to their rep or their own number.",
        },
      ],
    },
  ],
  note: "Suppliers without a WhatsApp number are skipped.",
  primary: (values) => `Send to ${formatCount(reachable(values))}`,
  primaryDisabled: (values) => reachable(values) === 0,
  load: async (ctx) => ({ _recipients: await readJson<Recipient[]>(`${API}/messages?ids=${encodeURIComponent(idsOf(ctx).join(","))}`) }),
  done: (_result, values, payload) => {
    const answer = (payload ?? {}) as { queued?: number; skipped?: Array<{ name: string }> };
    const queued = Number(answer.queued ?? 0);
    const recipients = recipientsOf(values);
    const sent = recipients.length === 1 && queued === 1 ? `Sent to ${recipients[0]!.name}.` : `Sent to ${suppliersWord(queued)}.`;
    const skipped = (answer.skipped ?? []).map((row) => `${row.name} has no WhatsApp number.`);
    return [sent, ...skipped].join(" ");
  },
  submit: (values, ctx): SheetRequest => ({ method: "POST", url: `${API}/messages`, body: { ids: idsOf(ctx), message: text(values.message) } }),
  invalidate: [["record-activity"]],
  requires: [["retail.suppliers", "update"]],
};

/* ── 5.14 Import suppliers ──────────────────────────────────────────────── */

const supplierImport: SheetKind = {
  title: "Import suppliers",
  sub: SUB,
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "file",
          t: "file",
          l: "Spreadsheet",
          nolabel: true,
          prompt: "Drop the spreadsheet here",
          fileSub: "Or choose a file · .xlsx or .csv",
          accept: ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv",
          needed: "Choose a spreadsheet.",
        },
      ],
    },
  ],
  note: "Name is the only column you need.",
  noteLink: () => ({ label: "Download the template", href: `${API}/import/template` }),
  primary: "Import",
  done: (_result, _values, payload) => {
    const answer = (payload ?? {}) as { added?: number; skipped?: Array<{ row: number; why: string }> };
    const skipped = (answer.skipped ?? []).map((row) => `Row ${row.row}: ${row.why}`);
    return [`${suppliersWord(Number(answer.added ?? 0))} added.`, ...skipped].join(" ");
  },
  submit: (values): SheetRequest => ({ method: "POST", url: `${API}/import`, body: { file: values.file } }),
  invalidate: invalidateSuppliers,
  requires: [["retail.suppliers", "create"]],
};

export const BUYING_SHEETS: Record<string, SheetKind> = {
  "supplier-new": supplierNew,
  "contact-new": contactNew,
  "supplier-message": supplierMessage,
  "supplier-import": supplierImport,
};
