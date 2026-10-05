import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import { formatCount, formatMoney, formatPercent } from "@/lib/workspace/format";

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

function shiftClosedWords(payload: Payload): ActivityWords {
  const variance = amount(payload.variance);
  if (variance === null || amount(payload.countedCash) === null) {
    return { what: "Closed without a count", tone: "warn" };
  }
  if (variance < 0) return { what: `Counted and closed, short by ${formatMoney(-variance)}`, tone: "bad" };
  if (variance > 0) return { what: `Counted and closed, over by ${formatMoney(variance)}`, tone: "warn" };
  return { what: "Counted and closed, balanced", tone: "ok" };
}

function cashMovedWords(payload: Payload): ActivityWords {
  const figure = moneyWords(payload.amount, currencyOf(payload));
  switch (payload.type) {
    case "DROP_TO_SAFE":
      return { what: `Dropped ${figure} to the safe`, tone: "hollow" };
    case "FLOAT_TOP_UP":
      return { what: `Put ${figure} in`, tone: "hollow" };
    default:
      return { what: `Paid out ${figure}`, tone: "hollow" };
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

/** The table. Keyed by event type; area specs add theirs here. */
const WORDS: Record<string, (payload: Payload, eventType: string) => ActivityWords> = {
  [RETAIL_AUDIT_EVENTS.recordEdited]: recordEditedWords,
  [RETAIL_AUDIT_EVENTS.recordBinned]: () => ({ what: "Moved to the bin", tone: "bad" }),
  [RETAIL_AUDIT_EVENTS.recordRestored]: () => ({ what: "Restored from the bin", tone: "ok" }),
  [RETAIL_AUDIT_EVENTS.settingsChanged]: settingsChangedWords,
  [RETAIL_AUDIT_EVENTS.shiftOpened]: (payload) => ({
    what: `Opened with a float of ${moneyWords(payload.openingFloat)}`,
    tone: "info",
  }),
  [RETAIL_AUDIT_EVENTS.shiftClosed]: shiftClosedWords,
  [RETAIL_AUDIT_EVENTS.cashMoved]: cashMovedWords,
  [RETAIL_AUDIT_EVENTS.salePosted]: (payload, type) => saleWords(type, payload),
  [RETAIL_AUDIT_EVENTS.saleRefunded]: (payload, type) => saleWords(type, payload),
  [RETAIL_AUDIT_EVENTS.saleVoided]: (payload, type) => saleWords(type, payload),
  [RETAIL_AUDIT_EVENTS.goodsReceived]: goodsReceivedWords,
  [RETAIL_AUDIT_EVENTS.orderClosed]: orderClosedWords,
  [RETAIL_AUDIT_EVENTS.orderReopened]: () => ({ what: "Reopened", tone: "hollow" }),
  [RETAIL_AUDIT_EVENTS.shopProfileChanged]: shopProfileWords,
};

/** "RETAIL_EXPORT.DOWNLOADED" → "Downloaded"; "STOCK.COUNT_POSTED" → "Count posted". */
export function fallbackWords(eventType: string): string {
  const last = eventType.split(".").pop() ?? eventType;
  const spaced = last.replace(/_/g, " ").toLowerCase().trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : eventType;
}

/** The sentence and tone for one event. */
export function activityWords(eventType: string, payload: Payload | null): ActivityWords {
  const words = WORDS[eventType];
  if (words) return words(payload ?? {}, eventType);
  return { what: fallbackWords(eventType), tone: "hollow" };
}
