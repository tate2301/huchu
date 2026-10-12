import { binAsk } from "@/lib/retail/asks";
import type { CustomerRecordView } from "@/lib/retail/customers/view";
import { ADJUST_REASONS, pointsWords } from "@/lib/retail/loyalty/format";
import { pointsValue } from "@/lib/retail/loyalty/spend";
import { formatCount, formatDay, formatMoney } from "@/lib/workspace/format";
import type { PickedOption, SheetCtx, SheetKind, SheetRequest, SheetValues } from "@/lib/workspace/sheet-kind";

import { readJson } from "./products";

/**
 * Customers' sheets (60-customers): New customer (W-45, CUS-02) and Message
 * on WhatsApp (W-50, CUS-06), Edit everything and Add a note (61, CUS-03),
 * Adjust points, Add points and Change tier (64, CUS-04), Merge with another
 * customer (65, CUS-05).
 */

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

type Created = { id: string; code: string; name: string; phone: string; cardNo: string };
type Existing = { id: string; name: string };

const existingOf = (values: SheetValues) => (values._existing as Existing | undefined) ?? null;

const customerNew: SheetKind = {
  title: "New customer",
  sub: "Customers",
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "phone",
          t: "text",
          l: "Phone or WhatsApp",
          mono: true,
          p: "+263 7",
          h: "The till finds customers by phone.",
          needed: "That is not a phone number.",
          // A number someone already has: the way to them, under the sentence.
          link: (values) => {
            const existing = existingOf(values);
            return existing ? { label: `Open ${existing.name}`, href: `/retail/customers/${existing.id}` } : null;
          },
        },
        { id: "name", t: "text", l: "Name", needed: "Add their name.", max: 120 },
        {
          id: "msgs",
          t: "toggle",
          l: "Agrees to WhatsApp messages",
          v: true,
          h: "Receipts, points and offers. They can stop any time by replying STOP.",
        },
        {
          id: "dob",
          t: "text",
          l: "Date of birth",
          half: true,
          opt: true,
          p: "Optional",
          h: "For the birthday bonus; also confirms 18+.",
        },
        { id: "area", t: "text", l: "Area", half: true, opt: true, p: "Optional", max: 80 },
      ],
    },
  ],
  note: "They start earning points on their next sale.",
  primary: "Add customer",
  done: (result) => `${(result as Created).name} added. 0 points.`,
  open: (result) => `/retail/customers/${(result as Created).id}`,
  // A 409 names who has the number; the phone field links to them.
  onRefused: (payload) => {
    const existing = (payload as { existing?: Existing } | null)?.existing;
    return existing ? { _existing: existing } : { _existing: undefined };
  },
  submit: (values): SheetRequest => ({
    method: "POST",
    url: "/api/v2/retail/customers",
    body: {
      phone: text(values.phone),
      name: text(values.name),
      marketingConsent: values.msgs === true,
      ...(text(values.dob) ? { dateOfBirth: text(values.dob) } : {}),
      ...(text(values.area) ? { area: text(values.area) } : {}),
      via: "sheet",
    },
  }),
  invalidate: [["list", "retail-customers"], ["lookup", "customer"]],
  requires: [["retail.customers", "create"]],
};

/* ── Message customers on WhatsApp (55, CUS-06) ───────────────────────────── */

const MESSAGES_API = "/api/v2/retail/customers/messages";

/** What the server worked out for the sheet: `GET …/messages/preview`. */
type MessagePreview = {
  total: number;
  reach: number;
  sub: string;
  note: string;
  primary: string;
  options: Array<{ value: string; label: string }>;
  body: string;
  hint: string;
  later: { at: string; label: string };
};

type Queued = { batchId: string; queued: number; sendAt: string | null; waiting: boolean };

const previewOf = (values: SheetValues) => (values._preview as MessagePreview | undefined) ?? null;
const isReminder = (ctx: SheetCtx) => ctx.params.get("purpose") === "reminder";

/** The ticked customers: `?ids=a,b`, or `?id=` for one. */
function idsOf(ctx: SheetCtx): string[] {
  const many = ctx.params.get("ids");
  if (many) return many.split(",").filter(Boolean);
  return ctx.id ? [ctx.id] : [];
}

function previewUrl(ctx: SheetCtx, audience?: string): string {
  const query = new URLSearchParams({ purpose: isReminder(ctx) ? "reminder" : "offer" });
  const ids = idsOf(ctx);
  if (ids.length && !isReminder(ctx)) query.set("ids", ids.join(","));
  const about = ctx.params.get("about");
  if (about) query.set("about", about);
  if (ctx.params.get("picked") === "1") query.set("picked", "1");
  if (audience) query.set("audience", audience);
  return `${MESSAGES_API}/preview?${query.toString()}`;
}

const chosenAudience = (values: SheetValues) => previewOf(values)?.options.find((option) => option.label === values.who) ?? null;
const scheduled = (values: SheetValues) => {
  const later = previewOf(values)?.later;
  return Boolean(later && values.when === later.label);
};
const customersWord = (n: number) => `${formatCount(n)} ${n === 1 ? "customer" : "customers"}`;
const messagesWord = (n: number) => `${formatCount(n)} ${n === 1 ? "message" : "messages"}`;

const message: SheetKind = {
  title: (ctx) => (isReminder(ctx) ? "Remind on WhatsApp" : "Message customers"),
  sub: (_ctx, values) => previewOf(values)?.sub ?? "",
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "who",
          t: "seg",
          l: "To",
          o: (values) => previewOf(values)?.options.map((option) => option.label) ?? [],
          // Another audience: who it reaches, the note and the primary are asked again.
          follow: async (value, values, ctx) => {
            const option = previewOf(values)?.options.find((entry) => entry.label === value);
            return option ? { _preview: await readJson<MessagePreview>(previewUrl(ctx, option.value)) } : null;
          },
        },
        {
          id: "msg",
          t: "area",
          l: "Message",
          rows: 4,
          maxRows: 8,
          max: 1000,
          needed: "Write the message.",
          h: (values) => previewOf(values)?.hint ?? "",
        },
        {
          id: "when",
          t: "seg",
          l: "Send",
          o: (values) => ["Now", previewOf(values)?.later.label ?? "Friday 16:00"],
          show: (_values, ctx) => !isReminder(ctx),
        },
      ],
    },
  ],
  note: (values) => previewOf(values)?.note ?? "",
  primary: (values) => {
    const preview = previewOf(values);
    if (!preview) return "Send";
    return scheduled(values) ? `Schedule for ${formatCount(preview.reach)}` : preview.primary;
  },
  primaryDisabled: (values) => (previewOf(values)?.reach ?? 0) === 0,
  load: async (ctx) => {
    const preview = await readJson<MessagePreview>(previewUrl(ctx));
    return { _preview: preview, _reminder: isReminder(ctx), who: preview.options[0]?.label ?? "", msg: preview.body, when: "Now" };
  },
  done: (result, values) => {
    const answer = (result ?? {}) as Partial<Queued>;
    const queued = Number(answer.queued ?? 0);
    if (answer.waiting) return `${messagesWord(queued)} ${queued === 1 ? "waits" : "wait"} until WhatsApp is connected.`;
    if (answer.sendAt) {
      const at = new Date(answer.sendAt);
      const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Harare" }).format(at);
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare" }).format(at);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare" }).format(new Date());
      const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Africa/Harare" }).format(at);
      return `${messagesWord(queued)} ${queued === 1 ? "goes" : "go"} ${day === today ? "today" : `on ${weekday}`} at ${time}.`;
    }
    return values._reminder === true ? `Reminders sent to ${customersWord(queued)}.` : `Sent to ${customersWord(queued)}.`;
  },
  submit: (values, ctx): SheetRequest => {
    const preview = previewOf(values);
    const about = ctx.params.get("about") ?? undefined;
    const purpose = !isReminder(ctx) ? "OFFER" : about?.startsWith("layby:") ? "LAYBY_REMINDER" : "ACCOUNT_REMINDER";
    const ids = idsOf(ctx);
    return {
      method: "POST",
      url: MESSAGES_API,
      body: {
        purpose,
        audience: chosenAudience(values)?.value ?? "ticked",
        ...(ids.length && purpose === "OFFER" ? { ids } : {}),
        ...(about ? { about } : {}),
        body: text(values.msg),
        sendAt: scheduled(values) && preview ? preview.later.at : null,
      },
    };
  },
  invalidate: [["list", "retail-customers"]],
  // Offers need Customers' update; a reminder opened from Lay-bys or Accounts is checked by the server against its own grant.
  requires: [
    ["retail.customers", "update"],
    ["retail.laybys", "update"],
    ["retail.accounts", "update"],
  ],
};


/* ── Edit everything and Add a note (61, CUS-03) ───────────────────────── */

const customerUrl = (ctx: SheetCtx) => `/api/v2/retail/customers/${encodeURIComponent(ctx.id ?? "")}`;

type Orig = {
  phone: string;
  name: string;
  marketingConsent: boolean;
  dateOfBirth: string;
  area: string;
  tier: string;
  priceListId: string | null;
};

const origOf = (values: SheetValues) => (values._orig ?? {}) as Partial<Orig>;
const pickedId = (value: unknown) => (value as PickedOption | null)?.id ?? null;

/** "Held until 3 October 2027. Choose Silver to go back to spend." while a tier is held. */
function tierHint(values: SheetValues): string {
  const held = values._heldUntil as string | null | undefined;
  const bySpend = values._bySpend as string | null | undefined;
  if (held && bySpend) return `Held until ${formatDay(held)}. Choose ${bySpend} to go back to spend.`;
  return "Set by spend. Changing it here holds it for 12 months.";
}

const customerEdit: SheetKind = {
  title: (_ctx, values) => String(values._name ?? "A customer"),
  sub: (_ctx, values) => String(values._sub ?? "Customers"),
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "phone", t: "text", l: "Phone or WhatsApp", mono: true, p: "+263 7", h: "The till finds customers by phone.", needed: "That is not a phone number." },
        { id: "name", t: "text", l: "Name", needed: "Add their name.", max: 120 },
        {
          id: "marketingConsent",
          t: "toggle",
          l: "Agrees to WhatsApp messages",
          h: "Receipts, points and offers. They can stop any time by replying STOP.",
        },
        {
          id: "dateOfBirth",
          t: "text",
          l: "Date of birth",
          half: true,
          opt: true,
          p: "Optional",
          h: "For the birthday bonus; also confirms 18+.",
        },
        { id: "area", t: "text", l: "Area", half: true, opt: true, p: "Optional", max: 80 },
      ],
    },
    {
      title: "Loyalty and prices",
      fields: [
        { id: "tier", t: "seg", l: "Tier", o: (values) => (values._tiers as string[] | undefined) ?? [], h: tierHint },
        { id: "priceListId", t: "auto", l: "Price list", noun: "price-list", context: { for: "customer" }, opt: true, optQuiet: true, p: "The default list" },
      ],
    },
  ],
  note: "Their sales and points history stay whatever happens.",
  primary: "Save",
  done: (_result, values) => `${String(values.name ?? values._name ?? "The customer").trim()} saved.`,
  danger: {
    label: "Move to the bin",
    show: (ctx, values) => ctx.can("retail.customers", "delete") && values._name !== undefined && values._binned !== true,
    ask: (_ctx, values) => binAsk({ title: String(values._name ?? "this customer") }),
    request: (ctx) => ({ method: "POST", url: "/api/v2/retail/bin", body: { kind: "customer", id: ctx.id } }),
    done: (values) => `${String(values._name)} is in the bin.`,
  },
  load: async (ctx) => {
    const customer = await readJson<CustomerRecordView>(customerUrl(ctx));
    const orig: Orig = {
      phone: customer.phoneDisplay,
      name: customer.name,
      marketingConsent: customer.marketingConsent,
      dateOfBirth: customer.dateOfBirth ? formatDay(customer.dateOfBirth) : "",
      area: customer.area ?? "",
      tier: customer.tier.name ?? "",
      priceListId: customer.priceList?.id ?? null,
    };
    return {
      ...orig,
      priceListId: customer.priceList ? { id: customer.priceList.id, label: customer.priceList.name } : null,
      _orig: orig,
      _name: customer.name,
      _sub: [customer.code, customer.tier.name, `${formatCount(customer.points.balance)} points`].filter(Boolean).join(" · "),
      _tiers: customer.tiers,
      _heldUntil: customer.tier.heldUntil,
      _bySpend: customer.tier.bySpend,
      _binned: customer.binned !== null,
    };
  },
  // Only what changed goes.
  submit: (values, ctx): SheetRequest | null => {
    const orig = origOf(values);
    const body: Record<string, unknown> = {};
    if (text(values.phone) !== orig.phone) body.phone = text(values.phone);
    if (text(values.name) !== orig.name) body.name = text(values.name);
    if ((values.marketingConsent === true) !== orig.marketingConsent) {
      body.marketingConsent = values.marketingConsent === true;
      body.via = "sheet";
    }
    if (text(values.dateOfBirth) !== orig.dateOfBirth) body.dateOfBirth = text(values.dateOfBirth) || null;
    if (text(values.area) !== orig.area) body.area = text(values.area) || null;
    if (typeof values.tier === "string" && values.tier && values.tier !== orig.tier) body.tier = values.tier;
    const list = pickedId(values.priceListId);
    if (list !== (orig.priceListId ?? null)) body.priceListId = list;
    if (Object.keys(body).length === 0) return null;
    return { method: "PATCH", url: customerUrl(ctx), body };
  },
  invalidate: [["retail-customer"], ["list", "retail-customers"], ["lookup", "customer"], ["reports"], ["record-activity"], ["list", "retail-bin"]],
  requires: [["retail.customers", "update"]],
};

const customerNote: SheetKind = {
  title: "Add a note",
  sub: (_ctx, values) => String(values._name ?? "A customer"),
  cur: "US$",
  sections: [{ fields: [{ id: "note", t: "area", l: "Note", rows: 4, maxRows: 8, max: 1000, needed: "Write the note." }] }],
  note: "Everyone who can open the customer reads it.",
  primary: "Add the note",
  done: "Note added.",
  load: async (ctx) => ({ _name: (await readJson<CustomerRecordView>(customerUrl(ctx))).name }),
  submit: (values, ctx): SheetRequest => ({ method: "POST", url: `${customerUrl(ctx)}/notes`, body: { body: text(values.note) } }),
  invalidate: [["retail-customer"], ["reports"], ["record-activity"]],
  requires: [["retail.customers", "update"]],
};

/* ── Adjust points, Add points, Change tier (64, CUS-04) ──────────────────── */

const ADD = "Add";
const TAKE = "Take away";
const REASON_LABELS = ADJUST_REASONS.map(([, label]) => label);
const many = (ctx: SheetCtx) => Boolean(ctx.params.get("ids"));
const customerAt = (id: string) => readJson<CustomerRecordView>(`/api/v2/retail/customers/${encodeURIComponent(id)}`);

/** The typed count as a whole number, or 0 while it is not one. */
function pointsTyped(values: SheetValues): number {
  const typed = text(values.n).replace(/,/g, "");
  return /^\d+$/.test(typed) ? Number(typed) : 0;
}

/** "Nyasha Gwenzi had too few.", "Nyasha Gwenzi and Rudo Chirwa had too few.", "… and 3 others had too few." */
function tooFewWords(skipped: Array<{ name: string }>): string {
  const names = skipped.map((entry) => entry.name);
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} had too few.`;
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} had too few.`;
  return `${names.slice(0, 2).join(", ")} and ${formatCount(names.length - 2)} others had too few.`;
}

type Adjusted = { entryId: string; balance: number };
type AdjustedMany = { done: number; skipped: Array<{ id: string; name: string }> };

const points: SheetKind = {
  title: (ctx) => (many(ctx) ? "Add points" : "Adjust points"),
  sub: (ctx, values) => {
    if (many(ctx)) return customersWord(idsOf(ctx).length);
    if (!values._name) return "";
    const balance = Number(values._balance ?? 0);
    return `${String(values._name)} · ${formatCount(balance)} ${balance === 1 ? "point" : "points"}, worth ${formatMoney(Number(values._worth ?? 0))}`;
  },
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "dir", t: "seg", l: "Points", o: [ADD, TAKE], v: ADD },
        {
          id: "n",
          t: "text",
          l: "How many",
          mono: true,
          right: true,
          half: true,
          inputMode: "numeric",
          p: "0",
          needed: "A whole number of points, 1 or more.",
        },
        {
          id: "val",
          t: "read",
          l: "Worth",
          mono: true,
          right: true,
          half: true,
          derive: (values) => formatMoney(pointsValue(pointsTyped(values), Number(values._pointValue ?? 0))),
        },
        { id: "why", t: "seg", l: "Why", o: REASON_LABELS, v: REASON_LABELS[0] },
        { id: "note", t: "area", l: "Note", rows: 2, max: 300, needed: "Say what happened." },
      ],
    },
  ],
  note: "Adjustments show in their points ledger with your name.",
  primary: "Save to the ledger",
  // One customer: their name and points for the sub. Many: the first ticked one's record carries what a point is worth.
  load: async (ctx) => {
    const id = many(ctx) ? idsOf(ctx)[0] : ctx.id;
    if (!id) return {};
    const customer = await customerAt(id);
    return {
      _pointValue: customer.points.pointValue,
      ...(many(ctx) ? {} : { _name: customer.name, _balance: customer.points.balance, _worth: customer.points.worth }),
    };
  },
  done: (result, values) => {
    const n = pointsTyped(values);
    const taking = values.dir === TAKE;
    const answer = (result ?? {}) as Partial<Adjusted & AdjustedMany>;
    if (answer.done !== undefined) {
      const head = `${pointsWords(n)} ${taking ? "taken away from" : "added to"} ${customersWord(answer.done)}.`;
      const skipped = tooFewWords(answer.skipped ?? []);
      return skipped ? `${head} ${skipped}` : head;
    }
    return `${pointsWords(n)} ${taking ? "taken away" : "added"}. ${pointsWords(Number(answer.balance ?? 0))} now.`;
  },
  doneWarn: (result) => ((result as Partial<AdjustedMany> | null)?.skipped?.length ?? 0) > 0,
  submit: (values, ctx): SheetRequest => {
    const reason = ADJUST_REASONS.find(([, label]) => label === values.why)?.[0] ?? ADJUST_REASONS[0][0];
    const body = { direction: values.dir === TAKE ? "TAKE" : "ADD", points: text(values.n).replace(/,/g, ""), reason, note: text(values.note) };
    return many(ctx)
      ? { method: "POST", url: "/api/v2/retail/customers/points", body: { ids: idsOf(ctx), ...body } }
      : { method: "POST", url: `${customerUrl(ctx)}/points`, body };
  },
  invalidate: [["retail-customer"], ["list", "retail-points"], ["list", "retail-customers"], ["record-activity"], ["reports"]],
  requires: [["retail.customers", "update"]],
};

const customerTier: SheetKind = {
  title: "Change tier",
  sub: (ctx) => customersWord(idsOf(ctx).length),
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "tier",
          t: "seg",
          l: "Tier",
          o: (values) => (values._tiers as string[] | undefined) ?? [],
          needed: "Choose a tier.",
          h: "Set by spend. Changing it here holds it for 12 months.",
        },
      ],
    },
  ],
  note: "Each one goes back to their spend tier after 12 months.",
  primary: (values) => {
    const count = Number(values._count ?? 0);
    return `Change ${formatCount(count)} ${count === 1 ? "tier" : "tiers"}`;
  },
  // The settings' tiers come with any customer's record: the first ticked one's.
  load: async (ctx) => {
    const ids = idsOf(ctx);
    const first = ids[0];
    return { _count: ids.length, _tiers: first ? (await customerAt(first)).tiers : [] };
  },
  done: (result, values) => {
    const answer = (result ?? {}) as { count?: number; until?: string };
    const count = Number(answer.count ?? 0);
    return `${customersWord(count)} ${count === 1 ? "is" : "are"} ${String(values.tier)}${answer.until ? ` until ${formatDay(answer.until)}` : ""}.`;
  },
  submit: (values, ctx): SheetRequest => ({
    method: "POST",
    url: "/api/v2/retail/customers/tier",
    body: { ids: idsOf(ctx), tier: String(values.tier ?? "") },
  }),
  invalidate: [["retail-customer"], ["list", "retail-customers"], ["record-activity"], ["reports"]],
  requires: [["retail.customers", "update"]],
};

/* ── Merge with another customer (65, CUS-05) ───────────────────────────── */

type MergePreviewView = { points: number; visits: number; text: string; phones: [string, string]; blockers: string[] };
type MergedView = { id: string; points: number; visits: number };

const mergePreviewOf = (values: SheetValues) => (values._preview as MergePreviewView | null | undefined) ?? null;
const mergeBlocker = (values: SheetValues) => mergePreviewOf(values)?.blockers[0] ?? null;

const customerMerge: SheetKind = {
  title: "Merge with another customer",
  sub: (_ctx, values) => (values._name ? [String(values._name), String(values._phone ?? "")].filter(Boolean).join(" · ") : ""),
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "other",
          t: "auto",
          l: "The duplicate",
          noun: "customer",
          context: (ctx) => ({ for: "merge", excludeId: ctx.id }),
          needed: "Pick the duplicate.",
          // Another duplicate: what merging comes to, asked again; the record's number kept until changed.
          follow: async (value, values, ctx) => {
            const picked = pickedId(value);
            if (!picked) return { _preview: null, keep: values._phone };
            try {
              const preview = await readJson<MergePreviewView>(`${customerUrl(ctx)}/merge-preview?duplicateId=${encodeURIComponent(picked)}`);
              return { _preview: preview, keep: values._phone };
            } catch (error) {
              const sentence = error instanceof Error ? error.message : "That could not be read. Close it and try again.";
              return { _preview: { points: 0, visits: 0, text: "—", phones: [String(values._phone ?? ""), ""], blockers: [sentence] }, keep: values._phone };
            }
          },
        },
        {
          id: "keep",
          t: "seg",
          l: "Keep the phone number",
          o: (values) => {
            const phones = mergePreviewOf(values)?.phones ?? [String(values._phone ?? ""), ""];
            return phones.filter((phone, index) => phone && phones.indexOf(phone) === index);
          },
        },
        { id: "res", t: "read", l: "After merging", derive: (values) => mergePreviewOf(values)?.text ?? "—" },
      ],
    },
  ],
  note: (values) => mergeBlocker(values) ?? "The duplicate goes to the bin. Its sales move across.",
  noteBad: (values) => mergeBlocker(values) !== null,
  primary: "Merge",
  primaryDisabled: (values) => !mergePreviewOf(values) || mergeBlocker(values) !== null,
  load: async (ctx) => {
    const customer = await readJson<CustomerRecordView>(customerUrl(ctx));
    return { _name: customer.name, _phone: customer.phoneDisplay, keep: customer.phoneDisplay, _preview: null };
  },
  done: (result, values) => {
    const points = Number((result as Partial<MergedView> | null)?.points ?? 0);
    return `Merged. ${String(values._name ?? "The customer")} has ${pointsWords(points)}.`;
  },
  submit: (values, ctx): SheetRequest => ({
    method: "POST",
    url: `${customerUrl(ctx)}/merge`,
    body: { duplicateId: pickedId(values.other) ?? "", keepPhone: text(values.keep) },
  }),
  invalidate: [
    ["retail-customer"],
    ["list", "retail-points"],
    ["list", "retail-customers"],
    ["lookup", "customer"],
    ["list", "retail-bin"],
    ["record-activity"],
    ["reports"],
  ],
  requires: [
    ["retail.customers", "update"],
    ["retail.customers", "delete"],
  ],
};

export const CUSTOMER_SHEETS: Record<string, SheetKind> = {
  "customer-merge": customerMerge,
  "customer-new": customerNew,
  "customer-edit": customerEdit,
  "customer-note": customerNote,
  "customer-tier": customerTier,
  message,
  points,
};
