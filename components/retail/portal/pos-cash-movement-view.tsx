"use client";

/**
 * Cash drop / pickup, at the till.
 *
 * S-7.1, and the screen `docs/design-system/portals/pos.html` puts under
 * *Cash → Move cash* (`renderCashDrop`): a mode toggle, the drawer counted by
 * denomination with a −/+ stepper per row, a running total, a reason from a fixed
 * list, an optional note for the safe log, and a confirm that names the amount and
 * is dead at zero.
 *
 * ── Where it departs from the prototype, and why ───────────────────────────
 *
 * - **Three modes, not two.** The prototype toggles drop and pickup. It has no
 *   concept of a payout — cash out of the drawer to a supplier on delivery — and a
 *   bottle store does that, so `RetailCashMovementType` has the third value and the
 *   toggle has a third position. The inbound one keeps the prototype's words,
 *   "Pickup from safe", because that is the label a cashier is being trained on;
 *   the enum behind it is `FLOAT_TOP_UP`, where the direction cannot be misread.
 * - **The steppers are the till's keys.** The prototype uses bare `<input
 *   type=number>` boxes. This is a touch terminal with a deliberate key style —
 *   raised, with a 3px shadow that collapses on press — and the denomination rows
 *   use it, so counting a bundle feels like the rest of the till rather than a web
 *   form. The keypad stays for the currencies with no denomination set configured.
 * - **The reason is a code, not a string.** Same list, but stored as
 *   `RetailCashMovementReason` so a Z-report can group by it. "Other" makes the
 *   free-text note compulsory.
 *
 * The list below the form is the other half of the ticket. `expectedCash` is now a
 * figure with a history, and a variance nobody can account for is exactly what this
 * work exists to prevent — so the movements sit next to it, each with the signed
 * amount it took off or put on, and the bundle it was counted in.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Coins, Download, Minus, Plus, Upload, type LucideIcon } from "@/lib/icons";
import {
  RETAIL_CASH_MOVEMENT_LABELS,
  RETAIL_CASH_MOVEMENT_REASONS,
  RETAIL_CASH_MOVEMENT_REASON_LABELS,
  RETAIL_CASH_MOVEMENT_TYPES,
  getCashDenominations,
  type CashDenominationBreakdown,
  type RetailCashMovementReasonCode,
  type RetailCashMovementTypeName,
} from "@/lib/retail/cash-movements";
import { PosNumericField } from "./pos-numeric-field";
import { PosNumericKeypad } from "./pos-numeric-keypad";
import { applyPosKeypadAction, type PosKeypadAction } from "./pos-numeric-input";
import { PosPanel, PosPanelHeader, PosStatusPill, PosTerminalHeader } from "./pos-primitives";
import { money, round } from "./pos-utils";

export type PosCashMovement = {
  id: string;
  type: RetailCashMovementTypeName;
  amount: number;
  currency: string;
  baseAmount: number;
  /** Signed effect on expected cash. The server decides the sign, not this file. */
  delta: number;
  reasonCode: RetailCashMovementReasonCode;
  reason: string | null;
  denominations: CashDenominationBreakdown | null;
  recordedByName: string | null;
  createdAt: string;
};

type CashMovementPayload = {
  data: PosCashMovement[];
  summary: { shiftId: string; count: number; net: number };
};

const MOVEMENT_ICON: Record<RetailCashMovementTypeName, LucideIcon> = {
  DROP_TO_SAFE: Download,
  FLOAT_TOP_UP: Upload,
  PAYOUT: Coins,
};

/** The prototype's own words for the two modes it has, plus ours for the third. */
const MOVEMENT_MODE_LABEL: Record<RetailCashMovementTypeName, string> = {
  DROP_TO_SAFE: "Drop to safe",
  FLOAT_TOP_UP: "Pickup from safe",
  PAYOUT: "Pay out",
};

/** One line of plain language per mode, in the register of the rest of the till. */
const MOVEMENT_BLURB: Record<RetailCashMovementTypeName, string> = {
  DROP_TO_SAFE: "Cash out of the drawer to the safe. Comes off what the drawer should hold.",
  FLOAT_TOP_UP: "Cash in from the safe, usually small notes for change. Adds to it.",
  PAYOUT: "Cash out to a supplier or from petty cash. Comes off, and it is not coming back.",
};

/** The counted bundle, as `{ [denomination]: count }` while it is being keyed. */
type DenominationCounts = Record<string, number>;

/**
 * The shift's movements. Exported so the cash-up screen shares one query key with
 * the dialog and a refetch is a single invalidation.
 */
export function usePosCashMovements(shiftId: string | null | undefined) {
  return useQuery({
    queryKey: ["retail-cash-movements", shiftId],
    queryFn: () =>
      fetchJson<CashMovementPayload>(`/api/v2/retail/shifts/${shiftId}/cash-movements`),
    enabled: Boolean(shiftId),
  });
}

/** How a stored breakdown reads on one line: `3×$100 · 2×$20`. */
function describeBreakdown(breakdown: CashDenominationBreakdown | null) {
  if (!breakdown || breakdown.lines.length === 0) return null;
  return breakdown.lines
    .filter((line) => line.count > 0)
    .map((line) => `${line.count}×${line.denomination}`)
    .join(" · ");
}

/* ─── The list, shown beside the cash-up figure ───────────────────── */

export function PosCashMovementList({
  movements,
  net,
  openingFloat,
  expectedCash,
}: {
  movements: PosCashMovement[];
  net: number;
  openingFloat: number;
  expectedCash: number;
}) {
  if (movements.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Nothing has left or entered the drawer since it was opened with{" "}
        {money(openingFloat)}.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {movements.map((movement) => {
        const Icon = MOVEMENT_ICON[movement.type];
        const isIn = movement.delta > 0;
        const bundle = describeBreakdown(movement.denominations);
        return (
          <div
            key={movement.id}
            className="flex items-start gap-3 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-3"
          >
            <span
              className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{
                background: isIn
                  ? "var(--pos-status-success-bg)"
                  : "var(--pos-status-warning-bg)",
                color: isIn
                  ? "var(--pos-status-success-text)"
                  : "var(--pos-status-warning-text)",
              }}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-[var(--text-strong)]">
                {RETAIL_CASH_MOVEMENT_LABELS[movement.type]}
                <span className="ml-2 font-normal text-[var(--text-muted)]">
                  {RETAIL_CASH_MOVEMENT_REASON_LABELS[movement.reasonCode]}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                {movement.recordedByName ?? "Unknown"}
                {/* Only worth showing when it differs from the base figure. */}
                {movement.amount !== movement.baseAmount
                  ? ` · ${money(movement.amount)} ${movement.currency}`
                  : ""}
                {bundle ? ` · ${bundle}` : ""}
              </div>
              {movement.reason ? (
                <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
                  {movement.reason}
                </div>
              ) : null}
            </div>
            <span
              className="shrink-0 font-mono text-[13px] font-black tabular-nums"
              style={{
                color: isIn
                  ? "var(--pos-status-success-text)"
                  : "var(--pos-status-warning-text)",
              }}
            >
              {isIn ? "+" : "−"}
              {money(Math.abs(movement.delta))}
            </span>
          </div>
        );
      })}

      {/*
        The arithmetic, spelled out. This is the sentence a cashier can point at
        when the drawer holds less than the receipts say it should.
      */}
      <div className="rounded-xl border border-[var(--edge-default)] bg-[var(--surface-base)] px-4 py-3 text-xs text-[var(--text-muted)]">
        <span className="font-mono tabular-nums">{money(openingFloat)}</span> float
        {" + cash takings "}
        {net === 0 ? null : (
          <>
            {net > 0 ? "+ " : "− "}
            <span className="font-mono tabular-nums">{money(Math.abs(net))}</span>
            {" moved "}
          </>
        )}
        {"= expected "}
        <span className="font-mono font-bold tabular-nums text-[var(--text-strong)]">
          {money(expectedCash)}
        </span>
      </div>
    </div>
  );
}

/* ─── One denomination row ────────────────────────────────────────── */

const STEPPER_BASE =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border font-black transition-all duration-75 active:translate-y-[2px] disabled:opacity-40";

function stepperStyle(): React.CSSProperties {
  return {
    background: "var(--pos-key-bg)",
    borderColor: "var(--pos-key-border)",
    boxShadow: "0 3px 0 var(--pos-key-shadow)",
    color: "var(--pos-key-text)",
  };
}

function DenominationRow({
  denomination,
  count,
  onChange,
}: {
  denomination: string;
  count: number;
  onChange: (next: number) => void;
}) {
  const lineTotal = round(Number(denomination) * count);
  return (
    <div className="flex items-center gap-2 border-b border-[var(--edge-subtle)] py-1.5 last:border-b-0">
      <span className="w-16 shrink-0 font-mono text-[13px] font-bold tabular-nums text-[var(--text-strong)]">
        {denomination}
      </span>
      <button
        type="button"
        aria-label={`One fewer ${denomination}`}
        className={STEPPER_BASE}
        style={stepperStyle()}
        disabled={count <= 0}
        onClick={() => onChange(Math.max(0, count - 1))}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span
        className="min-w-[3rem] flex-1 text-center font-mono text-[15px] font-black tabular-nums"
        style={{ color: count > 0 ? "var(--text-strong)" : "var(--text-muted)" }}
      >
        {count}
      </span>
      <button
        type="button"
        aria-label={`One more ${denomination}`}
        className={STEPPER_BASE}
        style={stepperStyle()}
        onClick={() => onChange(count + 1)}
      >
        <Plus className="h-4 w-4" />
      </button>
      <span
        className="w-20 shrink-0 text-right font-mono text-[13px] tabular-nums"
        style={{ color: count > 0 ? "var(--text-strong)" : "var(--text-muted)" }}
      >
        {money(lineTotal)}
      </span>
    </div>
  );
}

/* ─── The panel and its dialog ────────────────────────────────────── */

export function PosCashMovementPanel({
  shiftId,
  shiftNo,
  openingFloat,
  expectedCash,
  // The company's base currency, which is what `openingFloat` and `expectedCash`
  // are in. USD only as the fallback `resolveBaseCurrency` itself uses.
  currency = "USD",
}: {
  shiftId: string;
  shiftNo: string;
  openingFloat: number;
  expectedCash: number;
  currency?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const movementsQuery = usePosCashMovements(shiftId);
  const movements = useMemo(() => movementsQuery.data?.data ?? [], [movementsQuery.data]);
  const net = movementsQuery.data?.summary.net ?? 0;

  const denominations = getCashDenominations(currency);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RetailCashMovementTypeName>("DROP_TO_SAFE");
  const [counts, setCounts] = useState<DenominationCounts>({});
  /** Only used when the currency has no configured denominations. */
  const [keyedAmount, setKeyedAmount] = useState("");
  const [reasonCode, setReasonCode] = useState<RetailCashMovementReasonCode>(
    RETAIL_CASH_MOVEMENT_REASONS.DROP_TO_SAFE[0],
  );
  const [reason, setReason] = useState("");

  /**
   * The bundle, added up. In whole cents, then divided once — `0.1 * 3` in a double
   * is 0.30000000000000004, and this figure is what the confirm button promises.
   * The server recomputes it in `Decimal` and refuses a mismatch regardless.
   */
  const total = useMemo(() => {
    if (!denominations) return round(Number(keyedAmount || "0"));
    const cents = denominations.reduce(
      (sum, denomination) =>
        sum + Math.round(Number(denomination) * 100) * (counts[denomination] ?? 0),
      0,
    );
    return cents / 100;
  }, [counts, denominations, keyedAmount]);

  const reset = () => {
    setType("DROP_TO_SAFE");
    setCounts({});
    setKeyedAmount("");
    setReasonCode(RETAIL_CASH_MOVEMENT_REASONS.DROP_TO_SAFE[0]);
    setReason("");
  };

  const pickType = (next: RetailCashMovementTypeName) => {
    setType(next);
    // The reason list is per direction, so a reason picked for a drop must not
    // survive a switch to a payout.
    setReasonCode(RETAIL_CASH_MOVEMENT_REASONS[next][0]);
  };

  const recordMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ data: PosCashMovement; shift: { expectedCash: number } }>(
        `/api/v2/retail/shifts/${shiftId}/cash-movements`,
        {
          method: "POST",
          body: JSON.stringify({
            type,
            amount: total,
            currency,
            reasonCode,
            reason: reason.trim() || undefined,
            denominations: denominations
              ? denominations
                  .filter((denomination) => (counts[denomination] ?? 0) > 0)
                  .map((denomination) => ({
                    denomination,
                    count: counts[denomination] ?? 0,
                  }))
              : undefined,
          }),
        },
      ),
    onSuccess: (result) => {
      toast({
        title: `${MOVEMENT_MODE_LABEL[type]} recorded`,
        description: `Expected cash is now ${money(result.shift.expectedCash)}.`,
        variant: "success",
      });
      setOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ["retail-cash-movements", shiftId] });
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to record the movement",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const handleKeypadAction = (action: PosKeypadAction) => {
    setKeyedAmount((current) => applyPosKeypadAction(current, action));
  };

  const needsWords = reasonCode === "OTHER" && !reason.trim();

  return (
    <>
      <PosPanel>
        <PosPanelHeader
          eyebrow="Cash"
          title="Move cash"
          description="Take cash out of the drawer to the safe, bring change in from it, or pay something out. Every movement counts against what the drawer should hold at cash-up."
          actions={
            <Button
              size="sm"
              variant="outline"
              className="h-12 rounded-xl px-6 text-[14px] font-bold"
              onClick={() => setOpen(true)}
            >
              <Download className="h-4 w-4" />
              Move cash
            </Button>
          }
        />
        <PosCashMovementList
          movements={movements}
          net={net}
          openingFloat={openingFloat}
          expectedCash={expectedCash}
        />
      </PosPanel>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-2xl">
          <PosTerminalHeader
            eyebrow="Cash"
            title="Cash drop / pickup"
            subtitle={`${shiftNo} · expected ${money(expectedCash)}`}
            valuePrimary={money(total)}
            valueSecondary={MOVEMENT_MODE_LABEL[type]}
          />

          <div className="space-y-4 p-5">
            {/* Mode */}
            <div className="grid grid-cols-3 gap-2">
              {RETAIL_CASH_MOVEMENT_TYPES.map((candidate) => {
                const Icon = MOVEMENT_ICON[candidate];
                const isActive = candidate === type;
                return (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => pickType(candidate)}
                    aria-pressed={isActive}
                    className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-xl border text-[12px] font-bold transition-all duration-100 active:translate-y-[2px]"
                    style={
                      isActive
                        ? {
                            background: "var(--pos-cta-bg)",
                            borderColor: "var(--pos-cta-bg)",
                            boxShadow: "0 3px 0 var(--pos-cta-shadow)",
                            color: "var(--pos-cta-text)",
                          }
                        : {
                            background: "var(--pos-key-bg)",
                            borderColor: "var(--pos-key-border)",
                            boxShadow: "0 3px 0 var(--pos-key-shadow)",
                            color: "var(--pos-key-text)",
                          }
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {MOVEMENT_MODE_LABEL[candidate]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[var(--text-muted)]">{MOVEMENT_BLURB[type]}</p>

            {/* Count the bundle */}
            {denominations ? (
              <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    Denominations · {currency}
                  </p>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-[var(--text-muted)] underline-offset-2 hover:underline"
                    onClick={() => setCounts({})}
                  >
                    Clear count
                  </button>
                </div>
                {denominations.map((denomination) => (
                  <DenominationRow
                    key={denomination}
                    denomination={denomination}
                    count={counts[denomination] ?? 0}
                    onChange={(next) =>
                      setCounts((current) => ({ ...current, [denomination]: next }))
                    }
                  />
                ))}
                <div className="mt-2 flex items-center justify-between border-t-2 border-[var(--edge-default)] pt-3">
                  <span className="text-[13px] font-bold text-[var(--text-strong)]">
                    {type === "FLOAT_TOP_UP" ? "Picking up" : "Moving"}
                  </span>
                  <span className="font-mono text-[1.15rem] font-black tabular-nums text-[var(--text-strong)]">
                    {money(total)}
                  </span>
                </div>
              </div>
            ) : (
              /*
                No denomination set is configured for this currency, so the bundle
                cannot be counted honestly. The keypad takes the total instead —
                which is exactly what the till did before this ticket — rather than
                offering a made-up set of notes to tick off.
              */
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
                <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                  <p className="mb-1 text-[13px] font-bold text-[var(--text-strong)]">
                    How much
                  </p>
                  <p className="mb-3 text-xs text-[var(--text-muted)]">
                    No note denominations are set up for {currency}. Count the cash and
                    key the total.
                  </p>
                  <PosNumericField label="Amount" value={keyedAmount} active onActivate={() => {}} />
                </div>
                <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                  <p className="mb-3 text-[13px] font-bold text-[var(--text-strong)]">Keypad</p>
                  <PosNumericKeypad onAction={handleKeypadAction} />
                </div>
              </div>
            )}

            {/* Reason */}
            <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
              <p className="mb-3 text-[13px] font-bold text-[var(--text-strong)]">Reason</p>
              <div className="flex flex-wrap gap-2">
                {RETAIL_CASH_MOVEMENT_REASONS[type].map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => setReasonCode(candidate)}
                    aria-pressed={reasonCode === candidate}
                    className="min-h-11 rounded-xl border px-3 text-[12px] font-semibold transition-all duration-100 active:translate-y-[2px]"
                    style={
                      reasonCode === candidate
                        ? {
                            background: "var(--pos-status-info-bg)",
                            borderColor: "var(--pos-status-info-ring)",
                            color: "var(--pos-status-info-text)",
                          }
                        : {
                            background: "var(--surface-base)",
                            borderColor: "var(--edge-default)",
                            color: "var(--text-muted)",
                          }
                    }
                  >
                    {RETAIL_CASH_MOVEMENT_REASON_LABELS[candidate]}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-xs font-medium text-[var(--text-muted)]">
                {reasonCode === "OTHER" ? "Say why" : "Note (optional)"}
              </label>
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Receipt number for the safe log, etc."
                className="mt-1 h-11"
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--edge-default)] bg-[var(--surface-muted)] px-4 py-3">
              <span className="text-xs text-[var(--text-muted)]">
                Expected cash after this
              </span>
              <PosStatusPill tone={total > 0 ? "warning" : "neutral"}>
                <span className="font-mono tabular-nums">
                  {money(
                    round(
                      type === "FLOAT_TOP_UP" ? expectedCash + total : expectedCash - total,
                    ),
                  )}
                </span>
              </PosStatusPill>
            </div>
          </div>

          <DialogFooter className="border-t border-[var(--border-subtle)] px-5 py-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => recordMutation.mutate()}
              disabled={recordMutation.isPending || total <= 0 || needsWords}
              style={{
                background: "var(--pos-cta-bg)",
                color: "var(--pos-cta-text)",
                boxShadow: "0 3px 0 var(--pos-cta-shadow)",
              }}
              className="active:translate-y-[2px] active:shadow-none"
            >
              {MOVEMENT_MODE_LABEL[type]} {money(total)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
