import { dayKey, formatMoney, formatShortDay, formatTime } from "@/lib/workspace/format";

/**
 * Setup › Fiscal device in words (SET-08, 10-setup 4.8 and 5.9). Pure and
 * browser-safe: the server builds the page's values with these, and the
 * tests read them.
 */

export const DAY_CLOSE_WORDS = { WITH_LAST_SHIFT: "With the last shift", BY_HAND: "By hand" } as const;
export const UNREACHABLE_WORDS = { KEEP_SELLING: "Keep selling, sign later", STOP_SELLING: "Stop selling" } as const;

export type DayClose = keyof typeof DAY_CLOSE_WORDS;
export type WhenUnreachable = keyof typeof UNREACHABLE_WORDS;

export function dayCloseOf(words: string): DayClose | null {
  return (Object.keys(DAY_CLOSE_WORDS) as DayClose[]).find((key) => DAY_CLOSE_WORDS[key] === words) ?? null;
}

export function whenUnreachableOf(words: string): WhenUnreachable | null {
  return (Object.keys(UNREACHABLE_WORDS) as WhenUnreachable[]).find((key) => UNREACHABLE_WORDS[key] === words) ?? null;
}

/** How often a shop that stops selling asks FDMS again, from a sale, while its last call went unanswered. */
export const FISCAL_OFFLINE_WINDOW_MS = 5 * 60 * 1000;

export type ConnectionState = "CONNECTED" | "NOT_CONNECTED" | "UNREACHABLE";

/**
 * The "Connection" line: connected with the open day and when it opened,
 * connected with no day open, not connected yet, or unreachable since the
 * last failed call.
 */
export function connectionWords(input: {
  registered: boolean;
  unreachableSince: Date | null;
  activeDay: { no: number; openedAt: Date; status: string } | null;
  now?: Date;
}): { state: ConnectionState; text: string } {
  if (!input.registered) return { state: "NOT_CONNECTED", text: "Not connected yet." };
  const day = input.activeDay;
  if (day?.status === "CLOSING") {
    // Its report is on its way to ZIMRA, or was not taken: no day is open until it is taken, or the day is given back.
    return {
      state: input.unreachableSince ? "UNREACHABLE" : "CONNECTED",
      text: `Day ${day.no}'s report waits for ZIMRA. Sales wait to be signed until a day is open again.`,
    };
  }
  if (input.unreachableSince) {
    return {
      state: "UNREACHABLE",
      text: `ZIMRA has not answered since ${formatTime(input.unreachableSince)}. Receipts are signed and wait.`,
    };
  }
  if (day) {
    const since =
      dayKey(day.openedAt) === dayKey(input.now ?? new Date())
        ? formatTime(day.openedAt)
        : `${formatShortDay(day.openedAt)} ${formatTime(day.openedAt)}`;
    return { state: "CONNECTED", text: `Connected to ZIMRA. Day ${day.no} open since ${since}.` };
  }
  return { state: "CONNECTED", text: "Connected to ZIMRA. No fiscal day open." };
}

/** "Today, open", "2 Oct, open", "2 Oct, closing", "2 Oct, closed 22:04", "5 Oct, closed 6 Oct 07:11". */
export function fiscalDayLabel(
  day: { status: string; openedAt: Date; closedAt: Date | null },
  now: Date,
): string {
  if (day.status === "CLOSED" && day.closedAt) {
    const closed =
      dayKey(day.closedAt) === dayKey(day.openedAt)
        ? formatTime(day.closedAt)
        : `${formatShortDay(day.closedAt)} ${formatTime(day.closedAt)}`;
    return `${formatShortDay(day.openedAt)}, closed ${closed}`;
  }
  const when = dayKey(day.openedAt) === dayKey(now) ? "Today" : formatShortDay(day.openedAt);
  return day.status === "CLOSING" ? `${when}, closing` : `${when}, open`;
}

/* ── What a till sale is told about its receipt ───────────────────────────── */

/** Signed and kept for the fiscal worker while ZIMRA is silent ("Keep selling, sign later"). */
export function heldReceiptWords(silentSince: Date): string {
  return `ZIMRA has not answered since ${formatTime(silentSince)}. The receipt is signed and waits to be sent.`;
}

/**
 * Rung while a day's report is on its way to ZIMRA: no day is open, so the
 * sale waits. It is signed into the next day once the report is taken, or
 * into the same day when the close stops before its report goes out and the
 * day is given back.
 */
export function saleWhileClosingWords(dayNo: number): string {
  return `Day ${dayNo}'s report waits for ZIMRA. This sale is signed as soon as a day is open again.`;
}

/** Sent in again after its commit found it no day: it was not signed then, and is not now. */
export function saleNotSignedWords(saleNo: string): string {
  return `${saleNo} was not signed when it was rung, so it is not signed now.`;
}

/** Cents by currency → "US$3,912.20", "US$40.00 · ZiG 1,200.00"; nothing sold → "US$0.00". */
export function fiscalDayTotal(centsByCurrency: Map<string, bigint>): string {
  const parts = [...centsByCurrency.entries()]
    .filter(([, cents]) => cents !== BigInt(0))
    .sort(([a], [b]) => (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b)))
    .map(([currency, cents]) => formatMoney(Number(cents) / 100, currency));
  return parts.length > 0 ? parts.join(" · ") : formatMoney(0, "USD");
}

const SALES_COUNTERS = new Set(["SALEBYTAX", "CREDITNOTEBYTAX", "DEBITNOTEBYTAX"]);

/**
 * What a closed day's Z-report says was sold, by currency: its sales,
 * credit-note and debit-note counters (tax included; credit notes are held
 * negative). Null when the report carries none to read.
 */
export function zReportTotals(countersJson: string | null): Map<string, bigint> | null {
  if (!countersJson) return null;
  let counters: unknown;
  try {
    counters = (JSON.parse(countersJson) as { counters?: unknown }).counters;
  } catch {
    return null;
  }
  if (!Array.isArray(counters)) return null;
  const totals = new Map<string, bigint>();
  let read = false;
  for (const counter of counters as Array<Record<string, unknown>>) {
    const type = String(counter.fiscalCounterType ?? "").toUpperCase();
    if (!SALES_COUNTERS.has(type)) continue;
    const currency = String(counter.fiscalCounterCurrency ?? "USD").toUpperCase();
    let value: bigint;
    try {
      value = BigInt(String(counter.fiscalCounterValueCents ?? "0"));
    } catch {
      continue;
    }
    totals.set(currency, (totals.get(currency) ?? BigInt(0)) + value);
    read = true;
  }
  return read ? totals : null;
}

/* ── The device's numbers, as typed ──────────────────────────────────────── */

/** Digits, grouped with dashes if the shop likes ("0441-2209"). */
export function deviceIdProblem(value: string): string | null {
  if (!value) return null;
  if (value.length > 24 || !/^\d+(?:[ -]\d+)*$/.test(value)) {
    return "Type the device ID as ZIMRA gave it: digits, grouped with a dash if you like.";
  }
  return null;
}

export function serialNumberProblem(value: string): string | null {
  if (!value) return null;
  if (value.length > 40 || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(value)) {
    return "Type the serial number as it is on the device: letters, digits and dashes.";
  }
  return null;
}

/** Taxpayer number (TIN): ten digits. */
export function taxpayerNumberProblem(value: string): string | null {
  if (!value) return null;
  return /^\d{10}$/.test(value) ? null : "A taxpayer number is ten digits.";
}

/** VAT number: eight digits. */
export function vatNumberProblem(value: string): string | null {
  if (!value) return null;
  return /^\d{8}$/.test(value) ? null : "A VAT number is eight digits.";
}

export function activationKeyProblem(value: string): string | null {
  if (!value) return null;
  return value.length <= 64 && /^[A-Za-z0-9-]+$/.test(value)
    ? null
    : "Type the activation key as ZIMRA sent it: letters, digits and dashes.";
}

/** The refusal a till gets while ZIMRA is away and the shop stops selling (409 `FISCAL_OFFLINE`). */
export const FISCAL_OFFLINE_REFUSAL =
  "ZIMRA cannot be reached, and this shop stops selling until it answers. Try again in a few minutes.";

export const DEVICE_DAY_OPEN_REFUSAL = "Close the fiscal day before changing the device.";

export const DEVICE_RECONNECT_DAY_OPEN_REFUSAL = "Close the fiscal day before connecting the device again.";
