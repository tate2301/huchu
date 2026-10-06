import { z } from "zod";

import { closeSiteAsk } from "@/lib/retail/asks/sites";
import { LICENCE_WEEK, parseWindow, windowText, type LicenceWindow } from "@/lib/retail/licence-hours";
import type { SiteLicence } from "@/lib/retail/site-licence-hours";
import { moveFromWords, siteNewNote, sitesLeft, suggestSiteCode, zimbabwePhone, type PlanRoom } from "@/lib/retail/site-words";
import type { SiteDetail, SiteNewContext } from "@/lib/retail/sites";
import type { FieldSpec, PickedOption, SheetCtx, SheetKind, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * Setup's sheets (10-setup 5.4; W-03, W-66): Add a site, a site (its places,
 * the default, close it), and the Sites row menu's Make default, Licence hours
 * and Close this site. Each saves through `/api/v2/retail/sites*`.
 */

const invalidateSites = [["list", "retail-sites"], ["lookup", "site"], ["lookup", "price-list"]];

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const payload = (await response.json().catch(() => null)) as { error?: string; data?: T } | T | null;
  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error ?? "That could not be read. Close it and try again.");
  }
  return ((payload as { data?: T })?.data ?? payload) as T;
}

const siteUrl = (ctx: SheetCtx, rest = "") => `/api/v2/retail/sites/${encodeURIComponent(ctx.id ?? "")}${rest}`;
const readSite = (ctx: SheetCtx) => readJson<SiteDetail>(siteUrl(ctx));

const phoneSchema = z.string().refine((value) => zimbabwePhone(value) !== null, "Write a Zimbabwe number, like +263 24 270 5521.");
const codeSchema = z
  .string()
  .refine((value) => /^[A-Z0-9]{2,6}$/.test(value.replace(/\s+/g, "").toUpperCase()), "Write the short code as 2 to 6 letters or figures, like HRE.");

/* ── Fields both sheets share ─────────────────────────────────────────────── */

const nameField: FieldSpec = { id: "name", t: "text", l: "Name" };
const codeField = (hint: boolean): FieldSpec => ({
  id: "code",
  t: "text",
  l: "Short code",
  half: true,
  mono: true,
  upper: true,
  ...(hint ? { h: "On receipts and transfers." } : {}),
  schema: codeSchema,
});
/**
 * Phone, address and hours may be left empty. The boards mark only Add a
 * site's phone as optional; the site sheet marks none, and Add a site asks
 * for the address.
 */
const phoneField = (quiet: boolean): FieldSpec => ({
  id: "phone",
  t: "text",
  l: "Phone",
  half: true,
  mono: true,
  opt: true,
  optQuiet: quiet,
  schema: phoneSchema,
});
const addressField = (opt: boolean): FieldSpec => ({ id: "address", t: "area", l: "Address", rows: 2, ...(opt ? { opt: true, optQuiet: true } : {}) });
/** The site sheet keeps its last place (no ×); Add a site may clear it and is then asked for one. */
const placesField = (placeholder: string, hint: string, keepOne: boolean): FieldSpec => ({
  id: "places",
  t: "tags",
  l: "Places inside it",
  p: placeholder,
  h: hint,
  keepOne,
});
const priceListField: FieldSpec = { id: "priceListId", t: "auto", l: "Price list", noun: "price-list" };
const hoursField: FieldSpec = {
  id: "openingHours",
  t: "text",
  l: "Open",
  opt: true,
  optQuiet: true,
  p: "Mon to Sat 08:00 to 21:00, Sun 10:00 to 17:00",
};

const text = (value: unknown) => String(value ?? "").trim();
const orNull = (value: unknown) => text(value) || null;

/** The site's places as the API reads them: a known place keeps its id. */
function placesBody(values: SheetValues) {
  const known = (values._places ?? []) as SiteDetail["placeList"];
  return ((values.places ?? []) as string[]).map((name) => {
    const place = known.find((row) => row.name.toLowerCase() === name.toLowerCase());
    return place ? { id: place.id, name } : { name };
  });
}

function siteBody(values: SheetValues) {
  return {
    name: text(values.name),
    code: text(values.code).toUpperCase(),
    phone: orNull(values.phone),
    address: orNull(values.address),
    places: placesBody(values),
    priceListId: (values.priceListId as PickedOption | null)?.id ?? null,
    openingHours: orNull(values.openingHours),
  };
}

/* ── Add a site (`K.site`, board SiteNew) ─────────────────────────────────── */

const START_EMPTY = "Start empty";

const plan = (values: SheetValues) => (values._plan ?? null) as PlanRoom | null;
const noRoom = (values: SheetValues) => {
  const room = plan(values);
  return room !== null && sitesLeft(room) === 0;
};
/** The default site, or the first other open site, that stock could come from. */
const fromSite = (values: SheetValues) => (values._from ?? null) as { id: string; name: string } | null;

const siteNew: SheetKind = {
  title: "Add a site",
  sub: "Setup › Sites",
  cur: "US$",
  sections: [
    {
      fields: [
        nameField,
        {
          ...codeField(true),
          derive: (values) => suggestSiteCode(text(values.name), (values._takenCodes ?? []) as string[]),
        },
        phoneField(false),
        addressField(false),
      ],
    },
    {
      title: "Where stock sits",
      fields: [
        {
          ...placesField(
            "Back store, cold room… then Enter",
            "Leave it as one place unless you move stock between rooms. A site with one place never asks which.",
            false,
          ),
          v: ["Shop floor"],
        },
      ],
    },
    {
      title: "Selling there",
      fields: [
        priceListField,
        {
          id: "stock",
          t: "seg",
          l: "Stock",
          v: START_EMPTY,
          // "Move some from …" only when another open site has stock to send.
          o: (values) => {
            const from = fromSite(values);
            return from ? [START_EMPTY, moveFromWords(from.name)] : [START_EMPTY];
          },
          h: "Moving stock makes a transfer for the other site to receive.",
        },
        hoursField,
      ],
    },
  ],
  note: (values) => siteNewNote(plan(values)),
  noteLink: (values) => (noRoom(values) ? { label: "Plan and billing", href: "/preferences/organization/billing" } : null),
  primary: "Add site",
  primaryDisabled: noRoom,
  done: (result) => `${(result as SiteDetail).name} added. Pair its tills next.`,
  open: (result) => `/retail/manage/tills?sheet=till-new&site=${encodeURIComponent((result as SiteDetail).id)}`,
  openLabel: "Pair a till",
  // "Move some from …": the new site is made, then the transfer opens from that site to it.
  next: (result, values) => {
    const from = fromSite(values);
    if (!from || values.stock === START_EMPTY) return null;
    const params = new URLSearchParams({ sheet: "transfer-new", from: from.id, to: (result as SiteDetail).id });
    return `/retail/stock/transfers?${params.toString()}`;
  },
  load: async () => {
    const context = await readJson<SiteNewContext>("/api/v2/retail/sites/new-context");
    const list = context.priceLists.find((option) => option.id === context.defaultPriceListId) ?? null;
    return {
      priceListId: list ? { id: list.id, label: list.name, sub: list.sub } : null,
      _plan: context.plan,
      _takenCodes: context.takenCodes,
      _from: context.otherSites[0] ?? null,
    };
  },
  submit: (values) => ({
    method: "POST",
    url: "/api/v2/retail/sites",
    body: { ...siteBody(values), stock: values.stock === START_EMPTY ? "EMPTY" : "MOVE" },
  }),
  invalidate: invalidateSites,
  requires: [["retail.sites", "create"]],
};

/* ── A site (`K.siteedit`, board SiteEdit) ────────────────────────────────── */

function siteValues(site: SiteDetail): SheetValues {
  return {
    name: site.name,
    code: site.code,
    phone: site.phone ?? "",
    address: site.address ?? "",
    isDefault: site.isDefault,
    places: site.placeList.map((place) => place.name),
    priceListId: site.priceListId && site.priceList ? { id: site.priceListId, label: site.priceList } : null,
    openingHours: site.openingHours ?? "",
    _name: site.name,
    _sub: site.sub,
    _isDefault: site.isDefault,
    _closed: site.state === "CLOSED",
    _places: site.placeList,
  };
}

const DEFAULT_HINT = "New products, orders and stock go here unless you choose another.";
/** The default site switched off: it cannot be, until another is the default. */
const unsettingDefault = (values: SheetValues) => values._isDefault === true && values.isDefault !== true;

const siteEdit: SheetKind = {
  title: (_ctx, values) => String(values._name ?? ""),
  sub: (_ctx, values) => String(values._sub ?? "Setup › Sites"),
  cur: "US$",
  sections: [
    {
      fields: [
        nameField,
        codeField(false),
        phoneField(true),
        addressField(true),
        {
          id: "isDefault",
          t: "toggle",
          l: "Default site",
          h: (values) => (unsettingDefault(values) ? "Make another site the default instead." : DEFAULT_HINT),
          warn: unsettingDefault,
        },
      ],
    },
    {
      title: "Where stock sits",
      fields: [placesField("Add a place, then Enter", "Removing a place moves its stock to the shop floor.", true)],
    },
    { title: "Selling there", fields: [priceListField, hoursField] },
  ],
  note: "Closing keeps its history. Stock must be moved or counted to zero first.",
  primary: "Save",
  done: (result) => `${(result as SiteDetail).name} saved.`,
  danger: {
    label: "Close this site",
    // The owner, on an open site that is not the default.
    show: (ctx, values) =>
      ctx.can("retail.sites", "delete") && values._name !== undefined && values._isDefault !== true && values._closed !== true,
    ask: (_ctx, values) => closeSiteAsk(String(values._name ?? "this site")),
    request: (ctx) => ({ method: "POST", url: siteUrl(ctx, "/close") }),
    done: (values) => `${String(values._name ?? "The site")} closed.`,
  },
  // A stock clerk and a bookkeeper read it; a closed site keeps its details.
  readOnly: (ctx, values) => !ctx.can("retail.sites", "update") || values._closed === true,
  load: async (ctx) => siteValues(await readSite(ctx)),
  submit: (values, ctx) => ({
    method: "PATCH",
    url: siteUrl(ctx),
    body: {
      ...siteBody(values),
      // Switching the default on sends it; switching the default site off is refused by the server.
      ...(values.isDefault === true ? { isDefault: true } : values._isDefault === true ? { isDefault: false } : {}),
    },
  }),
  invalidate: invalidateSites,
  requires: [["retail.sites", "view"]],
};

/* ── The row menu's Make default and Close this site (inferred) ───────────── */

const siteDefault: SheetKind = {
  title: (_ctx, values) => (values._name ? `Make ${String(values._name)} the default site?` : "Make default"),
  sub: (_ctx, values) => String(values._sub ?? "Setup › Sites"),
  cur: "US$",
  guide: DEFAULT_HINT,
  sections: [],
  note: "",
  primary: "Make default",
  done: (result) => `${(result as SiteDetail).name} is the default site now.`,
  load: async (ctx) => siteValues(await readSite(ctx)),
  submit: (_values, ctx) => ({ method: "PATCH", url: siteUrl(ctx), body: { isDefault: true } }),
  invalidate: invalidateSites,
  requires: [["retail.sites", "update"]],
};

const siteClose: SheetKind = {
  title: (_ctx, values) => (values._name ? closeSiteAsk(String(values._name)).title : "Close this site"),
  sub: (_ctx, values) => String(values._sub ?? "Setup › Sites"),
  cur: "US$",
  guide: closeSiteAsk("").body,
  sections: [],
  note: "Stock must be moved or counted to zero first.",
  primary: "Close the site",
  primaryTone: "danger",
  done: (result) => `${(result as SiteDetail).name} closed.`,
  load: async (ctx) => siteValues(await readSite(ctx)),
  submit: (_values, ctx) => ({ method: "POST", url: siteUrl(ctx, "/close") }),
  invalidate: invalidateSites,
  requires: [["retail.sites", "delete"]],
};

/* ── A site's licence hours (row menu) ─────────────────────────────────────── */

/** How a weekday sells 18+ products: no row, a window, or an empty window. */
const DAY = { all: "All day", between: "Between", none: "Not at all" } as const;
const windowSchema = z.string().refine((value) => parseWindow(value) !== null, "Write two different times, like 08:00 to 22:00.");

function licenceValues(licence: SiteLicence): SheetValues {
  const values: SheetValues = {
    _name: licence.name,
    _closed: licence.closed,
    _enforced: licence.enforced,
  };
  for (const [weekday] of LICENCE_WEEK) {
    const day = licence.days.find((entry) => entry.weekday === weekday);
    values[`mode${weekday}`] = !day ? DAY.all : day.alcoholFrom === day.alcoholUntil ? DAY.none : DAY.between;
    values[`hours${weekday}`] = day && day.alcoholFrom !== day.alcoholUntil ? windowText(day.alcoholFrom, day.alcoholUntil) : "08:00 to 22:00";
  }
  return values;
}

function licenceDays(values: SheetValues): LicenceWindow[] {
  return LICENCE_WEEK.flatMap(([weekday]): LicenceWindow[] => {
    const mode = values[`mode${weekday}`];
    if (mode === DAY.none) return [{ weekday, alcoholFrom: 0, alcoholUntil: 0 }];
    const window = mode === DAY.between ? parseWindow(text(values[`hours${weekday}`])) : null;
    return window ? [{ weekday, ...window }] : [];
  });
}

const siteLicence: SheetKind = {
  title: "Licence hours",
  sub: (_ctx, values) => String(values._name ?? "Setup › Sites"),
  cur: "US$",
  guide: (values) =>
    values._enforced === false
      ? "The till does not stop 18+ products by the clock now. Switch licence hours on under Company for these to count."
      : "The till stops 18+ products outside these hours, and nobody overrides it. Bread and airtime still sell.",
  sections: [
    {
      title: "When 18+ products sell",
      fields: LICENCE_WEEK.flatMap(([weekday, name]): FieldSpec[] => [
        { id: `mode${weekday}`, t: "seg", l: name, half: true, o: [DAY.all, DAY.between, DAY.none], v: DAY.all },
        {
          id: `hours${weekday}`,
          t: "text",
          l: `${name} hours`,
          half: true,
          mono: true,
          h: "Like 08:00 to 22:00.",
          schema: windowSchema,
          show: (values) => values[`mode${weekday}`] === DAY.between,
        },
      ]),
    },
  ],
  note: "An end before the start runs past midnight: 10:00 to 02:00 sells until 02:00 the next morning.",
  primary: "Save licence hours",
  done: (_result, values) => `${String(values._name ?? "The site")}'s licence hours saved.`,
  readOnly: (ctx, values) => !ctx.can("retail.sites", "update") || values._closed === true,
  load: async (ctx) => licenceValues(await readJson<SiteLicence>(siteUrl(ctx, "/licence-hours"))),
  submit: (values, ctx) => ({ method: "PUT", url: siteUrl(ctx, "/licence-hours"), body: { days: licenceDays(values) } }),
  invalidate: invalidateSites,
  requires: [["retail.sites", "view"]],
};

export const SETUP_SHEETS: Record<string, SheetKind> = {
  "site-new": siteNew,
  site: siteEdit,
  "site-default": siteDefault,
  "site-licence": siteLicence,
  "site-close": siteClose,
};
