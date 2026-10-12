import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import { nameAndPhone, pointsAndVisits } from "@/lib/retail/customers/merge-words";
import { labelsPrintedSentence } from "@/lib/retail/labels/words";
import { adjustReasonLabel, pointsWords } from "@/lib/retail/loyalty/format";
import { priceWords, productWords, scheduledActivity, undoneActivity } from "@/lib/retail/prices/words";
import { dayMonth } from "@/lib/retail/buying/words";
import { tenderLabel } from "@/lib/retail/words";
import { DEFAULT_TIME_ZONE, formatCount, formatDay, formatMoney, formatPercent, formatSigned, formatTime } from "@/lib/workspace/format";

/**
 * What a record's Activity tab says about each event (00-foundations 5.6.9).
 *
 * One table, event type → sentence and tone, read off the event's payload.
 * Area specs add their events' sentences here, in the same shape. An event
 * nobody has given words to reads as the last segment of its type in sentence
 * case ("RETAIL_EXPORT.DOWNLOADED" → "Downloaded"), never as a blank.
 */

export type ActivityTone = "ok" | "info" | "warn" | "bad" | "hollow";

export type ActivityWords = { what: string; tone: ActivityTone };

type Payload = Record<string, unknown>;

const text = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

/** "Name, Who gets it and Where". */
const joinAnd = (words: string[]): string =>
  words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

const amount = (value: unknown): number | null => {
  const raw = text(value);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

/** "Friday 16:00", in the shop's zone. */
const weekdayTime = (at: Date) =>
  `${new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: DEFAULT_TIME_ZONE }).format(at)} ${formatTime(at)}`;

const currencyOf = (payload: Payload) => text(payload.currency) ?? "USD";

/** "US$13.00", or the figure as it was written when it is not one. */
const moneyWords = (value: unknown, currency = "USD") => {
  const figure = amount(value);
  return figure === null ? (text(value) ?? "nothing") : formatMoney(figure, currency);
};

/** A changed value, printed the way its field shows it. */
function valueWords(value: unknown, kind: unknown): string | null {
  const raw = text(value);
  if (raw === null) return null;
  const figure = amount(raw);
  if (figure !== null && kind === "money") return formatMoney(figure);
  if (figure !== null && kind === "count") return formatCount(figure);
  if (figure !== null && kind === "percent") return formatPercent(figure);
  return raw;
}

const SALE_VERB: Record<string, [string, ActivityTone]> = {
  [RETAIL_AUDIT_EVENTS.salePosted]: ["Sold", "ok"],
  [RETAIL_AUDIT_EVENTS.saleRefunded]: ["Refunded", "warn"],
  [RETAIL_AUDIT_EVENTS.saleVoided]: ["Voided", "bad"],
};

function saleWords(eventType: string, payload: Payload): ActivityWords {
  const [verb, tone] = SALE_VERB[eventType]!;
  const ref = text(payload.saleNo) ?? "a sale";
  const total = amount(payload.totalAmount);
  // A reversal is stored negative; the sentence already says which way it went.
  const figure = total === null ? null : formatMoney(Math.abs(total), currencyOf(payload));
  return { what: figure ? `${verb} ${ref} for ${figure}` : `${verb} ${ref}`, tone };
}

/** "Reversed ADJ-0031", "Reversed ADJ-0030 and BRK-0012". */
function movementsReversedWords(payload: Payload): ActivityWords {
  const references = Array.isArray(payload.references) ? payload.references.map(text).filter((ref): ref is string => Boolean(ref)) : [];
  if (references.length === 0) return { what: "Reversed a movement", tone: "hollow" };
  const list =
    references.length === 1 ? references[0]! : `${references.slice(0, -1).join(", ")} and ${references[references.length - 1]!}`;
  return { what: `Reversed ${list}`, tone: "hollow" };
}

const WHY_WORDS: Record<string, string> = {
  BROKEN: "broken or spoilt",
  OWN_USE: "own use or gift",
  FOUND: "found more",
};

/** A count as typed: whole numbers grouped, a weight to its decimals. */
const countWords = (value: number) => (Number.isInteger(value) ? formatCount(value) : String(value));

/**
 * "Took 2 off: broken or spoilt, US$26.06", "Added 2: found more", "Set on
 * hand from 13 to 11" (W-23). The money part only for those who may see cost.
 */
function stockAdjustedWords(payload: Payload, seeCost: boolean): ActivityWords {
  const delta = amount(payload.delta) ?? 0;
  const value = amount(payload.value);
  const money = seeCost && value !== null && value > 0 ? `, ${formatMoney(value)}` : "";
  const why = text(payload.why) ?? "";
  if (why === "CORRECTION") {
    const from = amount(payload.from);
    const to = amount(payload.to);
    return {
      what: from !== null && to !== null ? `Set on hand from ${countWords(from)} to ${countWords(to)}` : "Set the number on hand",
      tone: "warn",
    };
  }
  if (delta > 0) return { what: `Added ${countWords(delta)}: ${WHY_WORDS[why] ?? "found more"}${money}`, tone: "warn" };
  return { what: `Took ${countWords(-delta)} off: ${WHY_WORDS[why] ?? "adjusted"}${money}`, tone: "warn" };
}

/** "Broke 1 case into 24 singles (BRK-0012)" (W-26). */
function caseBrokenWords(payload: Payload): ActivityWords {
  const cases = amount(payload.cases) ?? 1;
  const singles = amount(payload.singles);
  const ref = text(payload.reference);
  return {
    what: `Broke ${formatCount(cases)} ${cases === 1 ? "case" : "cases"}${
      singles === null ? "" : ` into ${formatCount(singles)} ${singles === 1 ? "single" : "singles"}`
    }${ref ? ` (${ref})` : ""}`,
    tone: "hollow",
  };
}

function shiftClosedWords(payload: Payload): ActivityWords {
  const variance = amount(payload.variance);
  if (variance === null || amount(payload.countedCash) === null) {
    const reason = text(payload.reason);
    return { what: reason ? `Closed without a count: ${reason}` : "Closed without a count", tone: "warn" };
  }
  if (variance < 0) return { what: `Counted and closed, short by ${formatMoney(-variance)}`, tone: "bad" };
  if (variance > 0) return { what: `Counted and closed, over by ${formatMoney(variance)}`, tone: "warn" };
  return { what: "Counted and closed, balanced", tone: "ok" };
}

/** "Signed off: accepted −US$7.15", "Signed off: US$20.00 to recover", "Being looked into" (FLR-05). */
function shiftSignedOffWords(payload: Payload): ActivityWords {
  const figure = amount(payload.amount);
  if (payload.outcome === "RECOVER") return { what: `Signed off: ${formatMoney(Math.abs(figure ?? 0))} to recover`, tone: "warn" };
  if (payload.outcome === "LOOK_INTO") return { what: "Being looked into", tone: "warn" };
  return { what: figure === null ? "Signed off: accepted, not counted" : `Signed off: accepted ${formatSigned(figure)}`, tone: "ok" };
}

/** "Closed the day, US$2,610.00 banked" (FLR-07). */
function dayClosedWords(payload: Payload): ActivityWords {
  const banked = amount(payload.banked);
  return { what: banked ? `Closed the day, ${formatMoney(banked)} banked` : "Closed the day", tone: "ok" };
}

function cashMovedWords(payload: Payload): ActivityWords {
  const figure = moneyWords(payload.amount, currencyOf(payload));
  switch (payload.type) {
    case "DROP_TO_SAFE":
      return { what: `Dropped ${figure} to the safe`, tone: "hollow" };
    case "FLOAT_TOP_UP":
      return { what: `Put ${figure} in for change`, tone: "hollow" };
    default:
      return { what: payload.reasonCode === "PETTY_CASH" ? `Paid out ${figure} for petty cash` : `Paid out ${figure}`, tone: "hollow" };
  }
}

function recordEditedWords(payload: Payload): ActivityWords {
  const label = text(payload.label) ?? text(payload.field) ?? "a value";
  const from = valueWords(payload.from, payload.kind);
  const to = valueWords(payload.to, payload.kind) ?? "nothing";
  return { what: from === null ? `Set ${label} to ${to}` : `Changed ${label} from ${from} to ${to}`, tone: "info" };
}

function settingsChangedWords(payload: Payload): ActivityWords {
  const changes = Array.isArray(payload.changes) ? (payload.changes as Payload[]) : [];
  const labels = changes.map((change) => text(change.label) ?? text(change.field)).filter(Boolean);
  return { what: labels.length ? `Changed ${labels.join(", ")}` : "Changed the settings", tone: "info" };
}

function goodsReceivedWords(payload: Payload): ActivityWords {
  const ref = text(payload.receiptNo) ?? "a delivery";
  const units = amount(payload.units);
  const lines = amount(payload.lineCount);
  const detail =
    units !== null
      ? `, ${formatCount(units)} ${units === 1 ? "unit" : "units"}`
      : lines !== null
        ? `, ${formatCount(lines)} ${lines === 1 ? "line" : "lines"}`
        : "";
  return { what: `Received ${ref}${detail}`, tone: "ok" };
}

function orderClosedWords(payload: Payload): ActivityWords {
  const owed = Array.isArray(payload.owed) ? (payload.owed as Payload[]) : [];
  const units = owed.reduce((sum, line) => sum + (amount(line.quantity) ?? 0), 0);
  if (units <= 0) return { what: "Closed with what came", tone: "hollow" };
  return {
    what: `Closed with what came, ${formatCount(units)} ${units === 1 ? "unit" : "units"} not delivered`,
    tone: "hollow",
  };
}

/** "Sent on WhatsApp to Tinashe Moyo" / "Sent by email to orders@delta.co.zw" / "Marked sent by hand". */
function orderSentWords(payload: Payload): ActivityWords {
  const via = text(payload.via);
  const to = Array.isArray(payload.to) ? payload.to.map(String).filter(Boolean).join(" and ") : text(payload.to);
  if (via === "WHATSAPP") return { what: to ? `Sent on WhatsApp to ${to}` : "Sent on WhatsApp", tone: "info" };
  if (via === "EMAIL") return { what: to ? `Sent by email to ${to}` : "Sent by email", tone: "info" };
  return { what: "Marked sent by hand", tone: "info" };
}

/** "Changed the lines: Castle Lager 340ml 240 → 300, told Delta"; an expected date alone: "Changed the expected date to 7 October". */
function orderChangedWords(payload: Payload): ActivityWords {
  const changes = Array.isArray(payload.changes) ? (payload.changes as Payload[]) : [];
  const told = text(payload.toldName);
  const parts = changes.map((change) => {
    const from = text(change.from);
    const to = text(change.to);
    const item = text(change.item) ?? "a line";
    if (from === null) return `${item} added, ${to ?? 0}`;
    if (to === null) return `${item} taken off`;
    return `${item} ${from} → ${to}`;
  });
  const lead = parts.length
    ? `Changed the lines: ${parts.join(", ")}`
    : text(payload.expectedWords)
      ? `Changed the expected date to ${text(payload.expectedWords)}`
      : "Changed the order";
  return { what: told ? `${lead}, told ${told}` : lead, tone: "info" };
}

/** What a supplier's contact is sent (`VendorContactSends`). */
const SENDS_WORDS: Record<string, string> = { ORDERS: "orders", STATEMENTS: "statements", NOTHING: "nothing" };

const BUSINESS_TYPES: Record<string, string> = {
  LIQUOR: "liquor store",
  GENERAL: "general retail",
};

const FEATURE_WORDS: Record<string, string> = {
  ageCheck: "the age check",
  licenceHours: "licence hours",
  emptiesAndDeposits: "empties and deposits",
  casesAndSingles: "cases and singles",
};

/**
 * The business type, or the switches that moved. The switches can only be
 * named when the event carries them before and after (`featuresBefore`).
 */
function shopProfileWords(payload: Payload): ActivityWords {
  const before = text(payload.businessTypeBefore);
  const after = text(payload.businessType);
  if (after && before !== after) {
    return { what: `Changed the business type to ${BUSINESS_TYPES[after] ?? after.toLowerCase()}`, tone: "info" };
  }
  const now = (payload.features ?? {}) as Record<string, unknown>;
  const was = payload.featuresBefore as Record<string, unknown> | undefined;
  if (was) {
    const turned = Object.keys(FEATURE_WORDS)
      .filter((key) => Boolean(now[key]) !== Boolean(was[key]))
      .map((key) => `${FEATURE_WORDS[key]} ${now[key] ? "on" : "off"}`);
    if (turned.length) return { what: `Turned ${turned.join(", ")}`, tone: "info" };
  }
  return { what: "Changed the shop's features", tone: "info" };
}

/** "Changed VAT to Zero-rated for 6 products", "Changed Target margin from 22% to 25%". */
function categoryChangedWords(payload: Payload): ActivityWords {
  const changes = Array.isArray(payload.changes) ? (payload.changes as Payload[]) : [];
  const products = amount(payload.products) ?? 0;
  const vat = changes.find((change) => change.field === "vat");
  if (vat && changes.length === 1) {
    const count = products > 0 ? ` for ${formatCount(products)} ${products === 1 ? "product" : "products"}` : "";
    return { what: `Changed VAT to ${text(vat.to) ?? "nothing"}${count}`, tone: "info" };
  }
  if (changes.length === 1) {
    const only = changes[0]!;
    const label = text(only.label) ?? text(only.field) ?? "a value";
    const from = text(only.from);
    const to = text(only.to) ?? "nothing";
    return { what: from === null ? `Set ${label} to ${to}` : `Changed ${label} from ${from} to ${to}`, tone: "info" };
  }
  const labels = changes.map((change) => text(change.label) ?? text(change.field)).filter(Boolean);
  return { what: labels.length ? `Changed ${labels.join(", ")}` : "Changed it", tone: "info" };
}

/** "Deleted it and moved 61 products to Spirits and liqueurs". */
function categoryDeletedWords(payload: Payload): ActivityWords {
  const moved = amount(payload.moved) ?? 0;
  const into = text(payload.into);
  if (moved > 0 && into) {
    return { what: `Deleted it and moved ${formatCount(moved)} ${moved === 1 ? "product" : "products"} to ${into}`, tone: "bad" };
  }
  return { what: "Deleted it", tone: "bad" };
}

const SITE_FIELD_WORDS: Record<string, string> = {
  name: "Name",
  code: "Short code",
  phone: "Phone",
  address: "Address",
  openingHours: "Open",
  priceList: "Price list",
  licenceHours: "Licence hours",
};

/** "Added Cold room, removed Back store and moved 3 stock lines", "Made it the default site", "Changed Phone". */
function siteChangedWords(payload: Payload): ActivityWords {
  const names = (value: unknown) => (Array.isArray(value) ? value.map((entry) => text(entry)).filter(Boolean) : []);
  const added = names(payload.placesAdded);
  const removed = names(payload.placesRemoved);
  const moved = amount(payload.stockMoved) ?? 0;
  const changes = payload.changes && typeof payload.changes === "object" ? Object.keys(payload.changes as Payload) : [];
  const parts = [
    payload.madeDefault ? "made it the default site" : null,
    changes.length ? `changed ${changes.map((key) => SITE_FIELD_WORDS[key] ?? key).join(", ")}` : null,
    added.length ? `added ${added.join(", ")}` : null,
    removed.length ? `removed ${removed.join(", ")}` : null,
    moved > 0 ? `moved ${formatCount(moved)} stock ${moved === 1 ? "line" : "lines"} with it` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return { what: "Changed it", tone: "info" };
  const sentence = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return { what: sentence.charAt(0).toUpperCase() + sentence.slice(1), tone: "info" };
}

/** The table. Keyed by event type; area specs add theirs here. */
/** "a bookkeeper", "an owner" from a People role (`OWNER`, `STOCK_CLERK`). */
function roleWords(role: string): string {
  const word = role === "STOCK_CLERK" ? "stock clerk" : role.toLowerCase();
  return /^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`;
}

const WORDS: Record<string, (payload: Payload, eventType: string, seeCost: boolean) => ActivityWords> = {
  [RETAIL_AUDIT_EVENTS.recordEdited]: recordEditedWords,
  [RETAIL_AUDIT_EVENTS.movementsReversed]: movementsReversedWords,
  [RETAIL_AUDIT_EVENTS.stockAdjusted]: (payload, _type, seeCost) => stockAdjustedWords(payload, seeCost),
  [RETAIL_AUDIT_EVENTS.caseBroken]: caseBrokenWords,
  [RETAIL_AUDIT_EVENTS.recordBinned]: () => ({ what: "Moved to the bin", tone: "bad" }),
  [RETAIL_AUDIT_EVENTS.recordRestored]: () => ({ what: "Restored from the bin", tone: "ok" }),
  [RETAIL_AUDIT_EVENTS.recordPurged]: (payload) => ({
    what: payload.automatic ? "Deleted for good after 30 days in the bin" : "Deleted for good",
    tone: "bad",
  }),
  [RETAIL_AUDIT_EVENTS.settingsChanged]: settingsChangedWords,
  // "Added at US$2.10, 48 in stock at Harare Main Branch" (PRD-03).
  [RETAIL_AUDIT_EVENTS.productCreated]: (payload) => {
    const opening = amount(payload.openingStock);
    const stock = opening ? `, ${formatCount(opening)} in stock${text(payload.site) ? ` at ${text(payload.site)}` : ""}` : "";
    return { what: `Added at ${moneyWords(payload.price)}${stock}`, tone: "ok" };
  },
  // "Imported 196 products and updated 12 from price-list-oct.xlsx" (W-08).
  [RETAIL_AUDIT_EVENTS.productsImported]: (payload) => {
    const created = amount(payload.created) ?? 0;
    const updated = amount(payload.updated) ?? 0;
    const products = (n: number) => `${formatCount(n)} ${n === 1 ? "product" : "products"}`;
    const what =
      created > 0 && updated > 0
        ? `Imported ${products(created)} and updated ${formatCount(updated)}`
        : created > 0
          ? `Imported ${products(created)}`
          : `Updated ${products(updated)}`;
    const file = text(payload.file);
    return { what: file ? `${what} from ${file}` : what, tone: "ok" };
  },
  // "Changed the Retail price from US$17.50 to US$18.25"; "Put on the Wholesale list at US$16.90" (PRD-03).
  [RETAIL_AUDIT_EVENTS.priceChanged]: (payload) => {
    const list = text(payload.list) ?? "list";
    if (text(payload.from) === null) return { what: `Put on the ${list} list at ${moneyWords(payload.to)}`, tone: "info" };
    if (text(payload.to) === null) return { what: `Taken off the ${list} list`, tone: "info" };
    return { what: `Changed the ${list} price from ${moneyWords(payload.from)} to ${moneyWords(payload.to)}`, tone: "info" };
  },
  // "Set the ZiG rate to 27.10, from 26.80"; "Updates the ZiG rate by hand" (W-05).
  [RETAIL_AUDIT_EVENTS.zigRateSet]: (payload) => ({
    what:
      !text(payload.rate) && text(payload.source)
        ? payload.source === "RBZ_DAILY"
          ? "Takes the RBZ’s rate daily"
          : "Updates the ZiG rate by hand"
        : `Set the ZiG rate to ${text(payload.rate) ?? "a new rate"}${text(payload.previous) ? `, from ${text(payload.previous)}` : ""}`,
    tone: "info",
  }),
  // "Posted 412 sales, 6 deliveries, 1 count" (SET-09).
  [RETAIL_AUDIT_EVENTS.postingRun]: (payload) => ({
    what: text(payload.posted) ? `Posted ${text(payload.posted)}` : "Posted to the books, nothing waiting",
    tone: payload.failed ? "warn" : "info",
  }),
  // "Added the account 1012 Cash on hand, rand" (SET-09).
  [RETAIL_AUDIT_EVENTS.postingAccountAdded]: (payload) => ({
    what: `Added the account ${text(payload.label) ?? ""}`.trim(),
    tone: "ok",
  }),
  // "Connected the fiscal device 0441-2209 to ZIMRA" (SET-08).
  [RETAIL_AUDIT_EVENTS.fiscalConnected]: (payload) => ({
    what: `Connected the fiscal device${text(payload.deviceId) ? ` ${text(payload.deviceId)}` : ""} to ZIMRA`,
    tone: "ok",
  }),
  // "Closed fiscal day 214, US$1,284.50"; "… with the last shift" (SET-08).
  [RETAIL_AUDIT_EVENTS.fiscalDayClosed]: (payload) => ({
    what: `Closed fiscal day ${text(payload.dayNo) ?? ""}${text(payload.total) ? `, ${text(payload.total)}` : ""}${
      payload.how === "LAST_SHIFT" ? ", with the last shift" : ""
    }`,
    tone: "info",
  }),
  // People (ADM-02): "Invited Ruvimbo Chari as a bookkeeper", "Sent the invite again".
  [RETAIL_AUDIT_EVENTS.personInvited]: (payload) =>
    payload.again
      ? { what: "Sent the invite again", tone: "info" }
      : {
          what: `Invited ${text(payload.name) ?? "someone"}${text(payload.role) ? ` as ${roleWords(text(payload.role)!)}` : ""}`,
          tone: "info",
        },
  [RETAIL_AUDIT_EVENTS.personJoined]: (payload) => ({
    what: payload.how === "pin" ? "Joined with their till PIN" : payload.how === "sign-in" ? "Joined by signing in" : "Joined by their link",
    tone: "ok",
  }),
  // "Changed role from Manager to Cashier"; several fields: "Changed role, sites".
  [RETAIL_AUDIT_EVENTS.personChanged]: (payload) => {
    const changes = Array.isArray(payload.changes) ? (payload.changes as Payload[]) : [];
    if (changes.length === 1) {
      const [change] = changes;
      return {
        what: `Changed ${(text(change!.label) ?? "a detail").toLowerCase()} from ${text(change!.from) || "nothing"} to ${text(change!.to) || "nothing"}`,
        tone: "info",
      };
    }
    return { what: `Changed ${changes.map((change) => (text(change.label) ?? "").toLowerCase()).join(", ")}`, tone: "info" };
  },
  [RETAIL_AUDIT_EVENTS.personPinSent]: (payload) => ({
    what: payload.wasLocked ? "Sent a new PIN for a locked one" : "Sent a new PIN",
    tone: "info",
  }),
  [RETAIL_AUDIT_EVENTS.personAccessRemoved]: (payload) => {
    const shifts = Array.isArray(payload.closedShifts) ? payload.closedShifts.map(String) : [];
    return {
      what: shifts.length ? `Removed their access, closing ${shifts.join(", ")} without a count` : "Removed their access",
      tone: "bad",
    };
  },
  [RETAIL_AUDIT_EVENTS.personAccessRestored]: (payload) => ({
    what: payload.pin ? "Gave their access back, with a new PIN" : "Gave their access back",
    tone: "ok",
  }),
  // Till PINs (ADM-03): "Chose a PIN"; "PIN locked after 5 wrong tries at Back till".
  [RETAIL_AUDIT_EVENTS.pinChosen]: () => ({ what: "Chose a PIN", tone: "ok" }),
  [RETAIL_AUDIT_EVENTS.pinLocked]: (payload) => ({
    what: `PIN locked after 5 wrong tries${text(payload.registerName) ? ` at ${text(payload.registerName)}` : ""}`,
    tone: "warn",
  }),
  // Suppliers (40-buying 3.4): "Added Delta Beverages"; "Added Rumbi Chari, Accounts, who gets statements".
  [RETAIL_AUDIT_EVENTS.supplierCreated]: (payload) => ({ what: `Added ${text(payload.name) ?? "them"}`, tone: "ok" }),
  [RETAIL_AUDIT_EVENTS.supplierContactAdded]: (payload) => ({
    what: `Added ${[text(payload.name) ?? "a contact", text(payload.role)].filter(Boolean).join(", ")}, who gets ${SENDS_WORDS[text(payload.sends) ?? ""] ?? "orders"}`,
    tone: "info",
  }),
  [RETAIL_AUDIT_EVENTS.supplierContactRemoved]: (payload) => ({ what: `Removed ${text(payload.name) ?? "a contact"}`, tone: "hollow" }),
  [RETAIL_AUDIT_EVENTS.supplierStopped]: () => ({ what: "Stopped buying from them", tone: "bad" }),
  [RETAIL_AUDIT_EVENTS.supplierResumed]: () => ({ what: "Started buying from them again", tone: "ok" }),
  [RETAIL_AUDIT_EVENTS.suppliersMessaged]: () => ({ what: "Sent a message on WhatsApp", tone: "hollow" }),
  // Orders (40-buying 3.4): "Raised PO-0031 for US$643.08"; "Sent on WhatsApp to Tinashe Moyo".
  [RETAIL_AUDIT_EVENTS.orderCreated]: (payload) => ({
    what: `Raised ${text(payload.poNo) ?? "the order"}${amount(payload.value) !== null ? ` for ${moneyWords(payload.value)}` : ""}`,
    tone: "info",
  }),
  [RETAIL_AUDIT_EVENTS.orderSent]: orderSentWords,
  [RETAIL_AUDIT_EVENTS.orderChanged]: orderChangedWords,
  [RETAIL_AUDIT_EVENTS.orderDuplicated]: (payload) => ({ what: `Made from ${text(payload.from) ?? "another order"}`, tone: "hollow" }),
  // "Sent a reminder; promised for 7 October" (W-34).
  [RETAIL_AUDIT_EVENTS.orderChased]: (payload) => {
    const day = text(payload.promisedFor);
    return { what: day ? `Sent a reminder; promised for ${dayMonth(day)}` : "Sent a reminder", tone: "warn" };
  },
  // "Cancelled what was left, 480 units" ("…, automatically" when the worker did it).
  [RETAIL_AUDIT_EVENTS.orderRestCancelled]: (payload) => {
    const units = amount(payload.units) ?? 0;
    const automatic = payload.automatic === true ? ", automatically" : "";
    return { what: `Cancelled what was left, ${formatCount(units)} ${units === 1 ? "unit" : "units"}${automatic}`, tone: "bad" };
  },
  // Requisitions (40-buying 3.4): "Asked for US$1,940.00 for PO-0005"; "Approved US$1,500.00 of US$1,940.00".
  [RETAIL_AUDIT_EVENTS.requisitionAsked]: (payload) => {
    const figure = moneyWords(payload.amount, text(payload.currency) ?? "USD");
    const order = text(payload.order);
    return { what: order ? `Asked for ${figure} for ${order}` : `Asked for ${figure}${text(payload.whatFor) ? `: ${text(payload.whatFor)}` : ""}`, tone: "info" };
  },
  [RETAIL_AUDIT_EVENTS.requisitionApproved]: (payload) => {
    const currency = text(payload.currency) ?? "USD";
    const cut = amount(payload.amount) !== null && amount(payload.asked) !== null && amount(payload.amount) !== amount(payload.asked);
    return { what: `Approved ${moneyWords(payload.amount, currency)}${cut ? ` of ${moneyWords(payload.asked, currency)}` : ""}`, tone: "ok" };
  },
  [RETAIL_AUDIT_EVENTS.requisitionRejected]: (payload) => ({ what: `Rejected: ${text(payload.reason) ?? "no reason given"}`, tone: "bad" }),
  [RETAIL_AUDIT_EVENTS.requisitionQuestion]: (payload) => ({
    what: `${payload.answer === true ? "Answered" : "Asked"}: “${text(payload.message) ?? ""}”`,
    tone: "info",
  }),
  [RETAIL_AUDIT_EVENTS.requisitionCancelled]: (payload) => ({ what: payload.automatic === true ? "Cancelled with its order" : "Cancelled", tone: "hollow" }),
  [RETAIL_AUDIT_EVENTS.messageReceived]: (payload) => {
    const body = text(payload.body) ?? "";
    const short = body.length > 80 ? `${body.slice(0, 80).trimEnd()}…` : body;
    return { what: `${text(payload.supplier) ?? "The supplier"} replied: “${short}”`, tone: "info" };
  },
  [RETAIL_AUDIT_EVENTS.shiftOpened]: (payload) => ({
    what: `Opened with a float of ${moneyWords(payload.openingFloat)}`,
    tone: "info",
  }),
  [RETAIL_AUDIT_EVENTS.shiftClosed]: shiftClosedWords,
  [RETAIL_AUDIT_EVENTS.shiftSignedOff]: shiftSignedOffWords,
  [RETAIL_AUDIT_EVENTS.dayClosed]: dayClosedWords,
  // "Opened the drawer without a sale, approved by Tafara Nyathi" (SET-06).
  [RETAIL_AUDIT_EVENTS.drawerOpened]: (payload) => ({
    what: `Opened the drawer without a sale${text(payload.approvedByName) ? `, approved by ${text(payload.approvedByName)}` : ""}`,
    tone: "warn",
  }),
  [RETAIL_AUDIT_EVENTS.cashMoved]: cashMovedWords,
  [RETAIL_AUDIT_EVENTS.salePosted]: (payload, type) => saleWords(type, payload),
  [RETAIL_AUDIT_EVENTS.saleRefunded]: (payload, type) => saleWords(type, payload),
  [RETAIL_AUDIT_EVENTS.saleVoided]: (payload, type) => saleWords(type, payload),
  // FLR-01: "Printed a copy of the receipt", "Sent the receipt on WhatsApp to ••• 3388", "Looked at: <reason>".
  [RETAIL_AUDIT_EVENTS.saleReprinted]: () => ({ what: "Printed a copy of the receipt", tone: "hollow" }),
  [RETAIL_AUDIT_EVENTS.saleSent]: (payload) => ({
    what: `Sent the receipt on WhatsApp${text(payload.to) ? ` to ${text(payload.to)}` : ""}`,
    tone: "hollow",
  }),
  // PRD-06: "Printed 1 shelf strip on the front till printer", "Printed 2 price tags here".
  [RETAIL_AUDIT_EVENTS.labelsPrinted]: (payload) => ({ what: labelsPrintedSentence(payload), tone: "hollow" }),
  // "Booked 240 bottles and 20 crates back to Delta Beverages, US$84.00 owed" (STK-09).
  [RETAIL_AUDIT_EVENTS.emptiesReturned]: (payload) => {
    const bottles = amount(payload.bottles) ?? 0;
    const crates = amount(payload.crates) ?? 0;
    const items = [
      bottles ? `${bottles} ${bottles === 1 ? "bottle" : "bottles"}` : null,
      crates ? `${crates} ${crates === 1 ? "crate" : "crates"}` : null,
    ].filter(Boolean);
    const supplier = text(payload.supplier);
    return {
      what: `Booked ${items.join(" and ") || "empties"} back${supplier ? ` to ${supplier}` : ""}, ${formatMoney(amount(payload.deposit) ?? 0)} owed`,
      tone: "info",
    };
  },
  // "Delta Beverages credited US$84.00 (CN-2210)" (STK-09).
  [RETAIL_AUDIT_EVENTS.emptiesCredited]: (payload) => {
    const note = text(payload.creditNote);
    return {
      what: `${text(payload.supplier) ?? "The supplier"} credited ${formatMoney(amount(payload.amount) ?? 0)}${note ? ` (${note})` : ""}`,
      tone: "ok",
    };
  },
  // "42 points expired, a year old" / "Birthday bonus, 200 points" (CUS-01).
  [RETAIL_AUDIT_EVENTS.pointsExpired]: (payload) => ({
    what: `${formatCount(amount(payload.points) ?? 0)} points expired, a year old`,
    tone: "hollow",
  }),
  [RETAIL_AUDIT_EVENTS.pointsBirthday]: (payload) => ({
    what: `Birthday bonus, ${formatCount(amount(payload.points) ?? 0)} points`,
    tone: "warn",
  }),
  // "Added 200 points: Make good a complaint" / "Took away 100 points: Correction" (CUS-04).
  [RETAIL_AUDIT_EVENTS.pointsAdjusted]: (payload) => {
    const points = pointsWords(amount(payload.points) ?? 0);
    const why = adjustReasonLabel(text(payload.reason));
    return { what: `${payload.direction === "TAKE" ? "Took away" : "Added"} ${points}${why ? `: ${why}` : ""}`, tone: "warn" };
  },
  // "Added, agreed to messages" / "Added at the till" (CUS-02).
  [RETAIL_AUDIT_EVENTS.customerCreated]: (payload) => ({
    what: payload.via === "till" ? "Added at the till" : payload.consent === true ? "Added, agreed to messages" : "Added",
    tone: "ok",
  }),
  // CUS-06: "Sent an offer to 8 customers", "Scheduled an offer to 8 customers for Friday 16:00".
  [RETAIL_AUDIT_EVENTS.messagesQueued]: (payload) => {
    const count = amount(payload.count) ?? 0;
    const what = `${payload.purpose === "OFFER" ? "an offer" : "a reminder"} to ${formatCount(count)} ${count === 1 ? "customer" : "customers"}`;
    const at = text(payload.scheduledFor);
    return { what: at ? `Scheduled ${what} for ${weekdayTime(new Date(at))}` : `Sent ${what}`, tone: "hollow" };
  },
  // FLR-06: "Started with a deposit of US$20.00", "Took US$13.00 by EcoCash, US$13.00 left",
  // "Handed over as SALE-31871", "Cancelled, US$18.00 paid back".
  [RETAIL_AUDIT_EVENTS.laybyStarted]: (payload) => ({ what: `Started with a deposit of ${moneyWords(payload.deposit)}`, tone: "info" }),
  [RETAIL_AUDIT_EVENTS.laybyPaid]: (payload) => ({
    what: `Took ${moneyWords(payload.amount)} by ${tenderLabel(text(payload.tender))}, ${moneyWords(payload.left)} left`,
    tone: "ok",
  }),
  [RETAIL_AUDIT_EVENTS.laybyHandedOver]: (payload) => ({ what: `Handed over as ${text(payload.saleNo) ?? "a sale"}`, tone: "ok" }),
  [RETAIL_AUDIT_EVENTS.laybyCancelled]: (payload) => ({ what: `Cancelled, ${moneyWords(payload.paidBack)} paid back`, tone: "bad" }),
  // CUS-06: "Replied STOP on WhatsApp" / "Stopped marketing messages" / "Agreed to messages".
  [RETAIL_AUDIT_EVENTS.customerConsent]: (payload) => ({
    what: payload.via === "STOP reply" ? "Replied STOP on WhatsApp" : payload.agreed === true ? "Agreed to messages" : "Stopped marketing messages",
    tone: "hollow",
  }),
  // CUS-03: "Held at Gold until 3 October 2027" / "Back to Silver, by spend" / "Added a note".
  [RETAIL_AUDIT_EVENTS.customerTierSet]: (payload) => {
    const tier = text(payload.tier) ?? "a tier";
    const until = text(payload.until);
    return { what: until ? `Held at ${tier} until ${formatDay(until)}` : `Back to ${tier}, by spend`, tone: "info" };
  },
  [RETAIL_AUDIT_EVENTS.customerNoteAdded]: () => ({ what: "Added a note", tone: "hollow" }),
  // CUS-05: "Merged in T. Marange, +263 77 412 3380: 412 points, 9 visits" on the survivor;
  // "Took T. Marange back out: 412 points, 9 visits" there, "Taken back out of Tapiwa Marange: …" on the duplicate.
  [RETAIL_AUDIT_EVENTS.customerMerged]: (payload) => {
    const duplicate = (payload.duplicate ?? {}) as Payload;
    return { what: `Merged in ${nameAndPhone({ name: text(duplicate.name) ?? "a customer", phone: text(duplicate.phone) })}: ${pointsAndVisits(amount(payload.points) ?? 0, amount(payload.visits) ?? 0)}`, tone: "info" };
  },
  [RETAIL_AUDIT_EVENTS.customerUnmerged]: (payload) => {
    const other = text(((payload.other ?? {}) as Payload).name) ?? "a customer";
    const figures = pointsAndVisits(amount(payload.points) ?? 0, amount(payload.visits) ?? 0);
    return { what: payload.role === "duplicate" ? `Taken back out of ${other}: ${figures}` : `Took ${other} back out: ${figures}`, tone: "warn" };
  },
  [RETAIL_AUDIT_EVENTS.saleReviewed]: (payload) => ({
    what: text(payload.reason) ? `Looked at: ${text(payload.reason)}` : "Looked at",
    tone: "ok",
  }),
  [RETAIL_AUDIT_EVENTS.goodsReceived]: goodsReceivedWords,
  [RETAIL_AUDIT_EVENTS.orderClosed]: orderClosedWords,
  [RETAIL_AUDIT_EVENTS.orderReopened]: () => ({ what: "Reopened", tone: "hollow" }),
  [RETAIL_AUDIT_EVENTS.shopProfileChanged]: shopProfileWords,
  [RETAIL_AUDIT_EVENTS.productArchived]: () => ({ what: "Stopped selling it", tone: "hollow" }),
  [RETAIL_AUDIT_EVENTS.productUnarchived]: () => ({ what: "Put it on sale again", tone: "ok" }),
  [RETAIL_AUDIT_EVENTS.categoryCreated]: () => ({ what: "Added it", tone: "ok" }),
  [RETAIL_AUDIT_EVENTS.categoryChanged]: categoryChangedWords,
  [RETAIL_AUDIT_EVENTS.categoryDeleted]: categoryDeletedWords,
  [RETAIL_AUDIT_EVENTS.siteCreated]: () => ({ what: "Added it", tone: "ok" }),
  [RETAIL_AUDIT_EVENTS.siteChanged]: siteChangedWords,
  [RETAIL_AUDIT_EVENTS.siteClosed]: () => ({ what: "Closed it", tone: "bad" }),
  [RETAIL_AUDIT_EVENTS.priceListCreated]: (payload) => ({
    what: text(payload.from) ? `Added it, a copy of ${text(payload.from)}` : "Added it",
    tone: "ok",
  }),
  // "Changed Who gets it and Where" (PRD-05): the labels the rules sheet saved.
  [RETAIL_AUDIT_EVENTS.priceListChanged]: (payload) => {
    const labels = Array.isArray(payload.changes)
      ? payload.changes.map((change) => text((change as Record<string, unknown>)?.label)).filter((label): label is string => Boolean(label))
      : [];
    return { what: labels.length ? `Changed ${joinAnd(labels)}` : "Changed it", tone: "info" };
  },
  [RETAIL_AUDIT_EVENTS.priceListPaused]: () => ({ what: "Paused it", tone: "hollow" }),
  [RETAIL_AUDIT_EVENTS.priceListResumed]: () => ({ what: "Switched it on", tone: "ok" }),
  // PRD-07: "Scheduled 4 prices for 3 Oct 22:00", "Undid 4 prices for 3 Oct 22:00", "Added 3 products", "Removed 2 products".
  [RETAIL_AUDIT_EVENTS.priceScheduled]: (payload) => {
    const count = amount(payload.count) ?? 0;
    const at = text(payload.effectiveAt);
    return { what: at ? scheduledActivity(count, new Date(at)) : `Scheduled ${priceWords(count)}`, tone: "info" };
  },
  [RETAIL_AUDIT_EVENTS.priceScheduleCancelled]: (payload) => {
    const count = amount(payload.count) ?? 0;
    const at = text(payload.effectiveAt);
    return { what: at ? undoneActivity(count, new Date(at)) : `Undid ${priceWords(count)}`, tone: "hollow" };
  },
  [RETAIL_AUDIT_EVENTS.priceListProductsAdded]: (payload) => ({ what: `Added ${productWords(amount(payload.count) ?? 0)}`, tone: "ok" }),
  [RETAIL_AUDIT_EVENTS.priceListProductsRemoved]: (payload) => ({
    what: `Removed ${productWords(amount(payload.count) ?? 0)}`,
    tone: "hollow",
  }),
  // PRD-08: "Made it at US$9.50", "Changed Price and On sale", "Paused it", "Put it on sale again", "Stopped selling it".
  [RETAIL_AUDIT_EVENTS.bundleCreated]: (payload) => ({
    what: amount(payload.price) === null ? "Made it" : `Made it at ${moneyWords(payload.price)}`,
    tone: "ok",
  }),
  [RETAIL_AUDIT_EVENTS.bundleChanged]: (payload) => {
    const labels = Array.isArray(payload.changes)
      ? payload.changes.map((change) => text((change as Record<string, unknown>)?.label)).filter((label): label is string => Boolean(label))
      : [];
    return { what: labels.length ? `Changed ${joinAnd(labels)}` : "Changed it", tone: "info" };
  },
  [RETAIL_AUDIT_EVENTS.bundlePaused]: () => ({ what: "Paused it", tone: "hollow" }),
  [RETAIL_AUDIT_EVENTS.bundleResumed]: () => ({ what: "Put it on sale again", tone: "ok" }),
  [RETAIL_AUDIT_EVENTS.bundleStopped]: () => ({ what: "Stopped selling it", tone: "bad" }),
  // PRD-09: "Scheduled it from 25 Oct 00:00" (or "Started it" when it ran at once), "Changed Value and Ends", "Paused it", "Resumed it", "Ended it".
  [RETAIL_AUDIT_EVENTS.promotionCreated]: (payload) => ({
    what: text(payload.from) ? `Scheduled it from ${text(payload.from)}` : "Started it",
    tone: "ok",
  }),
  [RETAIL_AUDIT_EVENTS.promotionChanged]: (payload) => {
    const labels = Array.isArray(payload.changes)
      ? payload.changes.map((change) => text((change as Record<string, unknown>)?.label)).filter((label): label is string => Boolean(label))
      : [];
    return { what: labels.length ? `Changed ${joinAnd(labels)}` : "Changed it", tone: "info" };
  },
  [RETAIL_AUDIT_EVENTS.promotionPaused]: () => ({ what: "Paused it", tone: "hollow" }),
  [RETAIL_AUDIT_EVENTS.promotionResumed]: () => ({ what: "Resumed it", tone: "ok" }),
  [RETAIL_AUDIT_EVENTS.promotionEnded]: () => ({ what: "Ended it", tone: "hollow" }),
  // Vouchers (20-products 3.4): "Issued for US$50.00", "Changed Expires from 28 Sep 2027 to 28 Mar 2028",
  // "Sent on WhatsApp", "US$8.40 spent on SALE-29811, US$11.60 left", "Voided: <reason>", "Expired with US$4.20 left".
  [RETAIL_AUDIT_EVENTS.voucherIssued]: (payload) => {
    const value = amount(payload.value);
    return { what: `Issued for ${value === null ? (text(payload.value) ?? "nothing") : formatMoney(value)}`, tone: "ok" };
  },
  [RETAIL_AUDIT_EVENTS.voucherChanged]: (payload) => {
    const changes = Array.isArray(payload.changes) ? (payload.changes as Payload[]) : [];
    const said = changes
      .map((change) => {
        const label = text(change?.label);
        if (!label) return null;
        const from = text(change.from);
        const to = text(change.to);
        if (from && to) return `${label} from ${from} to ${to}`;
        if (to) return `${label} to ${to}`;
        return `${label}`;
      })
      .filter((words): words is string => Boolean(words));
    return { what: said.length ? `Changed ${joinAnd(said)}` : "Changed it", tone: "info" };
  },
  [RETAIL_AUDIT_EVENTS.voucherSent]: (payload) => ({ what: `Sent on ${text(payload.via) ?? "WhatsApp"}`, tone: "hollow" }),
  [RETAIL_AUDIT_EVENTS.voucherRedeemed]: (payload) => {
    const sale = text(payload.saleNo) ?? "a sale";
    const usesLeft = amount(payload.usesLeft);
    if (usesLeft !== null) {
      return { what: `${moneyWords(payload.amount)} off ${sale}, ${formatCount(usesLeft)} left`, tone: "ok" };
    }
    return { what: `${moneyWords(payload.amount)} spent on ${sale}, ${moneyWords(payload.left)} left`, tone: "ok" };
  },
  // "US$10.00 back from VOID-0012, US$15.00 left" / "A use back from VOID-0012, 3 left".
  [RETAIL_AUDIT_EVENTS.voucherRestored]: (payload) => {
    const sale = text(payload.saleNo) ?? "a reversed sale";
    const usesLeft = amount(payload.usesLeft);
    if (usesLeft !== null) return { what: `A use back from ${sale}, ${formatCount(usesLeft)} left`, tone: "info" };
    return { what: `${moneyWords(payload.amount)} back from ${sale}, ${moneyWords(payload.left)} left`, tone: "info" };
  },
  [RETAIL_AUDIT_EVENTS.voucherVoided]: (payload) => ({ what: `Voided: ${text(payload.reason) ?? "no reason given"}`, tone: "bad" }),
  [RETAIL_AUDIT_EVENTS.voucherExpired]: (payload) => {
    const left = amount(payload.left);
    return { what: left !== null && left > 0 ? `Expired with ${formatMoney(left)} left` : "Expired", tone: "hollow" };
  },
  // "Sent 540 units to Borrowdale" / "Cancelled: 540 units back at Harare Main Branch" (30-stock 3.3).
  [RETAIL_AUDIT_EVENTS.transferSent]: (payload) => ({
    what: `Sent ${unitWords(amount(payload.units) ?? 0)}${text(payload.to) ? ` to ${text(payload.to)}` : ""}`,
    tone: "info",
  }),
  // "Started the count: 38 products, sent to Rudo Moyo" (30-stock 3.3).
  [RETAIL_AUDIT_EVENTS.countStarted]: (payload) => {
    const lines = amount(payload.lines) ?? 0;
    const counter = text(payload.counter);
    return {
      what: `Started the count: ${lines} ${lines === 1 ? "product" : "products"}${counter ? `, sent to ${counter}` : ""}`,
      tone: "info",
    };
  },
  // "Counted 38 lines and sent them for review" (30-stock 3.3).
  [RETAIL_AUDIT_EVENTS.countSubmitted]: (payload) => {
    const lines = amount(payload.lines) ?? 0;
    return { what: `Counted ${lines} ${lines === 1 ? "line and sent it" : "lines and sent them"} for review`, tone: "info" };
  },
  // "Changed Gordon’s Gin 750ml from 19 to 20": an approver's correction (STK-06).
  [RETAIL_AUDIT_EVENTS.countLineChanged]: (payload) => {
    const from = amount(payload.from);
    const to = amount(payload.to);
    const product = text(payload.product) ?? "a line";
    return {
      what: from === null ? `Changed ${product} to ${countWords(to ?? 0)}` : `Changed ${product} from ${countWords(from)} to ${countWords(to ?? 0)}`,
      tone: "info",
    };
  },
  // "Asked for 3 lines to be counted again" (STK-06).
  [RETAIL_AUDIT_EVENTS.countRecountAsked]: (payload) => {
    const lines = amount(payload.lines) ?? 0;
    return { what: `Asked for ${formatCount(lines)} ${lines === 1 ? "line" : "lines"} to be counted again`, tone: "warn" };
  },
  // "Approved: stock set to what was counted, −US$41.20 to Breakage and losses" (STK-06).
  [RETAIL_AUDIT_EVENTS.countApproved]: (payload) => {
    const net = amount(payload.net) ?? 0;
    return {
      what: `Approved: stock set to what was counted${net === 0 ? "" : `, ${formatSigned(net)} to Breakage and losses`}`,
      tone: "ok",
    };
  },
  [RETAIL_AUDIT_EVENTS.countCancelled]: () => ({ what: "Cancelled the count", tone: "bad" }),
  // "Changed the lines: 560 units on the way" (30-stock 3.3).
  [RETAIL_AUDIT_EVENTS.transferChanged]: (payload) => ({
    what: `Changed the lines: ${unitWords(amount(payload.units) ?? 0)} on the way`,
    tone: "info",
  }),
  // "Received at Borrowdale: 538 units, 2 lost on the way" (`warn` when lost); still coming says so.
  [RETAIL_AUDIT_EVENTS.transferReceived]: (payload) => {
    const lost = amount(payload.lost) ?? 0;
    const coming = amount(payload.stillComing) ?? 0;
    const at = text(payload.to) ? ` at ${text(payload.to)}` : "";
    const rest = lost > 0 ? `, ${formatCount(lost)} lost on the way` : coming > 0 ? `, ${formatCount(coming)} still to come` : "";
    return { what: `Received${at}: ${unitWords(amount(payload.received) ?? 0)}${rest}`, tone: lost > 0 ? "warn" : "ok" };
  },
  [RETAIL_AUDIT_EVENTS.transferCancelled]: (payload) => {
    const returned = amount(payload.returned) ?? 0;
    return {
      what: returned > 0 && text(payload.from) ? `Cancelled: ${unitWords(returned)} back at ${text(payload.from)}` : "Cancelled",
      tone: "bad",
    };
  },
};

function unitWords(units: number): string {
  return `${formatCount(units)} ${units === 1 ? "unit" : "units"}`;
}

/** "RETAIL_EXPORT.DOWNLOADED" → "Downloaded"; "STOCK.COUNT_POSTED" → "Count posted". */
export function fallbackWords(eventType: string): string {
  const last = eventType.split(".").pop() ?? eventType;
  const spaced = last.replace(/_/g, " ").toLowerCase().trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : eventType;
}

/** The sentence and tone for one event. */
/** `seeCost`: the reader may see what the shop paid; without it, money at cost is left out. */
export function activityWords(eventType: string, payload: Payload | null, { seeCost = true }: { seeCost?: boolean } = {}): ActivityWords {
  const words = WORDS[eventType];
  if (words) return words(payload ?? {}, eventType, seeCost);
  return { what: fallbackWords(eventType), tone: "hollow" };
}
