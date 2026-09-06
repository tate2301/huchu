"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@corelithzw/ui/components/card";
import { Empty, EmptyDescription, EmptyTitle } from "@corelithzw/ui/components/empty";
import { MetricTile } from "../hubs/metric-tile";
import { Separator } from "@corelithzw/ui/components/separator";
import { StatusChip } from "@corelithzw/ui/components/status-chip";
import { TimeAgo } from "@corelithzw/ui/components/time-ago";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { BlockingReceiptsTable } from "./blocking-receipts";
import type {
  BlockingReceiptWire,
  FiscalDayFleetResponse,
  FiscalDayStatusWire,
  FiscalDeviceWire,
} from "./types";

/**
 * FD-7.1 — every site and till's fiscal day, on one screen.
 *
 * This is the capability the US$19 SKU is priced on, so it is built as the
 * primary view rather than a panel bolted onto the config form. The shape of it
 * follows the 6pm problem: a supervisor with three tills across two sites needs
 * to know, without clicking into anything, which days are open, which one is
 * quietly failing to submit receipts, and which one will refuse to close — and
 * then act on all three from where they are standing.
 *
 * Two deliberate choices:
 *
 * 1. **A device that cannot act says why, in place.** The open button is
 *    disabled with the service's own refusal beside it (no device ID, provider
 *    inactive, a day already open) rather than being offered and then failing.
 *    An action that always fails teaches the supervisor to ignore the console.
 *
 * 2. **A refused close names the receipts inline, and keeps them on screen.**
 *    Not a toast — a toast is gone by the time they have found the paperwork.
 *    The refusal lands in the device's own card and stays until it is dismissed
 *    or the day actually closes.
 *
 * 3. **A day past 24 hours is stated, not left to be worked out.** The device
 *    card gives the day's age; the banner above gives it ZIMRA's rule and the
 *    close it is asking for. An age is history, a breach is a task.
 *
 * Everything here composes existing design-system pieces (`Card`, `Alert`,
 * `MetricTile`, `StatusChip`, `ReportTable`, `Button`, `TimeAgo`); no colour,
 * size or font is introduced.
 */

/** `FiscalDay.status` → the design system's canonical tones. Mapped rather than
 *  passed raw so a renamed status breaks here loudly instead of silently
 *  degrading to the "pending" fallback. */
const DAY_TONE: Record<FiscalDayStatusWire, { tone: string; label: string }> = {
  OPENED: { tone: "in_progress", label: "Open" },
  CLOSING: { tone: "in_review", label: "Closing" },
  CLOSED: { tone: "inactive", label: "Closed" },
};

/** Shared with the page, which reads the same fleet for its band chip. One key,
 *  so the two observers share a cache entry instead of fetching twice. */
export const FISCAL_DAY_FLEET_KEY = ["accounting", "fiscalisation", "fiscal-days"] as const;

export function fetchFiscalDayFleet() {
  return fetchJson<FiscalDayFleetResponse>("/api/accounting/fiscalisation/fiscal-days");
}

/** What ZIMRA expects, in hours. A day past this is not merely untidy: the
 *  regulator treats a day that never closed as a day that never reconciled. */
export const ZIMRA_MAX_OPEN_HOURS = 24;

/** Whole hours since a day opened. Whole, because "106h" is the figure the
 *  supervisor repeats down the phone; the minutes are noise. */
export function hoursOpen(openedAt: string): number {
  const opened = new Date(openedAt).getTime();
  if (Number.isNaN(opened)) return 0;
  return Math.max(0, Math.floor((Date.now() - opened) / 3_600_000));
}

type CloseRefusal = {
  message: string;
  receipts: BlockingReceiptWire[];
  truncated: boolean;
  total: number;
};

/** Pull the named receipts out of a 409. `ApiError.details` is the whole error
 *  payload, so the list is under `details.details`. Anything unexpected falls
 *  back to the plain message rather than throwing inside an error handler. */
function readCloseRefusal(error: unknown): CloseRefusal | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const payload = error.details as
    | { details?: { blockingReceipts?: BlockingReceiptWire[]; blockingTruncated?: boolean; blockingCount?: number } }
    | undefined;
  const receipts = payload?.details?.blockingReceipts;
  if (!Array.isArray(receipts)) return { message: error.message, receipts: [], truncated: false, total: 0 };
  return {
    message: error.message,
    receipts,
    truncated: Boolean(payload?.details?.blockingTruncated),
    total: payload?.details?.blockingCount ?? receipts.length,
  };
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div>
      <div className="acct-caption">{label}</div>
      <div className="font-mono">{value}</div>
      {hint ? <div className="acct-caption">{hint}</div> : null}
    </div>
  );
}

function DeviceCard({
  device,
  canManage,
  refusal,
  onOpen,
  onClose,
  onDismissRefusal,
  busy,
}: {
  device: FiscalDeviceWire;
  canManage: boolean;
  refusal: CloseRefusal | null;
  onOpen: () => void;
  onClose: () => void;
  onDismissRefusal: () => void;
  busy: boolean;
}) {
  const day = device.activeDay;
  const counts = device.receiptCounts;
  const dayTone = day ? DAY_TONE[day.status] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span>{device.siteLabel ?? device.providerKey}</span>
          {dayTone ? <StatusChip status={dayTone.tone} label={dayTone.label} /> : null}
          {!device.isActive ? <StatusChip status="inactive" label="Provider off" /> : null}
        </CardTitle>
        <CardDescription>
          <span className="font-mono">{device.deviceId ?? "no device ID"}</span>
          {device.siteLabel ? <> · {device.providerKey}</> : null}
          {device.registerLabels.length > 0 ? <> · tills: {device.registerLabels.join(", ")}</> : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {day ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Fiscal day"
              value={day.fiscalDayNo}
              hint={<>opened <TimeAgo value={day.openedAt} /></>}
            />
            <Metric
              label="Receipts today"
              value={counts.total}
              hint={`${counts.accepted} accepted`}
            />
            <Metric
              label="Oldest pending"
              value={device.oldestBlockingAt ? <TimeAgo value={device.oldestBlockingAt} /> : "none"}
              hint={counts.blocking > 0 ? `${counts.pending} pending · ${counts.failed} failed` : "nothing queued"}
            />
            <Metric
              label="Counters"
              value={`#${day.lastReceiptCounter} / ${day.lastReceiptGlobalNo}`}
              hint="in day / on device"
            />
          </div>
        ) : (
          <Empty>
            <EmptyTitle>No fiscal day open</EmptyTitle>
            <EmptyDescription>
              {device.lastClosedDay
                ? `Last closed day ${device.lastClosedDay.fiscalDayNo}. This till cannot fiscalise a sale until a day is open.`
                : "This device has never opened a fiscal day."}
            </EmptyDescription>
          </Empty>
        )}

        {day?.lastError ? (
          <Alert variant="warning">
            <AlertTitle>Last fiscal-day error</AlertTitle>
            <AlertDescription>{day.lastError}</AlertDescription>
          </Alert>
        ) : null}

        {counts.blocking > 0 ? (
          <div className="space-y-2">
            <Separator />
            <p className="text-sm font-semibold">
              {counts.blocking} receipt{counts.blocking === 1 ? "" : "s"} will block this day from
              closing
            </p>
            <BlockingReceiptsTable
              receipts={device.blockingReceipts}
              truncated={device.blockingTruncated}
              total={counts.blocking}
            />
          </div>
        ) : null}

        {refusal ? (
          <Alert variant="destructive">
            <AlertTitle>Day {day?.fiscalDayNo ?? ""} did not close</AlertTitle>
            <AlertDescription>
              <div className="space-y-2">
                <p>{refusal.message}</p>
                <BlockingReceiptsTable
                  receipts={refusal.receipts}
                  truncated={refusal.truncated}
                  total={refusal.total}
                />
                <p className="acct-caption">
                  Replay or void each of these, then close the day again. Nothing has been submitted
                  to ZIMRA.
                </p>
                <Button size="sm" variant="outline" onClick={onDismissRefusal}>
                  Dismiss
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={onOpen}
            disabled={!canManage || busy || Boolean(device.openBlockedReason)}
          >
            Open Day
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            disabled={!canManage || busy || !day}
          >
            Close Day{day ? ` ${day.fiscalDayNo}` : ""}
          </Button>
          {device.openBlockedReason && !day ? (
            // Only shown when there is no day at all: with a day open the
            // reason is "a day is already open", which the card already says.
            <span className="acct-caption">{device.openBlockedReason}</span>
          ) : null}
          {!canManage ? (
            <span className="acct-caption">
              Read-only — opening and closing days needs a manager role.
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function FiscalDayConsole() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refusals, setRefusals] = useState<Record<string, CloseRefusal>>({});
  const [busyProviderId, setBusyProviderId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: FISCAL_DAY_FLEET_KEY,
    queryFn: fetchFiscalDayFleet,
    // A fiscal day changes underneath this screen every time a till rings a
    // sale, and the number that matters most — the oldest pending receipt — only
    // gets worse with time. Stale data here reads as "nothing to do".
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: FISCAL_DAY_FLEET_KEY });
    // The receipts view lists the same rows, and a closed day changes them.
    queryClient.invalidateQueries({ queryKey: ["accounting", "fiscalisation", "receipts"] });
  };

  const openMutation = useMutation({
    mutationFn: async (providerConfigId: string) =>
      fetchJson("/api/accounting/fiscalisation/fiscal-days", {
        method: "POST",
        body: JSON.stringify({ providerConfigId }),
      }),
    onSuccess: () => {
      toast({ title: "Fiscal day opened", variant: "success" });
      invalidate();
    },
    onError: (err) => {
      // A 409 here means somebody else already opened the day — the outcome the
      // supervisor wanted. Refetch and say so, rather than showing an error for
      // a state that is now correct.
      const alreadyOpen = err instanceof ApiError && err.status === 409;
      toast({
        title: alreadyOpen ? "A day is already open on this device" : "Unable to open fiscal day",
        description: getApiErrorMessage(err),
        variant: alreadyOpen ? "default" : "destructive",
      });
      invalidate();
    },
    onSettled: () => setBusyProviderId(null),
  });

  const closeMutation = useMutation({
    mutationFn: async (input: { dayId: string; providerConfigId: string }) =>
      fetchJson<{ alreadyClosed: boolean; countersIncomplete: boolean; receiptCount: number }>(
        `/api/accounting/fiscalisation/fiscal-days/${input.dayId}`,
        { method: "POST", body: JSON.stringify({ action: "close" }) },
      ),
    onSuccess: (result, input) => {
      setRefusals((prev) => {
        const next = { ...prev };
        delete next[input.providerConfigId];
        return next;
      });
      toast({
        title: result.alreadyClosed ? "Day was already closed" : "Fiscal day closed",
        description: result.countersIncomplete
          ? `Z-report covers ${result.receiptCount} receipt(s), but some carry no stored tax breakdown — the counters under-report. Check the day before filing.`
          : `Z-report covers ${result.receiptCount} receipt(s).`,
        variant: result.countersIncomplete ? "default" : "success",
      });
      invalidate();
    },
    onError: (err, input) => {
      const refusal = readCloseRefusal(err);
      if (refusal) {
        // Kept in the card rather than a toast: the supervisor is about to go
        // and find these documents, and a toast is gone before they are back.
        setRefusals((prev) => ({ ...prev, [input.providerConfigId]: refusal }));
        invalidate();
        return;
      }
      toast({
        title: "Unable to close fiscal day",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
    onSettled: () => setBusyProviderId(null),
  });

  const devices = useMemo(() => data?.devices ?? [], [data]);
  const summary = data?.summary;
  const canManage = Boolean(data?.canManage);

  /**
   * The days that have already broken the rule.
   *
   * A day open past 24 hours is the one thing on this screen that gets worse
   * on its own, and the device card states it as an age — "opened 4d ago" —
   * which reads as history rather than as a breach. Lifted out and said in the
   * regulator's own terms, with the close it is asking for attached.
   */
  const overdueDays = useMemo(
    () =>
      devices.flatMap((device) => {
        const day = device.activeDay;
        if (!day) return [];
        const hours = hoursOpen(day.openedAt);
        return hours >= ZIMRA_MAX_OPEN_HOURS ? [{ device, day, hours }] : [];
      }),
    [devices],
  );

  const closeDay = (device: FiscalDeviceWire) => {
    if (!device.activeDay) return;
    setBusyProviderId(device.providerConfigId);
    closeMutation.mutate({
      dayId: device.activeDay.id,
      providerConfigId: device.providerConfigId,
    });
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load fiscal days</AlertTitle>
        <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2.5">
      {overdueDays.map(({ device, day, hours }) => (
        <Alert variant="destructive" key={device.providerConfigId}>
          <AlertTitle>
            Fiscal day {day.fiscalDayNo}
            {device.siteLabel || device.deviceId
              ? ` on ${device.siteLabel ?? device.deviceId}`
              : ""}{" "}
            has been open {hours} hours
          </AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1">
                ZIMRA expects it closed within {ZIMRA_MAX_OPEN_HOURS}
                {device.receiptCounts.blocking > 0
                  ? `, and the ${device.receiptCounts.blocking} queued receipt${
                      device.receiptCounts.blocking === 1 ? "" : "s"
                    } will not drain until it is`
                  : ""}
                .
              </span>
              <Button
                size="sm"
                onClick={() => closeDay(device)}
                disabled={!canManage || busyProviderId === device.providerConfigId}
              >
                Close day {day.fiscalDayNo}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ))}

      {/* No heading: the view switcher above already says Fiscal Days, and the
          five figures name themselves. */}
      {summary ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <MetricTile title="Devices" value={summary.devices} valueLabel={String(summary.devices)} tone="neutral" />
          <MetricTile
            title="Days open"
            value={summary.daysOpen}
            valueLabel={String(summary.daysOpen)}
            tone="neutral"
          />
          <MetricTile
            title="Stuck closing"
            value={summary.daysClosing}
            valueLabel={String(summary.daysClosing)}
            tone={summary.daysClosing > 0 ? "danger" : "neutral"}
            detail={summary.daysClosing > 0 ? "Z-report not accepted" : undefined}
          />
          <MetricTile
            title="No day open"
            value={summary.devicesWithoutOpenDay}
            valueLabel={String(summary.devicesWithoutOpenDay)}
            tone={summary.devicesWithoutOpenDay > 0 ? "danger" : "neutral"}
            detail={summary.devicesWithoutOpenDay > 0 ? "cannot fiscalise" : undefined}
          />
          <MetricTile
            title="Blocking receipts"
            value={summary.blockingReceipts}
            valueLabel={String(summary.blockingReceipts)}
            tone={summary.blockingReceipts > 0 ? "warn" : "neutral"}
            // The date rather than an age: the tile's qualifier is a plain
            // string, and a relative age computed here would differ between
            // the server render and the first paint.
            detail={
              summary.oldestBlockingAt
                ? `oldest ${summary.oldestBlockingAt.slice(0, 10)}`
                : undefined
            }
          />
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          {isLoading ? "Loading fiscal days..." : "No fiscalisation devices configured."}
        </p>
      )}

      {/* A tenant with no devices is the pre-FD-1 state, not an error: say what
          is missing rather than showing an empty grid that looks broken. */}
      {!isLoading && devices.length === 0 ? (
        <Empty>
          <EmptyTitle>No fiscalisation devices</EmptyTitle>
          <EmptyDescription>
            Add a provider configuration with a device ID before a fiscal day can be opened. Each
            configuration is one ZIMRA device — one till at one site.
          </EmptyDescription>
        </Empty>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {devices.map((device) => (
          <DeviceCard
            key={device.providerConfigId}
            device={device}
            canManage={canManage}
            refusal={refusals[device.providerConfigId] ?? null}
            busy={busyProviderId === device.providerConfigId}
            onOpen={() => {
              setBusyProviderId(device.providerConfigId);
              openMutation.mutate(device.providerConfigId);
            }}
            onClose={() => closeDay(device)}
            onDismissRefusal={() =>
              setRefusals((prev) => {
                const next = { ...prev };
                delete next[device.providerConfigId];
                return next;
              })
            }
          />
        ))}
      </div>
    </div>
  );
}
