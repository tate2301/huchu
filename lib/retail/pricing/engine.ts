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
 * Bundles and promotions (PRD-08/09) arrive empty here; `discounts` stays [].
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
  bundles: never[];
  promotions: never[];
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
