/**
 * FD-7.1 — the wire shape the fiscal-day console and its routes agree on.
 *
 * The two API routes under `app/api/accounting/fiscalisation/fiscal-days/`
 * import these as types only, so nothing in this file reaches the server
 * bundle; it exists so the console and the routes cannot drift apart silently,
 * which is exactly what happens when a route builds an ad-hoc object and the
 * page re-declares its own guess of the shape.
 *
 * Every count here is a plain number and every amount is a **string of minor
 * units**, never a number. The Z-report counters come out of
 * `aggregateFiscalDayCounters` as bigints for a reason (see
 * `lib/accounting/fiscal-day.ts`), and rendering one through a JSON number
 * would put an exact fiscal figure back through a double on the last hop to
 * the screen — the one place FD-0.3 says it must not go.
 */

/** `FiscalDay.status`, restated so the console can switch on it exhaustively. */
export type FiscalDayStatusWire = "OPENED" | "CLOSING" | "CLOSED";

/**
 * A receipt that has not been accepted by ZIMRA and is therefore holding its
 * fiscal day open.
 *
 * The identifiers are the point of this type. "This day cannot close" is not
 * something a supervisor can act on at 6pm; "sale RS-1043, global no 812,
 * FAILED 40 minutes ago with «connect ETIMEDOUT»" is. Everything here exists to
 * let them find the physical document and decide whether to replay it or void
 * it.
 */
export type BlockingReceiptWire = {
  id: string;
  status: string;
  /** The receipt's own number where it has one; a PENDING row may not. */
  receiptNumber: string | null;
  fiscalNumber: string | null;
  /** Position in the day, and on the device for all time. */
  receiptCounter: number | null;
  receiptGlobalNo: number | null;
  /** Which source document this is, so the supervisor knows where to look. */
  sourceKind: "invoice" | "school-receipt" | "credit-note" | "till-sale" | "unknown";
  sourceRef: string | null;
  createdAt: string;
  lastError: string | null;
  attemptCount: number;
  /** When the drainer will next pick it up, if it is still eligible. */
  nextRetryAt: string | null;
};

/** The running state of a day, as the fleet view needs it. */
export type FiscalDayWire = {
  id: string;
  fiscalDayNo: number;
  status: FiscalDayStatusWire;
  deviceId: string;
  openedAt: string;
  closedAt: string | null;
  /** The two counters the chain rests on: position in the day, position on the
   *  device for all time. */
  lastReceiptCounter: number;
  lastReceiptGlobalNo: number;
  lastReceiptHash: string | null;
  lastError: string | null;
};

/**
 * One device — which in this schema is one `FiscalisationProviderConfig`, and
 * in the shop is one till at one site.
 *
 * Site is read off the provider's `metadataJson` rather than a column because
 * there is no relation to hang it on yet: `RetailRegister.siteId` is a loose
 * string and FD-7.2 owns turning it into a real one. Until then the label is
 * best-effort and the device ID is the identifier that is always true.
 */
export type FiscalDeviceWire = {
  providerConfigId: string;
  providerKey: string;
  deviceId: string | null;
  isActive: boolean;
  /** Resolved `Site.name` when metadata names a real site, else whatever label
   *  metadata carries, else null. Never invented. */
  siteLabel: string | null;
  siteId: string | null;
  /** Tills registered against that site, for the supervisor's orientation only
   *  — no register is bound to a device until FD-7.2. */
  registerLabels: string[];
  /** The day accepting receipts, or the one stuck CLOSING. Null when the
   *  device has no open day at all. */
  activeDay: FiscalDayWire | null;
  /** Most recently closed day, so a device with no open day still shows where
   *  it left off. */
  lastClosedDay: Pick<FiscalDayWire, "id" | "fiscalDayNo" | "closedAt"> | null;
  /** Receipts on the active day, by outcome. `blocking` is pending + failed. */
  receiptCounts: {
    total: number;
    accepted: number;
    pending: number;
    failed: number;
    blocking: number;
  };
  /** The oldest unsubmitted receipt on the active day — the age that tells a
   *  supervisor whether this is a blip or a shift-long outage. */
  oldestBlockingAt: string | null;
  /** Named, capped list. `blockingTruncated` says the list is not the whole
   *  story so the console never implies four failures when there are forty. */
  blockingReceipts: BlockingReceiptWire[];
  blockingTruncated: boolean;
  /** Why the open/close button is unavailable, in words. Null when the action
   *  is available. */
  openBlockedReason: string | null;
};

export type FiscalDayFleetResponse = {
  devices: FiscalDeviceWire[];
  summary: {
    devices: number;
    daysOpen: number;
    daysClosing: number;
    devicesWithoutOpenDay: number;
    blockingReceipts: number;
    /** Oldest unsubmitted receipt across the whole fleet. */
    oldestBlockingAt: string | null;
  };
  /** True when the caller may open and close days. The console still renders
   *  read-only for everyone else rather than hiding the fleet. */
  canManage: boolean;
};

/** One line of a closed day's Z-report, as persisted in `countersJson`. */
export type FiscalDayCounterWire = {
  fiscalCounterType: string;
  fiscalCounterCurrency: string;
  fiscalCounterTaxID: number;
  fiscalCounterTaxPercent: string | null;
  /** Minor units, as a decimal string. Never a JSON number. */
  fiscalCounterValueCents: string;
};

export type FiscalDayDetailResponse = {
  day: FiscalDayWire & {
    providerConfigId: string;
    providerKey: string;
    siteLabel: string | null;
    closingSignature: string | null;
  };
  receiptCounts: FiscalDeviceWire["receiptCounts"];
  blockingReceipts: BlockingReceiptWire[];
  blockingTruncated: boolean;
  /**
   * The signed Z-report counters, present only for a day that has closed.
   *
   * An open day has none: the counter set is computed at close from each
   * receipt's tax breakdown, and until then the honest answer is "not yet",
   * not a zero-filled table that looks like a reconciled report.
   */
  counters: FiscalDayCounterWire[] | null;
  /**
   * Receipts whose tax breakdown could not be found when the day closed, so
   * the Z-report under-reports them.
   *
   * This is FD-2.2's discrepancy list surfaced verbatim. It is non-empty today
   * for every day closed from this console, because the signed per-tax
   * breakdown is not persisted on `FiscalReceipt` — see the roadmap. Showing it
   * is the difference between a supervisor knowing the report is incomplete and
   * finding out from ZIMRA.
   */
  receiptsWithoutTaxLines: string[];
};

/** What a refused close returns, at HTTP 409. */
export type FiscalDayCloseConflict = {
  error: string;
  code: string;
  details: {
    dayId: string;
    blockingReceipts: BlockingReceiptWire[];
    blockingTruncated: boolean;
  };
};
