import { z } from "zod";

import { removeAccessAsk, removedToast } from "@/lib/retail/asks/people";
import type { InviteResult } from "@/lib/retail/people/invite";
import {
  MANAGER_ROLES,
  PERSON_ROLE_CARDS,
  PERSON_ROLE_LABELS,
  PERSON_ROLES,
  pinByDefault,
  type PersonRole,
} from "@/lib/retail/people/roles";
import type { PersonView } from "@/lib/retail/people/view";
import type { FieldSpec, HandOverPanel, SheetCtx, SheetKind, SheetRequest, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * Staff and PINs' sheets (80-admin 5.2–5.5; boards PersonNew, PersonEdit,
 * Roles): Invite someone, a person, Who can do what, and the selection's
 * Send a message. Each talks to `/api/v2/retail/people*`; the Roles table
 * reads `/api/v2/retail/roles`.
 */

const SUB = "Setup › Staff and PINs";
const ALL_SITES = "All sites";
const invalidatePeople = [["list", "retail-people"], ["lookup", "person"]];

const PIN_HINT = "Cashiers, managers and stock clerks need one. Sent on WhatsApp, changed on first use.";

type Answer = { ok: boolean; status: number; payload: Record<string, unknown> | null };

async function call(url: string): Promise<Answer> {
  const response = await fetch(url, { credentials: "include" });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, status: response.status, payload };
}

const failure = (answer: Answer) =>
  new Error(typeof answer.payload?.error === "string" ? answer.payload.error : "That could not be read. Close it and try again.");

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const roleOfLabel = (label: unknown): PersonRole | null =>
  PERSON_ROLES.find((role) => PERSON_ROLE_LABELS[role] === label) ?? null;

const cardsOf = (roles: readonly PersonRole[]): Array<[string, string]> =>
  roles.map((role) => [PERSON_ROLE_LABELS[role], PERSON_ROLE_CARDS[role]]);

/** The open sites, by name, for the Sites tags: `{ "Borrowdale": "<id>" }`. */
async function siteIds(): Promise<Record<string, string>> {
  const answer = await call("/api/v2/retail/lookup/site?limit=50");
  if (!answer.ok) return {};
  const options = (answer.payload?.options ?? []) as Array<{ id: string; label: string }>;
  return Object.fromEntries(options.map((option) => [option.label, option.id]));
}

/**
 * The sites the person opening the sheet may give (W-57): every open site and
 * "All sites" for someone who works at all of them; only their own sites for
 * a site-limited manager, read from their own record.
 */
async function sitesToGive(ctx: SheetCtx): Promise<{ _siteIds: Record<string, string>; _allSites: boolean }> {
  const all = await siteIds();
  if (ctx.can("retail.people", "delete")) return { _siteIds: all, _allSites: true };
  const self = await call(`/api/v2/retail/people/${encodeURIComponent(ctx.user.id)}`);
  const sites = (self.payload?.data as PersonView | undefined)?.sites;
  if (!self.ok || !sites || sites.all) return { _siteIds: all, _allSites: true };
  const mine = new Set(sites.ids);
  return { _siteIds: Object.fromEntries(Object.entries(all).filter(([, id]) => mine.has(id))), _allSites: false };
}

const siteNames = (values: SheetValues) => Object.keys((values._siteIds as Record<string, string> | undefined) ?? {});

/** The Sites tags' options: "All sites" first when the caller may give it. */
const siteOptions = (values: SheetValues) => (values._allSites === false ? siteNames(values) : [ALL_SITES, ...siteNames(values)]);

/** The tags as the API takes them: "ALL", or the sites' ids. */
function sitesBody(values: SheetValues): "ALL" | string[] {
  const tags = Array.isArray(values.sites) ? (values.sites as string[]) : [];
  if (tags.includes(ALL_SITES)) return "ALL";
  const ids = (values._siteIds as Record<string, string> | undefined) ?? {};
  return tags.flatMap((tag) => (ids[tag] ? [ids[tag]!] : []));
}

/** The roles the person opening the sheet may give: every one for an owner, Cashier and Stock clerk for a manager. */
function rolesFor(ctx: SheetCtx): readonly PersonRole[] {
  return ctx.can("retail.people", "delete") ? PERSON_ROLES : MANAGER_ROLES;
}

/** "WhatsApp is not set up, so give Ruvimbo Chari these yourself. They are not shown again." */
function handOverOf(payload: unknown, fallbackName: string): HandOverPanel | null {
  const answer = payload as Partial<InviteResult> | null;
  if (!answer?.handOver) return null;
  const name = answer.data?.name ?? fallbackName;
  const error = answer.sent?.error;
  const why = !error || error === "WhatsApp is not set up" ? "WhatsApp is not set up" : `WhatsApp did not take it (${error})`;
  const both = answer.handOver.link && answer.handOver.pin;
  return {
    line: `${why}, so give ${name} ${both ? "these" : "this"} yourself. ${both ? "They are" : "It is"} not shown again.`,
    link: answer.handOver.link,
    pin: answer.handOver.pin,
  };
}

const nameField: FieldSpec = { id: "name", t: "text", l: "Name", needed: "Write their name." };

/** The five cards, or the ones the caller may give (`_roles`). */
const roleField: FieldSpec = {
  id: "role",
  t: "cards",
  l: "Role",
  nolabel: true,
  cols: 1,
  o: (values) => cardsOf((values._roles as PersonRole[] | undefined) ?? []),
};

/* ── Invite someone ───────────────────────────────────────────────────── */

const personNew: SheetKind = {
  title: "Invite someone",
  sub: SUB,
  cur: "US$",
  sections: [
    {
      fields: [
        nameField,
        {
          id: "phone",
          t: "text",
          l: "Phone or WhatsApp",
          half: true,
          mono: true,
          p: "+263 7",
          needed: "Write a mobile number such as +263 77 123 4567.",
        },
        { id: "email", t: "text", l: "Email", half: true, opt: true, h: "Only needed to sign in to this admin." },
      ],
    },
    // Cashier unless picked otherwise; a manager sees Cashier and Stock clerk only.
    { title: "What they can do", fields: [{ ...roleField, v: "Cashier" }] },
    {
      title: "Where",
      fields: [
        {
          id: "sites",
          t: "tags",
          l: "Sites",
          v: [ALL_SITES],
          p: "Add a site, then Enter",
          needed: "Pick at least one site.",
          tagOptions: siteOptions,
          tagAll: ALL_SITES,
        },
        {
          id: "pin",
          t: "toggle",
          l: "Give them a till PIN",
          h: PIN_HINT,
          // Follows the role card until the toggle is touched.
          derive: (values) => {
            const role = roleOfLabel(values.role);
            return role ? pinByDefault(role) : true;
          },
        },
      ],
    },
  ],
  note: "They get a WhatsApp message with a link. It works for 7 days.",
  primary: "Send the invite",
  load: async (ctx) => {
    const give = await sitesToGive(ctx);
    // "All sites" by default; a site-limited manager starts from their own sites.
    return { _roles: [...rolesFor(ctx)], ...give, sites: give._allSites ? [ALL_SITES] : Object.keys(give._siteIds) };
  },
  done: (result) => `Invite sent to ${(result as PersonView).name}.`,
  handOver: (payload, values) => handOverOf(payload, text(values.name)),
  submit: (values): SheetRequest => ({
    method: "POST",
    url: "/api/v2/retail/people",
    body: {
      name: text(values.name),
      phone: text(values.phone),
      email: text(values.email) || null,
      role: roleOfLabel(values.role) ?? "CASHIER",
      sites: sitesBody(values),
      givePin: values.pin === true,
    },
  }),
  invalidate: invalidatePeople,
  requires: [["retail.people", "create"]],
};

/* ── A person ─────────────────────────────────────────────────────────── */

const personOf = (values: SheetValues) => values._person as PersonView | undefined;
const noAccess = (values: SheetValues) => personOf(values)?.state === "NO_ACCESS";

async function loadPerson(ctx: SheetCtx): Promise<SheetValues> {
  const [answer, give] = await Promise.all([
    call(`/api/v2/retail/people/${encodeURIComponent(ctx.id ?? "")}`),
    sitesToGive(ctx),
  ]);
  if (!answer.ok) throw failure(answer);
  const person = answer.payload!.data as PersonView;
  const roles = person.can.roles.length > 0 ? person.can.roles : PERSON_ROLES;
  const sites = person.sites.all ? [ALL_SITES] : person.sites.names;
  const askedForPin = ctx.params.get("pin") === "1";
  return {
    _person: person,
    _roles: roles.includes(person.role) ? [...roles] : [...roles, person.role],
    _roleLocked: person.can.roles.length === 0,
    ...give,
    _orig: { name: person.name, phone: person.phoneDisplay, role: person.roleLabel, sites },
    name: person.name,
    phone: person.phoneDisplay,
    role: person.roleLabel,
    sites,
    pinText: person.pin.text,
    // On when the PIN is locked, when they come back, or when opened to send one.
    newPin:
      person.state === "NO_ACCESS"
        ? pinByDefault(person.role)
        : person.pin.state === "LOCKED" || (askedForPin && person.can.sendPin),
  };
}

const sameList = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const person: SheetKind = {
  title: (_ctx, values) => personOf(values)?.name ?? "",
  sub: (_ctx, values) => personOf(values)?.sub ?? SUB,
  cur: "US$",
  headLink: (ctx, values) => {
    const view = personOf(values);
    if (!view?.can.inviteAgain) return null;
    return {
      label: "Send the invite again",
      request: { method: "POST", url: `/api/v2/retail/people/${encodeURIComponent(ctx.id ?? "")}/invite-again` },
      done: () => `Invite sent again to ${view.name}.`,
    };
  },
  sections: [
    {
      fields: [
        { ...nameField, readWhen: noAccess },
        {
          id: "phone",
          t: "text",
          l: "Phone or WhatsApp",
          mono: true,
          p: "+263 7",
          needed: "Write a mobile number such as +263 77 123 4567.",
          readWhen: noAccess,
        },
      ],
    },
    {
      title: "What they can do",
      fields: [
        {
          ...roleField,
          readWhen: noAccess,
          // Nobody changes their own role.
          disabled: (values) => values._roleLocked === true,
        },
      ],
    },
    {
      title: "Where and the PIN",
      fields: [
        {
          id: "sites",
          t: "tags",
          l: "Sites",
          p: "Add a site, then Enter",
          needed: "Pick at least one site.",
          tagOptions: siteOptions,
          tagAll: ALL_SITES,
          readWhen: noAccess,
        },
        {
          id: "pinText",
          t: "read",
          l: "Till PIN",
          tone: (values) => (personOf(values)?.pin.state === "LOCKED" && !noAccess(values) ? "warn" : undefined),
        },
        {
          id: "newPin",
          t: "toggle",
          l: "Send a new PIN on WhatsApp",
          lw: (values) =>
            personOf(values)?.pin.state === "NONE" && !noAccess(values) ? "Give them a till PIN" : "Send a new PIN on WhatsApp",
          show: (values) => {
            const view = personOf(values);
            return Boolean(view && (view.can.sendPin || view.can.giveAccessBack));
          },
        },
      ],
    },
  ],
  note: (values) => (personOf(values)?.can.removeAccess ? "Removing access ends any open shift first. Their sales and history stay." : ""),
  primary: (values) => (noAccess(values) ? "Give access back" : "Save"),
  // A manager opening an owner, a manager or a bookkeeper: everything as it stands, and only Close.
  readOnly: (_ctx, values) => {
    const view = personOf(values);
    if (!view) return false;
    return view.state === "NO_ACCESS" ? !view.can.giveAccessBack : !view.can.edit;
  },
  load: loadPerson,
  danger: {
    label: "Remove access",
    show: (_ctx, values) => personOf(values)?.can.removeAccess === true,
    ask: (_ctx, values) => {
      const view = personOf(values);
      const shift = view?.openShifts.map((open) => `${open.shiftNo} on ${open.registerName}`).join(", ") || null;
      return removeAccessAsk(view?.name ?? "this person", shift);
    },
    request: (ctx) => ({ method: "POST", url: `/api/v2/retail/people/${encodeURIComponent(ctx.id ?? "")}/remove-access` }),
    done: (values, result) =>
      removedToast(personOf(values)?.name ?? "They", ((result as { closedShifts?: string[] } | null)?.closedShifts ?? [])),
  },
  done: (result, values) => {
    const name = (result as PersonView | null)?.name ?? personOf(values)?.name ?? "They";
    const pin = values.newPin === true ? " A new PIN is on its way." : "";
    return noAccess(values) ? `${name} can get in again.${pin}` : `${name} saved.${pin}`;
  },
  handOver: (payload, values) => handOverOf(payload, personOf(values)?.name ?? ""),
  submit: (values, ctx): SheetRequest => {
    const id = encodeURIComponent(ctx.id ?? "");
    if (noAccess(values)) {
      return { method: "POST", url: `/api/v2/retail/people/${id}/give-access-back`, body: { sendNewPin: values.newPin === true } };
    }
    const orig = (values._orig ?? {}) as { name?: string; phone?: string; role?: string; sites?: string[] };
    const role = roleOfLabel(values.role);
    return {
      method: "PATCH",
      url: `/api/v2/retail/people/${id}`,
      body: {
        ...(text(values.name) !== orig.name ? { name: text(values.name) } : {}),
        ...(text(values.phone) !== orig.phone ? { phone: text(values.phone) } : {}),
        ...(values.role !== orig.role && role ? { role } : {}),
        ...(!sameList(values.sites, orig.sites) ? { sites: sitesBody(values) } : {}),
        ...(values.newPin === true ? { sendNewPin: true } : {}),
      },
    };
  },
  invalidate: invalidatePeople,
  requires: [["retail.people", "view"]],
};

/* ── Who can do what ──────────────────────────────────────────────────── */

const roles: SheetKind = {
  title: "Who can do what",
  sub: "Role review · every record, every role",
  size: "matrix",
  view: "roles",
  cur: "US$",
  sections: [],
  note: "",
  primary: "Close",
  readOnly: () => true,
  done: "",
  submit: () => null,
  invalidate: [],
  requires: [["retail.people", "view"]],
};

/* ── Send a message ───────────────────────────────────────────────────── */

/** The people a selection sheet is for: `ids`, or the one `id`. */
function selected(ctx: SheetCtx): string[] {
  const ids = ctx.params.get("ids");
  if (ids) return ids.split(",").filter(Boolean);
  return ctx.id ? [ctx.id] : [];
}

const peopleWord = (count: number) => (count === 1 ? "1 person" : `${count} people`);

const peopleMessage: SheetKind = {
  title: (ctx) => `Message ${peopleWord(selected(ctx).length)}`,
  sub: SUB,
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
          needed: "Write a message.",
          schema: z.string().trim().min(1, "Write a message.").max(500, "Keep it to 500 characters."),
        },
      ],
    },
  ],
  note: "They get it in the app and on WhatsApp.",
  primary: (values) => `Send to ${Number(values._count ?? 0)}`,
  load: async (ctx) => ({ _count: selected(ctx).length }),
  done: (result) => `Sent to ${peopleWord(Number((result as { sent?: number } | null)?.sent ?? 0))}.`,
  submit: (values, ctx): SheetRequest => ({
    method: "POST",
    url: "/api/v2/retail/people/message",
    body: { ids: selected(ctx), message: text(values.message) },
  }),
  invalidate: [],
  requires: [["retail.people", "update"]],
};

export const PEOPLE_SHEETS: Record<string, SheetKind> = {
  "person-new": personNew,
  person,
  roles,
  "people-message": peopleMessage,
};
