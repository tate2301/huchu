/**
 * The till's price engine (PRD-05, 20-products 4.4): which price list prices
 * each line of a basket, and at what. Pure — no Prisma, no clock, no network —
 * so the server (`pos/sales`, `pos/catalog`) and the till's offline runtime
 * run the very same rules over the same snapshot.
 *
 * The candidates for a line are the till's base list (the site's or the till's
 * own list when it is on, else the company default) and every other list that
 * is on, not binned, in the base's currency, and whose rules hold for this
 * sale: who (audience), when (Africa/Harare), where (site) and what
 * (categories), with a price row for the quantity. The lower unit price wins;
 * a tie goes to the base list. Money is counted in cents inside.
 *
 * Bundles (PRD-08) are priced by `applyBundles` after the lists: a fixed set
 * the till rang as one, and buy-more deals on their own. Promotions (PRD-09)
 * arrive empty here; `discounts` stays [].
 */

export type PriceListStateWord = "DRAFT" | "ON" | "PAUSED";
export type PriceListAudienceWord = "EVERYONE" | "ACCOUNT_CUSTOMERS" | "LOYALTY_MEMBERS" | "STAFF";
export type PriceListWhenWord = "ALWAYS" | "DAYS_AND_HOURS" | "BETWEEN_DATES";

export type SnapshotList = {
  id: string;
  name: string;
  isDefault: boolean;
  state: PriceListStateWord;
  archived: boolean;
  currency: string;
  taxInclusive: boolean;
  audience: PriceListAudienceWord;
  whenKind: PriceListWhenWord;
  /** ISO weekdays, Monday 1 to Sunday 7. */
  daysOfWeek: number[];
  fromTime: string | null;
  toTime: string | null;
  /** `YYYY-MM-DD`, both days included. */
  startsOn: string | null;
  endsOn: string | null;
  siteId: string | null;
  minQuantity: number;
  /** Empty: every product on the list. */
  categoryIds: string[];
};

export type SnapshotPrice = { priceListId: string; productId: string; minQuantity: number; unitPrice: number };

export type SnapshotProduct = {
  id: string;
  categoryId: string | null;
  barcode: string | null;
  ageCheck: boolean;
  packOfId: string | null;
  packSize: number | null;
  breakAtTill: boolean;
  /** The previous price on the base list, while the shelf shows it. */
  wasPrice: number | null;
};

export type PricingSnapshot = {
  /** Changes whenever anything read into it changes (the `ETag`). */
  version: string;
  pricedAt: string;
  currency: string;
  siteId: string | null;
  registerId: string | null;
  /** The company's default list. */
  defaultListId: string | null;
  /** The till's own list, else the site's; replaces the default while it is on. */
  ownListId: string | null;
  lists: SnapshotList[];
  prices: SnapshotPrice[];
  products: SnapshotProduct[];
  bundles: SnapshotBundle[];
  promotions: never[];
};

export type BundleKindWord = "FIXED_SET" | "BUY_MORE";
export type OnSaleDaysWord = "EVERY_DAY" | "WEEKENDS" | "CHOOSE";

/** A bundle or buy-more deal as the till holds it (PRD-08). */
export type SnapshotBundle = {
  id: string;
  code: string;
  kind: BundleKindWord;
  name: string;
  barcode: string | null;
  categoryId: string | null;
  /** Fixed set: the bundle's price. Buy more: what `buyQuantity` of them cost together. */
  price: number;
  buyQuantity: number | null;
  days: OnSaleDaysWord;
  /** ISO weekdays when `days` is CHOOSE. */
  daysOfWeek: number[];
  /** `YYYY-MM-DD`, the last day it sells; null: no end date. */
  endsOn: string | null;
  siteId: string | null;
  tillButton: boolean;
  state: "ON_SALE" | "PAUSED" | "STOPPED";
  /** `each`: the product's price on the default list, what it costs "on its own". */
  items: Array<{ productId: string; name: string; quantity: number; each: number }>;
};

export type PricingCustomer = {
  /** The list a wholesale account buys off (CUS units pass it; D-3). */
  accountPriceListId?: string | null;
  loyalty?: boolean;
  staff?: boolean;
};

export type PricingContext = {
  at: Date | string;
  /** The till's site; defaults to the snapshot's. */
  siteId?: string | null;
  customer?: PricingCustomer | null;
  /** Price off the base list alone (the back office's "the price" of a product). */
  baseOnly?: boolean;
};

export type BasketLine = { key: string; productId: string; quantity: number };

export type PricedLine = {
  key: string;
  productId: string;
  quantity: number;
  /** Null when no list has a price for it. */
  unitPrice: number | null;
  priceListId: string | null;
  /** The minimum quantity of the row that priced it. */
  minQuantity: number | null;
  discounts: never[];
  total: number | null;
};

export type PricedBasket = { lines: PricedLine[]; subtotal: number; discount: number; total: number };

const cents = (value: number) => Math.round(value * 100);
const units = (value: number) => value / 100;

const HARARE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Harare",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** The sale's moment on Harare's clock: ISO weekday, "HH:MM", "YYYY-MM-DD". */
export function harareMoment(at: Date | string): { weekday: number; time: string; day: string } {
  const parts = Object.fromEntries(HARARE.formatToParts(new Date(at)).map((part) => [part.type, part.value]));
  return { weekday: WEEKDAY[parts.weekday!] ?? 0, time: `${parts.hour}:${parts.minute}`, day: `${parts.year}-${parts.month}-${parts.day}` };
}

const live = (list: SnapshotList) => list.state === "ON" && !list.archived;

function audienceMatches(list: SnapshotList, customer: PricingCustomer | null | undefined): boolean {
  switch (list.audience) {
    case "EVERYONE":
      return true;
    case "ACCOUNT_CUSTOMERS":
      return Boolean(customer?.accountPriceListId) && customer?.accountPriceListId === list.id;
    case "LOYALTY_MEMBERS":
      return Boolean(customer?.loyalty);
    case "STAFF":
      return Boolean(customer?.staff);
  }
}

function timeMatches(list: SnapshotList, moment: ReturnType<typeof harareMoment>): boolean {
  switch (list.whenKind) {
    case "ALWAYS":
      return true;
    case "DAYS_AND_HOURS":
      return (
        list.daysOfWeek.includes(moment.weekday) &&
        list.fromTime !== null &&
        list.toTime !== null &&
        list.fromTime <= moment.time &&
        moment.time < list.toTime
      );
    case "BETWEEN_DATES":
      return (list.startsOn === null || list.startsOn <= moment.day) && (list.endsOn === null || moment.day <= list.endsOn);
  }
}

/** The till's base list: its own (or its site's) while on, else the default. */
export function baseListOf(snapshot: PricingSnapshot): SnapshotList | null {
  const byId = (id: string | null) => (id ? snapshot.lists.find((list) => list.id === id) : undefined);
  const own = byId(snapshot.ownListId);
  if (own && live(own)) return own;
  const fallback = byId(snapshot.defaultListId);
  return fallback && live(fallback) ? fallback : null;
}

export function priceBasket(snapshot: PricingSnapshot, basket: BasketLine[], context: PricingContext): PricedBasket {
  const base = baseListOf(snapshot);
  const siteId = context.siteId === undefined ? snapshot.siteId : context.siteId;
  const moment = harareMoment(context.at);
  const productById = new Map(snapshot.products.map((product) => [product.id, product]));

  const others = context.baseOnly || !base
    ? []
    : snapshot.lists.filter(
        (list) =>
          list.id !== base.id &&
          list.id !== snapshot.defaultListId &&
          live(list) &&
          list.currency === base.currency &&
          audienceMatches(list, context.customer) &&
          timeMatches(list, moment) &&
          (list.siteId === null || list.siteId === siteId),
      );
  const candidates = base ? [base, ...others] : [];

  const rowsByListProduct = new Map<string, SnapshotPrice[]>();
  for (const row of snapshot.prices) {
    const key = `${row.priceListId}:${row.productId}`;
    const rows = rowsByListProduct.get(key) ?? [];
    rows.push(row);
    rowsByListProduct.set(key, rows);
  }

  let subtotalCents = 0;
  const lines = basket.map((line): PricedLine => {
    const product = productById.get(line.productId);
    let best: { list: SnapshotList; row: SnapshotPrice; unitCents: number } | null = null;
    for (const list of candidates) {
      if (line.quantity < list.minQuantity) continue;
      if (list.categoryIds.length > 0 && !(product?.categoryId && list.categoryIds.includes(product.categoryId))) continue;
      // The highest break at or under the quantity.
      const row = (rowsByListProduct.get(`${list.id}:${line.productId}`) ?? [])
        .filter((entry) => entry.minQuantity <= line.quantity)
        .sort((a, b) => b.minQuantity - a.minQuantity)[0];
      if (!row) continue;
      const unitCents = cents(row.unitPrice);
      // Strictly lower: a tie stays with the base list, which comes first.
      if (!best || unitCents < best.unitCents) best = { list, row, unitCents };
    }
    if (!best) {
      return { key: line.key, productId: line.productId, quantity: line.quantity, unitPrice: null, priceListId: null, minQuantity: null, discounts: [], total: null };
    }
    const totalCents = Math.round(best.unitCents * line.quantity);
    subtotalCents += totalCents;
    return {
      key: line.key,
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: units(best.unitCents),
      priceListId: best.list.id,
      minQuantity: best.row.minQuantity,
      discounts: [],
      total: units(totalCents),
    };
  });

  return { lines, subtotal: units(subtotalCents), discount: 0, total: units(subtotalCents) };
}

/** One step of a product's price by quantity at the till: from this many, this price. */
export type PriceBreak = { minQuantity: number; unitPrice: number };

/** The till's price for a line of this many: the highest step at or under it, else the price of one. */
export function priceAtQuantity(priceOfOne: number, breaks: readonly PriceBreak[] | null | undefined, quantity: number): number {
  let price = priceOfOne;
  let at = 1;
  for (const entry of breaks ?? []) {
    if (entry.minQuantity <= quantity && entry.minQuantity > at) {
      price = entry.unitPrice;
      at = entry.minQuantity;
    }
  }
  return price;
}


/* ── Bundles (PRD-08) ─────────────────────────────────────────────────────── */

/** Is this bundle on sale at that moment, at that site? */
export function bundleOnSale(bundle: SnapshotBundle, at: Date | string, siteId: string | null): boolean {
  if (bundle.state !== "ON_SALE") return false;
  if (bundle.siteId !== null && bundle.siteId !== siteId) return false;
  const moment = harareMoment(at);
  if (bundle.endsOn !== null && moment.day > bundle.endsOn) return false;
  switch (bundle.days) {
    case "EVERY_DAY":
      return true;
    case "WEEKENDS":
      return moment.weekday === 6 || moment.weekday === 7;
    case "CHOOSE":
      return bundle.daysOfWeek.includes(moment.weekday);
  }
}

/** "6 × Castle Lager 340ml, 1 × Ice 2kg bag, 1 × Charcoal 4kg" */
export function bundleRecipe(bundle: Pick<SnapshotBundle, "items">): string {
  return bundle.items.map((item) => `${item.quantity} × ${item.name}`).join(", ");
}

/**
 * Shares `total` cents over `weights` pro rata, in whole cents. What the
 * rounding leaves goes to the heaviest share, so the shares sum to `total`.
 */
export function shareCents(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) {
    const shares = weights.map(() => 0);
    shares[0] = total;
    return shares;
  }
  const shares = weights.map((weight) => Math.floor((total * weight) / sum));
  const left = total - shares.reduce((acc, share) => acc + share, 0);
  let heaviest = 0;
  weights.forEach((weight, index) => {
    if (weight > weights[heaviest]!) heaviest = index;
  });
  shares[heaviest]! += left;
  return shares;
}

/** A basket line as the bundles see it: what the lists priced one at, and the bundle the till rang it under. */
export type BundleLine = {
  key: string;
  productId: string;
  quantity: number;
  /** The engine's unit price for the line (the shelf). */
  unitPrice: number;
  /** A fixed set the till rang: its id, and the till's key for that one bundle. */
  bundleId?: string | null;
  bundleRef?: string | null;
};

/**
 * A line, or part of one, as sold: buy-more groups can take some of a line's
 * units and not others, so a line can come back as two pieces. `group`
 * numbers each bundle (and each buy-more group) in the sale from 1; the sale
 * writes it into `bundleRef`. `discount` is the bundle's saving on the piece,
 * in money, off the shelf price.
 */
export type BundledPiece = {
  key: string;
  quantity: number;
  discount: number;
  bundleId: string | null;
  group: number | null;
};

export type BundledBasket = { pieces: BundledPiece[]; saving: number } | { error: string };

export function applyBundles(
  bundles: SnapshotBundle[],
  lines: BundleLine[],
  context: { at: Date | string; siteId: string | null },
): BundledBasket {
  const byId = new Map(bundles.map((bundle) => [bundle.id, bundle]));
  // Per line: its pieces, keyed by group (null: sold on its own).
  const pieces = new Map<string, Map<number | null, { quantity: number; cents: number; bundleId: string | null }>>();
  const add = (key: string, group: number | null, bundleId: string | null, quantity: number, cents: number) => {
    const ofLine = pieces.get(key) ?? new Map();
    const piece = ofLine.get(group) ?? { quantity: 0, cents: 0, bundleId };
    piece.quantity += quantity;
    piece.cents += cents;
    ofLine.set(group, piece);
    pieces.set(key, ofLine);
  };
  let group = 0;
  let savingCents = 0;

  // 1. Fixed sets the till rang as one: the components must be the bundle's items × n.
  const rung = new Map<string, BundleLine[]>();
  for (const line of lines) {
    if (!line.bundleId) continue;
    const ref = `${line.bundleId}|${line.bundleRef ?? ""}`;
    rung.set(ref, [...(rung.get(ref) ?? []), line]);
  }
  for (const members of rung.values()) {
    const bundle = byId.get(members[0]!.bundleId!);
    if (!bundle || bundle.kind !== "FIXED_SET" || !bundleOnSale(bundle, context.at, context.siteId)) {
      return { error: `${bundle?.name ?? "That bundle"} is not on sale now. Ring its items on their own.` };
    }
    const held = new Map<string, number>();
    for (const line of members) held.set(line.productId, (held.get(line.productId) ?? 0) + line.quantity);
    const first = bundle.items[0];
    const times = first ? (held.get(first.productId) ?? 0) / first.quantity : 0;
    const exact =
      Number.isInteger(times) &&
      times >= 1 &&
      held.size === bundle.items.length &&
      bundle.items.every((item) => held.get(item.productId) === item.quantity * times);
    if (!exact) return { error: `That is not a ${bundle.name}: it needs ${bundleRecipe(bundle)}.` };

    group += 1;
    const target = cents(bundle.price) * times;
    const eachOf = new Map(bundle.items.map((item) => [item.productId, cents(item.each)]));
    const shelf = members.map((line) => Math.round(cents(line.unitPrice) * line.quantity));
    const shelfTotal = shelf.reduce((acc, value) => acc + value, 0);
    let shares: number[];
    if (shelfTotal <= target) {
      // No saving at today's shelf prices: each sells at its own.
      shares = shelf;
    } else {
      // Pro rata to "On their own"; should the till's list sell one under its share, pro rata to the shelf.
      shares = shareCents(target, members.map((line) => (eachOf.get(line.productId) ?? 0) * line.quantity));
      if (shares.some((share, index) => share > shelf[index]!)) shares = shareCents(target, shelf);
    }
    members.forEach((line, index) => {
      const off = shelf[index]! - shares[index]!;
      savingCents += off;
      add(line.key, group, bundle.id, line.quantity, off);
    });
  }

  // 2. Buy more, pay less: on its own, over the units no fixed set took, priced highest first.
  const deals = bundles
    .filter((bundle) => bundle.kind === "BUY_MORE" && (bundle.buyQuantity ?? 0) >= 2 && bundleOnSale(bundle, context.at, context.siteId))
    .sort((a, b) => a.code.localeCompare(b.code));
  const left = new Map(lines.filter((line) => !line.bundleId).map((line) => [line.key, Math.floor(line.quantity)]));
  for (const deal of deals) {
    const products = new Set(deal.items.map((item) => item.productId));
    const units: Array<{ key: string; cents: number }> = [];
    for (const line of lines) {
      if (line.bundleId || !products.has(line.productId)) continue;
      const free = left.get(line.key) ?? 0;
      for (let unit = 0; unit < free; unit += 1) units.push({ key: line.key, cents: cents(line.unitPrice) });
    }
    units.sort((a, b) => b.cents - a.cents);
    const size = deal.buyQuantity!;
    for (let start = 0; start + size <= units.length; start += size) {
      const members = units.slice(start, start + size);
      const shelfTotal = members.reduce((acc, unit) => acc + unit.cents, 0);
      const saving = shelfTotal - cents(deal.price);
      if (saving <= 0) continue;
      group += 1;
      const offs = shareCents(saving, members.map((unit) => unit.cents));
      members.forEach((unit, index) => {
        left.set(unit.key, (left.get(unit.key) ?? 0) - 1);
        add(unit.key, group, deal.id, 1, offs[index]!);
      });
      savingCents += saving;
    }
  }

  // 3. What is left of each line sells on its own.
  const out: BundledPiece[] = [];
  for (const line of lines) {
    const ofLine = pieces.get(line.key);
    const taken = ofLine ? [...ofLine.values()].reduce((acc, piece) => acc + piece.quantity, 0) : 0;
    const rest = Math.round((line.quantity - taken) * 10_000) / 10_000;
    if (rest > 0) out.push({ key: line.key, quantity: rest, discount: 0, bundleId: null, group: null });
    for (const [at, piece] of ofLine ?? []) {
      out.push({ key: line.key, quantity: piece.quantity, discount: units(piece.cents), bundleId: piece.bundleId, group: at });
    }
  }
  return { pieces: out, saving: units(savingCents) };
}
