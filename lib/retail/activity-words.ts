import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import { formatCount, formatMoney, formatPercent, formatSigned } from "@/lib/workspace/format";

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

const amount = (value: unknown): number | null => {
  const raw = text(value);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

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
