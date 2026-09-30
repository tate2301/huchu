"use client";

/**
 * The offline queue, at the till.
 *
 * S-7.3, and the screen `docs/design-system/portals/pos.html` calls *Offline queue*
 * (`renderOfflineQueue`): a connection status strip, how many are waiting and what
 * they come to, and a row per queued transaction.
 *
 * The till has sold offline since it was built. What it has never had is anywhere
 * for a cashier to look — so a sale that could not go up was invisible until
 * somebody noticed the day's takings were short a receipt.
 *
 * ── Three departures from the prototype ────────────────────────────────────
 *
 * - **No "Force offline" button.** The prototype has one because it has no
 *   backend to be offline from. A real till has the browser's own connection
 *   state and a service worker; a button that pretends otherwise teaches a
 *   cashier a control that does not exist on the day it matters.
 * - **A verdict per row, not "queued".** The prototype's rows all say the same
 *   thing. Ours say what is actually holding each one up, because the difference
 *   between "waiting for the line" and "a manager has to re-post this" is the
 *   difference between doing nothing and doing something, and a cashier told
 *   "failed" will press retry until the shift ends. The rule is
 *   `lib/retail/offline-queue-verdict.ts` and it is tested there.
 * - **A section for what already went up.** A sale replayed at a price the shop
 *   has since changed *succeeds* — `reviewReplayedPrices` explains it and the
 *   sale posts at what the customer was charged. That is the right outcome and
 *   it is invisible: the queue empties and nobody is told. So the replays that
 *   carried a superseded or overridden price are listed underneath, read back
 *   off the sales themselves.
 *
 * ── And one thing this screen has to admit ─────────────────────────────────
 *
 * A cash drop taken while the line is down has nowhere to queue. See
 * `OfflineCashLimitationNotice` at the foot of this file.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { fetchJson } from "@/lib/api-client";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  RefreshCw,
  Trash2,
  Upload,
  Wallet,
} from "@/lib/icons";
import {
  classifyQueuedSale,
  classifyReplayedSale,
  type QueuedSaleVerdict,
} from "@/lib/retail/offline-queue-verdict";
import { queuedSaleLabel } from "@/lib/retail/pos-offline-queue";
import { formatRetailDateTime } from "@/lib/retail/words";
import { PosEmptyState, PosPanel, PosPanelHeader, PosStatusPill } from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import type { SaleRow } from "./pos-types";
import { money, round } from "./pos-utils";

type ReplayedSale = SaleRow & { notes: string | null };

function formatTime(value: string | null | undefined) {
  return formatRetailDateTime(value) || "—";
}

const VERDICT_ICON = {
  neutral: CloudOff,
  brand: Upload,
  warning: AlertTriangle,
  danger: AlertTriangle,
} as const;

function VerdictRow({
  verdict,
  title,
  meta,
  amount,
  actions,
}: {
  verdict: QueuedSaleVerdict;
  title: string;
  meta: string;
  amount: string;
  actions?: React.ReactNode;
}) {
  const Icon = VERDICT_ICON[verdict.tone];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-3 sm:flex-row sm:items-start">
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          background:
            verdict.tone === "danger"
              ? "var(--pos-status-danger-bg)"
              : verdict.tone === "warning"
                ? "var(--pos-status-warning-bg)"
                : verdict.tone === "brand"
                  ? "var(--pos-status-info-bg)"
                  : "var(--surface-base)",
          color:
            verdict.tone === "danger"
              ? "var(--pos-status-danger-text)"
              : verdict.tone === "warning"
                ? "var(--pos-status-warning-text)"
                : verdict.tone === "brand"
                  ? "var(--pos-status-info-text)"
                  : "var(--text-muted)",
        }}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-bold text-[var(--text-strong)]">{title}</span>
          <PosStatusPill tone={verdict.tone}>{verdict.label}</PosStatusPill>
        </div>
        <div className="mt-0.5 text-xs text-[var(--text-muted)]">{meta}</div>
        <p className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]">{verdict.detail}</p>
        {verdict.action ? (
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-strong)]">
            {verdict.action}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
        <span className="font-mono text-[13px] font-black tabular-nums text-[var(--text-strong)]">
          {amount}
        </span>
        {actions}
      </div>
    </div>
  );
}

export function PosOfflineQueueView() {
  const {
    queuedOfflineSales,
    retryOfflineSale,
    removeOfflineSale,
    syncOfflineSales,
    syncOfflineSalesPending,
  } = usePosPortalState();
  const { isOffline, operations } = useOfflineRuntime();

  /**
   * The outbox summary carries the dependency state — whether this sale is stuck
   * behind a shift or a customer that has not gone up — and the queue carries the
   * payload. Neither has both, so they are joined on the operation id.
   */
  const blockedBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of operations) {
      if (item.blockedByOperationId) map.set(item.operationId, item.blockedByOperationId);
    }
    return map;
  }, [operations]);

  const rows = useMemo(
    () =>
      queuedOfflineSales.map((operation) => {
        const payload = operation.payload;
        const total = round(
          (payload.payments ?? []).reduce((sum, payment) => sum + (payment.amount ?? 0), 0),
        );
        return {
          operation,
          total,
          lineCount: payload.items?.length ?? 0,
          verdict: classifyQueuedSale({
            status: operation.status,
            lastError: operation.lastError,
            retryCount: operation.retryCount,
            blockedByOperationId: blockedBy.get(operation.operationId) ?? null,
          }),
        };
      }),
    [blockedBy, queuedOfflineSales],
  );


  /**
   * Replays that already landed. `scope=mine` is the cashier's own, which is the
   * right scope for a screen at their till, and the same query key the history
   * screen warms — so on a till that has been used today this is already cached.
   */
  const replayedQuery = useQuery({
    queryKey: ["retail-pos-sales", "offline-replays"],
    queryFn: () =>
      fetchJson<{ data: ReplayedSale[] }>("/api/v2/retail/pos/sales?scope=mine&limit=60"),
    staleTime: 30_000,
  });

  const replays = useMemo(
    () =>
      (replayedQuery.data?.data ?? [])
        .map((sale) => ({ sale, verdict: classifyReplayedSale(sale) }))
        .filter((entry) => entry.verdict.kind !== "NOT_A_REPLAY")
        .slice(0, 12),
    [replayedQuery.data],
  );

  return (
    <div className="space-y-4">
      {/* ══ The queue ═══════════════════════════════════════════ */}
      <PosPanel>
        <PosPanelHeader
          title={`${rows.length} ${rows.length === 1 ? "sale" : "sales"} waiting`}
          actions={
            <Button
              size="sm"
              variant="outline"
              className="h-12 rounded-xl px-6 text-[14px] font-bold"
              disabled={syncOfflineSalesPending || isOffline || rows.length === 0}
              onClick={() => syncOfflineSales()}
            >
              <RefreshCw className="h-4 w-4" />
              {syncOfflineSalesPending ? "Sending…" : "Send now"}
            </Button>
          }
        />

        {rows.length === 0 ? (
          <PosEmptyState icon={CheckCircle2} title="No sales waiting" />
        ) : (
          <div className="space-y-2">
            {rows.map(({ operation, total, lineCount, verdict }) => (
              <VerdictRow
                key={operation.operationId}
                verdict={verdict}
                title={queuedSaleLabel(operation.payload)}
                meta={`${lineCount} ${lineCount === 1 ? "product" : "products"} · rung ${formatTime(operation.createdAt)}${
                  operation.payload.customerName ? ` · ${operation.payload.customerName}` : ""
                }`}
                amount={money(total)}
                actions={
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 px-3 text-xs"
                      disabled={syncOfflineSalesPending || isOffline || !verdict.retryable}
                      onClick={() => retryOfflineSale(operation.operationId)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Send again
                    </Button>
                    {/*
                      Removing is destructive in the worst way — the shop took this
                      money and dropping the row is the one action that loses it
                      from the books for good. So it is only offered on a sale the
                      queue has already given up on, never on one that is merely
                      waiting for the line.
                    */}
                    {operation.status === "FAILED_BLOCKING" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 px-3 text-xs"
                        style={{ color: "var(--pos-status-danger-text)" }}
                        onClick={() => {
                          void dsConfirm({
                            title: `Discard ${queuedSaleLabel(operation.payload)}?`,
                            description:
                              "The money stays in the drawer, and this sale never reaches the shop's system.",
                            confirmLabel: "Discard the sale",
                            variant: "danger",
                          }).then((confirmed) => {
                            if (confirmed) removeOfflineSale(operation.operationId);
                          });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Discard
                      </Button>
                    ) : null}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </PosPanel>

      {/* ══ What a superseded price did ═════════════════════════ */}
      {replays.length > 0 ? (
        <PosPanel>
          <PosPanelHeader title="Sent after the line came back" />
          <div className="space-y-2">
            {replays.map(({ sale, verdict }) => (
              <div
                key={sale.id}
                className="flex flex-col gap-2 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-3 sm:flex-row sm:items-start"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-bold text-[var(--text-strong)]">
                      {sale.saleNo}
                    </span>
                    {verdict.tone === "success" ? null : (
                      <PosStatusPill tone="warning">{verdict.label}</PosStatusPill>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                    Rung {formatTime(verdict.soldAt)} · sent {formatTime(sale.postedAt)}
                  </div>
                  {verdict.kind === "MATCHED" ? null : (
                    <>
                      <p className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]">
                        {verdict.detail}
                      </p>
                      {sale.overrideReason ? (
                        <p className="mt-1 break-words font-mono text-[11px] leading-4 text-[var(--text-muted)]">
                          {sale.overrideReason}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[13px] font-black tabular-nums text-[var(--text-strong)]">
                  {money(sale.totalAmount)}
                </span>
              </div>
            ))}
          </div>
        </PosPanel>
      ) : null}

      <OfflineCashLimitationNotice />
    </div>
  );
}

/**
 * What the till cannot do offline, said out loud.
 *
 * S-7.1 shipped cash movements and left one hole, reported at the time: there is
 * no offline path for `RetailCashMovement`. `lib/retail/offline-shift.ts` keeps a
 * local `expectedCash` and the outbox has no `create-cash-movement` operation, so
 * a manager who banks $200 to the safe while the line is down has nowhere to
 * record it.
 *
 * That is not fixed here — building it is its own ticket, with its own
 * reconciliation questions about what an offline drop does to a shift that syncs
 * hours later. What is unacceptable is that the cashier finds out at cash-up,
 * counting a drawer $200 light against an `expectedCash` that never heard about
 * the drop: the exact reconciliation defect S-7.1 exists to prevent, arriving
 * through a different door.
 *
 * So the till says so, on the screen a cashier is already looking at when the line
 * is down, and tells them the one thing that makes it survivable — write it down
 * and enter it when the connection is back, before cashing up.
 */
export function OfflineCashLimitationNotice() {
  const { isOffline } = useOfflineRuntime();

  return (
    <PosPanel>
      <div className="flex flex-col gap-3 sm:flex-row">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "var(--pos-status-warning-bg)",
            color: "var(--pos-status-warning-text)",
          }}
        >
          <Wallet className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-[var(--text-strong)]">
            Moving cash needs the line
            {isOffline ? <PosStatusPill tone="warning">Offline</PosStatusPill> : null}
          </h3>
          <p className="mt-1.5 max-w-[68ch] text-sm leading-6 text-[var(--text-muted)]">
            Write cash moved while offline on the safe log, and enter it on Shift before
            you cash up.
          </p>
        </div>
      </div>
    </PosPanel>
  );
}
