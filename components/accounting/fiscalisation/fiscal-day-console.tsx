"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { PageSection } from "@/components/ui/page-section";
import { Separator } from "@/components/ui/separator";
import { StatusChip } from "@/components/ui/status-chip";
import { TimeAgo } from "@/components/ui/time-ago";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { BlockingReceiptsTable } from "@/components/accounting/fiscalisation/blocking-receipts";
import type {
  BlockingReceiptWire,
  FiscalDayFleetResponse,
  FiscalDayStatusWire,
  FiscalDeviceWire,
} from "@/components/accounting/fiscalisation/types";

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
 * Everything here composes existing design-system pieces (`Card`, `Alert`,
 * `StatusChip`, `Table`, `Button`, `PageSection`, `TimeAgo`); no colour, size
 * or font is introduced.
 */

/** `FiscalDay.status` → the design system's canonical tones. Mapped rather than
 *  passed raw so a renamed status breaks here loudly instead of silently
 *  degrading to the "pending" fallback. */
const DAY_TONE: Record<FiscalDayStatusWire, { tone: string; label: string }> = {
  OPENED: { tone: "in_progress", label: "Open" },
  CLOSING: { tone: "in_review", label: "Closing" },
  CLOSED: { tone: "inactive", label: "Closed" },
};

const FLEET_KEY = ["accounting", "fiscalisation", "fiscal-days"] as const;

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
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
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
                <p className="text-xs">
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
            <span className="text-xs text-muted-foreground">{device.openBlockedReason}</span>
          ) : null}
          {!canManage ? (
            <span className="text-xs text-muted-foreground">
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
    queryKey: FLEET_KEY,
    queryFn: () =>
      fetchJson<FiscalDayFleetResponse>("/api/accounting/fiscalisation/fiscal-days"),
    // A fiscal day changes underneath this screen every time a till rings a
    // sale, and the number that matters most — the oldest pending receipt — only
    // gets worse with time. Stale data here reads as "nothing to do".
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: FLEET_KEY });
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

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load fiscal days</AlertTitle>
        <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <PageSection
        title="Fiscal days across all sites and tills"
        description="Every registered ZIMRA device in this tenant, with the day it is on and what is holding it open."
      >
        {summary ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Metric label="Devices" value={summary.devices} />
            <Metric label="Days open" value={summary.daysOpen} />
            <Metric
              label="Stuck closing"
              value={summary.daysClosing}
              hint={summary.daysClosing > 0 ? "Z-report not accepted" : undefined}
            />
            <Metric
              label="No day open"
              value={summary.devicesWithoutOpenDay}
              hint={summary.devicesWithoutOpenDay > 0 ? "cannot fiscalise" : undefined}
            />
            <Metric
              label="Blocking receipts"
              value={summary.blockingReceipts}
              hint={
                summary.oldestBlockingAt ? (
                  <>oldest <TimeAgo value={summary.oldestBlockingAt} /></>
                ) : undefined
              }
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading fiscal days..." : "No fiscalisation devices configured."}
          </p>
        )}
      </PageSection>

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
            canManage={Boolean(data?.canManage)}
            refusal={refusals[device.providerConfigId] ?? null}
            busy={busyProviderId === device.providerConfigId}
            onOpen={() => {
              setBusyProviderId(device.providerConfigId);
              openMutation.mutate(device.providerConfigId);
            }}
            onClose={() => {
              if (!device.activeDay) return;
              setBusyProviderId(device.providerConfigId);
              closeMutation.mutate({
                dayId: device.activeDay.id,
                providerConfigId: device.providerConfigId,
              });
            }}
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
