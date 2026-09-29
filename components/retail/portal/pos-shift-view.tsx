"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { FieldHelp } from "@/components/shared/field-help";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useReservedId } from "@/hooks/use-reserved-id";
import { CheckCircle2, Clock, TrendingDown, TrendingUp, Wallet } from "@/lib/icons";
import {
  PosCashMovementList,
  PosCashMovementPanel,
  usePosCashMovements,
} from "./pos-cash-movement-view";
import { PosNumericField } from "./pos-numeric-field";
import { PosNumericKeypad } from "./pos-numeric-keypad";
import { applyPosKeypadAction, type PosKeypadAction } from "./pos-numeric-input";
import { PosMetricCard, PosPanel, PosTerminalHeader } from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import { money, round, signedMoney } from "./pos-utils";

type CashUpSummary = {
  shiftNo: string;
  expectedCash: number;
  countedCash: number;
  variance: number;
};

/* ─── Variance bar ────────────────────────────────────────────────── */
function VarianceBar({ variance, expected }: { variance: number; expected: number }) {
  const isBalanced = Math.abs(variance) < 0.01;
  const isOver = variance > 0;
  const pct = expected > 0 ? Math.min(Math.abs(variance) / expected, 1) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold text-[var(--text-muted)]">Variance</span>
        {isBalanced ? (
          <span className="font-mono text-[13px] font-bold tabular-nums text-[var(--text-strong)]">
            {money(0)}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-black ring-1"
            style={
              isOver
                ? { background: "var(--pos-status-warning-bg)", boxShadow: `inset 0 0 0 1px var(--pos-status-warning-ring)`, color: "var(--pos-status-warning-text)" }
                : { background: "var(--pos-status-danger-bg)", boxShadow: `inset 0 0 0 1px var(--pos-status-danger-ring)`, color: "var(--pos-status-danger-text)" }
            }
          >
            {isOver ? (
              <><TrendingUp className="h-3.5 w-3.5" /> Over {money(Math.abs(variance))}</>
            ) : (
              <><TrendingDown className="h-3.5 w-3.5" /> Short {money(Math.abs(variance))}</>
            )}
          </span>
        )}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-canvas)] ring-1 ring-[var(--edge-default)]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: isBalanced ? "100%" : `${pct}%`,
            minWidth: isBalanced ? undefined : "4px",
            background: isBalanced
              ? "var(--pos-status-success-text)"
              : isOver
                ? "var(--pos-status-warning-text)"
                : "var(--pos-status-danger-text)",
          }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-[var(--text-muted)]">
        <span>Expected {money(expected)}</span>
        {!isBalanced && (
          <span
            className="font-mono tabular-nums"
            style={{ color: isOver ? "var(--pos-status-warning-text)" : "var(--pos-status-danger-text)" }}
          >
            {isOver ? "+" : "−"}{money(Math.abs(variance))}
          </span>
        )}
      </div>
    </div>
  );
}

export function PosShiftView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sites, currentShift, defaultSiteId, defaultRegisterId } =
    usePosPortalState();
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [pickedSiteId, setPickedSiteId] = useState("");
  const [pickedRegisterId, setPickedRegisterId] = useState("");
  const [openingFloat, setOpeningFloat] = useState("0");
  const [countedCash, setCountedCash] = useState("");
  const [activeNumericTarget, setActiveNumericTarget] = useState<"opening_float" | "counted_cash" | null>(null);
  const [closeNotes, setCloseNotes] = useState("");
  const [cashUpSummary, setCashUpSummary] = useState<CashUpSummary | null>(null);

  const siteOptions = useMemo<SearchableOption[]>(
    () => sites.map((site) => ({ value: site.id, label: site.name, meta: site.code })),
    [sites],
  );
  /**
   * The site and register in force are derived during render, not stored and then
   * re-synced by an effect.
   *
   * The two effects this replaces each wrote a fallback into state, which is a
   * render behind the data it is a fallback for: the dialog opened showing no
   * register, then re-rendered with one. Deriving also removes the reset the old
   * code never had — a picked register that does not belong to the newly picked
   * site simply stops being picked, rather than lingering until an effect notices.
   *
   * `picked*` is the cashier's explicit choice and always wins while it remains
   * valid. Everything after it is the fallback chain the effects used to encode.
   */
  const pickedSiteIsValid = Boolean(pickedSiteId) && sites.some((site) => site.id === pickedSiteId);
  const selectedSiteId =
    (pickedSiteIsValid ? pickedSiteId : "") ||
    (defaultSiteId && sites.some((site) => site.id === defaultSiteId) ? defaultSiteId : "") ||
    sites.find((site) => site.registers.length > 0)?.id ||
    sites[0]?.id ||
    "";

  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? null;

  const registerOptions = useMemo<SearchableOption[]>(
    () =>
      (selectedSite?.registers ?? []).map((register) => ({
        value: register.id,
        label: register.name,
        meta: register.code,
      })),
    [selectedSite?.registers],
  );

  const registers = selectedSite?.registers ?? [];
  const selectedRegisterId =
    (pickedRegisterId && registers.some((register) => register.id === pickedRegisterId)
      ? pickedRegisterId
      : "") ||
    (selectedSite?.id === defaultSiteId &&
    defaultRegisterId &&
    registers.some((register) => register.id === defaultRegisterId)
      ? defaultRegisterId
      : "") ||
    registers[0]?.id ||
    "";

  // Sits below the derivations above: it reads `selectedSiteId`, which is now a
  // `const` computed during render rather than state declared at the top.
  const { reservedId: shiftNo, isReserving, error: reserveError } = useReservedId({
    entity: "RETAIL_SHIFT",
    enabled: openDialog && Boolean(selectedSiteId),
    siteId: selectedSiteId || undefined,
  });

  const openShiftMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/pos/shifts", {
        method: "POST",
        body: JSON.stringify({
          shiftNo: shiftNo || undefined,
          siteId: selectedSiteId,
          registerId: selectedRegisterId,
          openingFloat: Number(openingFloat || 0),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Shift opened", variant: "success" });
      setOpenDialog(false);
      setPickedSiteId("");
      setPickedRegisterId("");
      setOpeningFloat("0");
      setCashUpSummary(null);
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
    },
    onError: (error) =>
      toast({ title: "That shift was not opened", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const closeShiftMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/retail/pos/shifts/${currentShift?.id}/close`, {
        method: "POST",
        body: JSON.stringify({
          countedCash: Number(countedCash || 0),
          notes: closeNotes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      const expectedCash = currentShift?.expectedCash ?? 0;
      const countedCashValue = Number(countedCash || 0);
      setCashUpSummary({
        shiftNo: currentShift?.shiftNo ?? "Shift",
        expectedCash,
        countedCash: countedCashValue,
        variance: round(countedCashValue - expectedCash),
      });
      toast({ title: "Shift closed", variant: "success" });
      setCloseDialog(false);
      setCountedCash("");
      setCloseNotes("");
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
    },
    onError: (error) =>
      toast({ title: "That shift was not closed", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const variancePreview = round(Number(countedCash || "0") - (currentShift?.expectedCash ?? 0));

  /**
   * S-7.1. The cash-up dialog shows these underneath the expected figure, because
   * "expected $1,842.50" with no way to see the $200 that went to the safe is the
   * variance nobody can account for that this work exists to prevent.
   */
  const cashMovementsQuery = usePosCashMovements(currentShift?.id);
  const cashMovements = cashMovementsQuery.data?.data ?? [];
  const cashMovementsNet = cashMovementsQuery.data?.summary.net ?? 0;

  const handleKeypadAction = (action: PosKeypadAction) => {
    if (!activeNumericTarget) return;
    if (activeNumericTarget === "opening_float") {
      setOpeningFloat((current) => applyPosKeypadAction(current, action));
      return;
    }
    setCountedCash((current) => applyPosKeypadAction(current, action));
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1">
      <div className="space-y-4 pb-4">

        {/* ── Shift status ──────────────────────────────── */}
        <PosPanel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[var(--text-strong)]">
                {currentShift
                  ? `Shift ${currentShift.shiftNo} — ${currentShift.registerName}`
                  : "No shift open"}
              </h2>
              {currentShift?.site?.name && (
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">{currentShift.site.name}</p>
              )}
            </div>
            {!currentShift ? (
              <Button
                size="sm"
                className="h-12 px-6 text-[14px] font-bold rounded-xl"
                onClick={() => setOpenDialog(true)}
              >
                <Clock className="h-4 w-4" />
                Open shift
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-12 px-6 text-[14px] font-bold rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                onClick={() => setCloseDialog(true)}
              >
                Close shift
              </Button>
            )}
          </div>

          {/* The cash-up just taken */}
          {cashUpSummary && (
            <div
              className="mt-5 flex items-center gap-4 rounded-xl px-5 py-4 ring-1"
              style={
                Math.abs(cashUpSummary.variance) < 0.01
                  ? { background: "var(--pos-status-success-bg)", boxShadow: `inset 0 0 0 1px var(--pos-status-success-ring)` }
                  : cashUpSummary.variance > 0
                    ? { background: "var(--pos-status-warning-bg)", boxShadow: `inset 0 0 0 1px var(--pos-status-warning-ring)` }
                    : { background: "var(--pos-status-danger-bg)", boxShadow: `inset 0 0 0 1px var(--pos-status-danger-ring)` }
              }
            >
              <CheckCircle2
                className="h-6 w-6 shrink-0"
                style={{
                  color: Math.abs(cashUpSummary.variance) < 0.01
                    ? "var(--pos-status-success-text)"
                    : cashUpSummary.variance > 0
                      ? "var(--pos-status-warning-text)"
                      : "var(--pos-status-danger-text)",
                }}
              />
              <div>
                <div className="text-sm font-bold text-[var(--text-strong)]">
                  {cashUpSummary.shiftNo} closed
                </div>
                <div className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">
                  Expected {money(cashUpSummary.expectedCash)} · Counted {money(cashUpSummary.countedCash)} · Variance {signedMoney(cashUpSummary.variance)}
                </div>
              </div>
            </div>
          )}
        </PosPanel>

        {/* ── Cash drop / pickup ────────────────────────── */}
        {currentShift ? (
          <PosCashMovementPanel
            shiftId={currentShift.id}
            shiftNo={currentShift.shiftNo}
            openingFloat={currentShift.openingFloat}
            expectedCash={currentShift.expectedCash}
            currency={currentShift.baseCurrency}
          />
        ) : null}
      </div>

      {/* ══ Open Shift Dialog ══════════════════════════════════════════ */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
          <PosTerminalHeader title="Open shift" />
          <div className="space-y-4 p-5">
            {/* Shift number */}
            <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
              <p className="mb-3 text-[11px] font-semibold text-[var(--text-muted)]">
                Shift number
              </p>
              <Input
                value={shiftNo}
                readOnly
                disabled={isReserving}
                aria-label="Shift number"
                className="h-11 font-mono font-bold"
              />
              <FieldHelp error={reserveError ?? undefined} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-4">
                {/* Register */}
                <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                  <p className="mb-3 text-[13px] font-bold text-[var(--text-strong)]">Till</p>
                  <div className="space-y-3">
                    {/*
                      One branch is not a choice. The till resolves it and moves
                      the cashier straight to the register, which is the thing
                      they actually pick.
                    */}
                    {siteOptions.length > 1 ? (
                      <SearchableSelect
                        label="Site"
                        value={selectedSiteId}
                        options={siteOptions}
                        placeholder="Pick a site"
                        onValueChange={setPickedSiteId}
                      />
                    ) : null}
                    <SearchableSelect
                      label="Till"
                      value={selectedRegisterId}
                      options={registerOptions}
                      placeholder={
                        !selectedSiteId
                          ? "Pick a site first"
                          : registerOptions.length > 0
                            ? "Pick a till"
                            : "No tills at this site"
                      }
                      searchPlaceholder="Search tills"
                      onValueChange={setPickedRegisterId}
                      disabled={!selectedSiteId || registerOptions.length === 0}
                    />
                  </div>
                </div>

                {/* Float */}
                <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                  <PosNumericField
                    label="Float amount"
                    value={openingFloat}
                    active={activeNumericTarget === "opening_float"}
                    onActivate={() => setActiveNumericTarget("opening_float")}
                  />
                </div>
              </div>

              {/* Keypad */}
              <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                <p className="mb-3 text-[13px] font-bold text-[var(--text-strong)]">Keypad</p>
                <PosNumericKeypad onAction={handleKeypadAction} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={() => openShiftMutation.mutate()}
              disabled={
                openShiftMutation.isPending ||
                !selectedSiteId ||
                !selectedRegisterId
              }
            >
              Open shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Close Shift Dialog ════════════════════════════════════════ */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <PosTerminalHeader
            eyebrow="Cash up"
            title={currentShift?.shiftNo ?? "Close shift"}
            subtitle={[currentShift?.registerName, currentShift?.site?.name].filter(Boolean).join(" · ")}
            valuePrimary={money(currentShift?.netSalesValue ?? 0)}
            valueSecondary="Net sales"
          />

          <div className="p-5 space-y-4">
            {/* Shift summary */}
            <div className="grid grid-cols-2 gap-3">
              <PosMetricCard
                icon={Wallet}
                label="Opening float"
                value={money(currentShift?.openingFloat ?? 0)}
                tone="neutral"
              />
              <PosMetricCard
                icon={Wallet}
                label="Expected cash"
                value={money(currentShift?.expectedCash ?? 0)}
                tone="warning"
              />
            </div>

            {/*
              S-7.1. Why the expected figure is what it is. Without this the
              cashier sees a number $200 below the receipts and has nothing to
              point at — which is the shortfall-on-paper the ticket fixes.
            */}
            {currentShift && cashMovements.length > 0 ? (
              <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                <p className="mb-3 text-xs font-bold text-[var(--text-muted)]">
                  Cash moved this shift
                </p>
                <PosCashMovementList
                  movements={cashMovements}
                  net={cashMovementsNet}
                  openingFloat={currentShift.openingFloat}
                  expectedCash={currentShift.expectedCash}
                />
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-4">
                {/* Counted cash input */}
                <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                  <p className="mb-3 text-[13px] font-bold text-[var(--text-strong)]">Count the drawer</p>
                  <PosNumericField
                    label="Counted cash"
                    value={countedCash}
                    active={activeNumericTarget === "counted_cash"}
                    onActivate={() => setActiveNumericTarget("counted_cash")}
                  />
                </div>

                {/* Live variance bar */}
                <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                  <VarianceBar
                    variance={variancePreview}
                    expected={currentShift?.expectedCash ?? 0}
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-[var(--text-strong)]">
                    Notes <span className="text-[var(--text-muted)] font-normal">(optional)</span>
                  </label>
                  <Textarea
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>
              </div>

              {/* Keypad */}
              <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                <p className="mb-3 text-[13px] font-bold text-[var(--text-strong)]">Keypad</p>
                <PosNumericKeypad onAction={handleKeypadAction} />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-[var(--border-subtle)] px-5 py-4">
            <Button type="button" variant="outline" onClick={() => setCloseDialog(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={() => closeShiftMutation.mutate()}
              disabled={closeShiftMutation.isPending}
              style={{
                background: "var(--pos-cta-bg)",
                color: "var(--pos-cta-text)",
                boxShadow: "0 3px 0 var(--pos-cta-shadow)",
              }}
              className="active:translate-y-[2px] active:shadow-none"
            >
              Close shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
