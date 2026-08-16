/**
 * What a queued sale is actually waiting on, in words a cashier can act on.
 *
 * S-7.3. The till has sold offline since it was built — `lib/retail/offline-*.ts`
 * and the outbox in `lib/offline/` — and has never had a screen. A cashier could
 * not see what was waiting, and when a replay failed the only record was an
 * outbox row carrying `status: "FAILED_BLOCKING"` and a server sentence nobody
 * was going to read.
 *
 * "Failed" is the wrong word for most of what happens to a queued sale, and the
 * differences matter to the person standing at the till:
 *
 * - a sale waiting for the line to come back needs **nothing** doing;
 * - a sale whose price no longer matches the shelf and cannot be explained needs
 *   **a manager**, and cannot be fixed by pressing retry until it works;
 * - a sale whose item has since been retired, or whose shift has closed, needs
 *   somebody in the office.
 *
 * So this maps the facts the queue holds onto one verdict each. It is pure, and
 * separate from the screen, because the mapping is the part with a rule in it.
 *
 * ── Where the price verdicts come from ─────────────────────────────────────
 *
 * `lib/retail/replay-price-review.ts` decides MATCHES / SUPERSEDED / OVERRIDDEN /
 * unexplained when a replay reaches the server. Two of those outcomes post the
 * sale — so they leave the queue and are only visible on the sale itself, in
 * `overrideReason`. One of them refuses it, and stays in the queue as an error.
 * Both halves are classified here, off the exported markers rather than off the
 * prose, so a reworded sentence cannot silently retire a verdict.
 */

import {
  REPLAY_PRICE_OVERRIDDEN_MARKER,
  REPLAY_PRICE_SUPERSEDED_MARKER,
  REPLAY_PRICE_UNEXPLAINED_MESSAGE,
} from "./replay-price-review";

/**
 * Written into `RetailSale.notes` by `pos/sales` when a sale arrives with an
 * `offlineCreatedAt`. `NOTE:2026-08-13T18:02:00.000Z` — the marker, then when the
 * till actually rang it, which is not the same as when it posted.
 */
export const OFFLINE_REPLAY_NOTE_MARKER = "OFFLINE_REPLAY";

/* ─── Sales still in the queue ─────────────────────────────────────── */

/** The subset of an outbox row this rule needs. */
export type QueuedSaleFacts = {
  status: "QUEUED" | "SYNCING" | "FAILED_RETRYABLE" | "FAILED_BLOCKING" | "SYNCED";
  lastError?: string | null;
  retryCount: number;
  /** Set when this sale is behind another operation that has failed. */
  blockedByOperationId?: string | null;
};

export type QueuedSaleVerdictKind =
  /** Sitting in the queue. Nothing is wrong. */
  | "WAITING"
  /** Being sent right now. */
  | "SENDING"
  /** Behind another operation that has not landed. */
  | "BLOCKED_BY_ANOTHER"
  /** The server was not reachable. It will go on its own. */
  | "OFFLINE"
  /** The price does not match the shelf and nothing explains it. */
  | "PRICE_UNEXPLAINED"
  /** A discount on the sale needs an approval the queue cannot supply. */
  | "NEEDS_APPROVAL"
  /** The shift it was rung against is gone. */
  | "SHIFT_CLOSED"
  /** Not enough stock, or an item that no longer exists. */
  | "STOCK"
  /** Refused for a reason this rule does not recognise. */
  | "REFUSED";

export type QueuedSaleVerdict = {
  kind: QueuedSaleVerdictKind;
  tone: "neutral" | "brand" | "warning" | "danger";
  /** Two or three words, for the pill. */
  label: string;
  /** One sentence saying what happened. */
  detail: string;
  /** What the person reading it should do, or null when the answer is nothing. */
  action: string | null;
  /** Whether pressing "try again" could plausibly change the outcome. */
  retryable: boolean;
};

/**
 * Phrases the server refuses with, matched case-insensitively.
 *
 * Matching on message text is not something to do lightly, and it is done here
 * because the outbox stores a sentence and nothing else. The price case — the one
 * that matters — is matched on a constant exported by the module that writes it.
 * The rest are best-effort: an unrecognised refusal falls through to `REFUSED`,
 * which says so honestly rather than guessing.
 */
const SHIFT_PHRASES = ["open shift not found", "shift is closed", "shift not found"];
const STOCK_PHRASES = ["insufficient stock", "catalog items invalid", "inventory item missing"];
const APPROVAL_PHRASES = [
  "manager approval is required",
  "manager approval is invalid",
  "override reason",
];
const NETWORK_PHRASES = ["network", "failed to fetch", "load failed", "offline"];

function matches(message: string, phrases: string[]) {
  return phrases.some((phrase) => message.includes(phrase));
}

export function classifyQueuedSale(facts: QueuedSaleFacts): QueuedSaleVerdict {
  if (facts.blockedByOperationId) {
    return {
      kind: "BLOCKED_BY_ANOTHER",
      tone: "warning",
      label: "Waiting on another",
      detail:
        "Something this sale depends on — the shift it was rung against, or a new customer — has not gone up yet.",
      action: "Clear that one first and this will follow.",
      retryable: false,
    };
  }

  if (facts.status === "SYNCING") {
    return {
      kind: "SENDING",
      tone: "brand",
      label: "Sending",
      detail: "Going up to the shop's system now.",
      action: null,
      retryable: false,
    };
  }

  if (facts.status === "QUEUED" || facts.status === "SYNCED") {
    return {
      kind: "WAITING",
      tone: "neutral",
      label: "Waiting",
      detail: "Saved on this till. It will go up on its own as soon as the line is back.",
      action: null,
      retryable: true,
    };
  }

  const message = (facts.lastError ?? "").toLowerCase();

  if (message.includes(REPLAY_PRICE_UNEXPLAINED_MESSAGE.toLowerCase())) {
    return {
      kind: "PRICE_UNEXPLAINED",
      tone: "danger",
      label: "Price not approved",
      detail:
        "The price this was rung at is not the shelf price, and the shelf price did not change after the sale — so nothing explains the difference.",
      action: "A manager has to re-post this one with a reason. Trying again will not clear it.",
      retryable: false,
    };
  }

  if (matches(message, APPROVAL_PHRASES)) {
    return {
      kind: "NEEDS_APPROVAL",
      tone: "danger",
      label: "Needs a manager",
      detail: "There is a discount or a price change on this sale that nobody has approved.",
      action: "A manager has to re-post this one. Trying again will not clear it.",
      retryable: false,
    };
  }

  if (matches(message, SHIFT_PHRASES)) {
    return {
      kind: "SHIFT_CLOSED",
      tone: "danger",
      label: "Shift gone",
      detail: "The drawer this was rung against has been closed, so the sale has nowhere to post.",
      action: "Show this to the manager — it has to be posted against an open shift.",
      retryable: false,
    };
  }

  if (matches(message, STOCK_PHRASES)) {
    return {
      kind: "STOCK",
      tone: "danger",
      label: "Item problem",
      detail: "One of the items is out of stock on the system, or is no longer on the shelf list.",
      action: "The stock has to be corrected before this can post.",
      retryable: true,
    };
  }

  if (facts.status === "FAILED_RETRYABLE" || matches(message, NETWORK_PHRASES)) {
    return {
      kind: "OFFLINE",
      tone: "warning",
      label: "No connection",
      detail:
        facts.retryCount > 0
          ? `Could not reach the shop's system. Tried ${facts.retryCount} ${facts.retryCount === 1 ? "time" : "times"} so far.`
          : "Could not reach the shop's system.",
      action: null,
      retryable: true,
    };
  }

  return {
    kind: "REFUSED",
    tone: "danger",
    label: "Refused",
    detail: facts.lastError?.trim() || "The shop's system would not take this sale.",
    action: "Show this to the manager.",
    retryable: true,
  };
}

/* ─── Sales that made it through ───────────────────────────────────── */

export type ReplayedSaleVerdictKind =
  /** Not a replay at all — rung at the counter with the line up. */
  | "NOT_A_REPLAY"
  /** Replayed, and the price it was rung at is still the shelf price. */
  | "MATCHED"
  /** Replayed at a price the shop has since changed. The till's price stood. */
  | "SUPERSEDED"
  /** Replayed at a price somebody entitled to change it changed, with a reason. */
  | "OVERRIDDEN";

export type ReplayedSaleVerdict = {
  kind: ReplayedSaleVerdictKind;
  tone: "neutral" | "success" | "warning";
  label: string;
  detail: string;
  /** When the till rang it, off the note marker, or null when it did not say. */
  soldAt: string | null;
};

/**
 * What happened to a sale that has already posted.
 *
 * This is the half of the ticket that is easy to skip. A superseded price posts
 * *quietly* — the review explains it, the sale goes on the books at the price the
 * customer was actually charged, and without this the till says "synced" and the
 * shop finds out from a margin figure three weeks later that a case of Castle
 * went out at last month's price.
 */
export function classifyReplayedSale(sale: {
  notes?: string | null;
  overrideReason?: string | null;
}): ReplayedSaleVerdict {
  const notes = sale.notes ?? "";
  const marker = notes.match(
    new RegExp(`${OFFLINE_REPLAY_NOTE_MARKER}:([0-9TZ:.\\-]+)`),
  );

  if (!notes.includes(OFFLINE_REPLAY_NOTE_MARKER)) {
    return {
      kind: "NOT_A_REPLAY",
      tone: "neutral",
      label: "Rung online",
      detail: "Posted straight through at the counter.",
      soldAt: null,
    };
  }

  const soldAt = marker?.[1] ?? null;
  const override = sale.overrideReason ?? "";

  if (override.includes(REPLAY_PRICE_SUPERSEDED_MARKER)) {
    return {
      kind: "SUPERSEDED",
      tone: "warning",
      label: "Old price stood",
      detail:
        "The shelf price changed after this sale was rung, so it posted at the price the customer was charged, not today's. The difference is on the sale.",
      soldAt,
    };
  }

  if (override.includes(REPLAY_PRICE_OVERRIDDEN_MARKER)) {
    return {
      kind: "OVERRIDDEN",
      tone: "warning",
      label: "Price changed at the till",
      detail: "It posted at a price that was changed at the till, with a reason recorded.",
      soldAt,
    };
  }

  return {
    kind: "MATCHED",
    tone: "success",
    label: "Synced",
    detail: "Went up at the shelf price. Nothing to look at.",
    soldAt,
  };
}
