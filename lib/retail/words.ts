/**
 * The words retail says things in — one per thing, used by the back office and
 * the till alike.
 *
 * Every screen used to render the stored enum: `MOBILE_MONEY` in one place,
 * "Mobile" in another, "EcoCash / OneMoney" in a third — six spellings of one
 * tender — and `DROP_TO_SAFE` straight onto a shift's page. A value a person
 * reads goes through here, so the same value reads the same everywhere. The
 * names follow `docs/retail/retail-management-alignment-2026-09-29.md` §3.
 */

const TENDER: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  MOBILE_MONEY: "Mobile money",
  TRANSFER: "Bank transfer",
  VOUCHER: "Voucher",
};

const SALE_TYPE: Record<string, string> = {
  SALE: "Sale",
  REFUND: "Refund",
  VOID: "Void",
};

const SALE_STATUS: Record<string, string> = {
  POSTED: "Posted",
  VOIDED: "Voided",
};

const SHIFT_STATUS: Record<string, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
};

/** Direction is in the words, as it is in the enum: the trade uses "pickup" both ways. */
const CASH_MOVEMENT: Record<string, string> = {
  DROP_TO_SAFE: "To the safe",
  FLOAT_TOP_UP: "In from the safe",
  PAYOUT: "Paid out",
};

const ORDER_STATUS: Record<string, string> = {
  DRAFT: "Draft",
  PARTIAL: "Part delivered",
  CLOSED: "Closed short",
  RECEIVED: "Delivered",
};

const PROMOTION_TYPE: Record<string, string> = {
  PERCENT: "Percent off",
  AMOUNT: "Amount off",
  BUY_X_GET_Y: "Buy X get Y",
  BUNDLE: "Bundle",
};

const PROMOTION_STATUS: Record<string, string> = {
  ACTIVE: "Running",
  SCHEDULED: "Scheduled",
  INACTIVE: "Stopped",
};

const FISCAL_STATUS: Record<string, string> = {
  SUCCESS: "Fiscalised",
  PENDING: "Waiting for ZIMRA",
  FAILED: "Not fiscalised",
  VOIDED: "Cancelled",
  SKIPPED: "Not fiscalised",
};

/** An unknown value still reads as words rather than as a constant. */
function sentence(value: string): string {
  const words = value.toLowerCase().replaceAll("_", " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
}

function lookup(table: Record<string, string>, value: string | null | undefined): string {
  if (!value) return "";
  return table[value] ?? sentence(value);
}

export const tenderLabel = (value: string | null | undefined) => lookup(TENDER, value);
export const saleTypeLabel = (value: string | null | undefined) => lookup(SALE_TYPE, value);
export const saleStatusLabel = (value: string | null | undefined) => lookup(SALE_STATUS, value);
export const shiftStatusLabel = (value: string | null | undefined) => lookup(SHIFT_STATUS, value);
export const cashMovementLabel = (value: string | null | undefined) => lookup(CASH_MOVEMENT, value);
export const orderStatusLabel = (value: string | null | undefined) => lookup(ORDER_STATUS, value);
export const promotionTypeLabel = (value: string | null | undefined) => lookup(PROMOTION_TYPE, value);
export const promotionStatusLabel = (value: string | null | undefined) =>
  lookup(PROMOTION_STATUS, value);
export const fiscalStatusLabel = (value: string | null | undefined) => lookup(FISCAL_STATUS, value);
/** Any other stored constant — a category, a loyalty tier. */
export const enumLabel = (value: string | null | undefined) => (value ? sentence(value) : "");

/**
 * A product is on sale or off it. On sale is the ordinary case and draws
 * nothing (contract rule 5); only "Off sale" is ever written down.
 */
export function productStatusLabel(status: string | null | undefined): string | null {
  return status === "ACTIVE" ? null : "Off sale";
}

/*
  Dates, one way: day first, the month short — "29 Sept 2026" — in the shop's
  own time. A fixed zone rather than the browser's, so the server's first paint
  and the client's agree (TIME-1) and a sale rung at 14:05 in Harare reads
  14:05 wherever the manager opens it.
*/
const ZONE = "Africa/Harare";

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: ZONE,
});

const DAY_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: ZONE,
});

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: ZONE,
});

function asDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "29 Sept 2026" */
export function formatRetailDate(value: string | Date | null | undefined): string {
  const date = value ? asDate(value) : null;
  return date ? DAY.format(date) : "";
}

/** "29 Sept 2026, 14:05" */
export function formatRetailDateTime(value: string | Date | null | undefined): string {
  const date = value ? asDate(value) : null;
  return date ? DAY_TIME.format(date) : "";
}

/** "14:05" */
export function formatRetailTime(value: string | Date | null | undefined): string {
  const date = value ? asDate(value) : null;
  return date ? TIME.format(date) : "";
}

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * "$1,234.50", and "−$82.81" with a true minus. A variance or a refund is
 * signed; a hyphen there reads as a dash in a column of figures.
 */
export function formatSignedMoney(value: number): string {
  const text = MONEY.format(Math.abs(value));
  return value < 0 ? `−${text}` : text;
}

/**
 * "36 bottles", "1 case", "2.5 kg". A quantity is written with its unit, and
 * the trailing zeros a `Decimal(12,4)` carries are not.
 */
export function formatQuantity(value: number, unit?: string | null): string {
  const amount = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  const name = (unit ?? "").trim();
  if (!name) return amount;
  const countable = /^[a-z]+$/i.test(name) && name.length > 2 && !/s$/i.test(name) && name.toLowerCase() !== "each";
  if (!countable || Math.abs(value) === 1) return `${amount} ${name}`;
  return `${amount} ${/(x|ch|sh)$/i.test(name) ? `${name}es` : `${name}s`}`;
}
