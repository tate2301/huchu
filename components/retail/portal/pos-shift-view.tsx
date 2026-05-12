"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { FieldHelp } from "@/components/shared/field-help";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useReservedId } from "@/hooks/use-reserved-id";
import { CheckCircle2, Clock, Payments, TrendingDown, TrendingUp, Wallet } from "@/lib/icons";
import { PosNumericField } from "./pos-numeric-field";
import { PosNumericKeypad } from "./pos-numeric-keypad";
import { applyPosKeypadAction, type PosKeypadAction } from "./pos-numeric-input";
import { PosMetricCard, PosPanel, PosPanelHeader, PosStatusPill } from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import { money, round } from "./pos-utils";
import { cn } from "@/lib/utils";

type CloseoutSummary = {
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
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-black",
          isBalanced
            ? "bg-emerald-100 text-emerald-700"
            : isOver
              ? "bg-amber-100 text-amber-700"
              : "bg-red-100 text-red-700",
        )}>
          {isBalanced ? (
            <><CheckCircle2 className="h-3.5 w-3.5" /> Balanced</>
          ) : isOver ? (
            <><TrendingUp className="h-3.5 w-3.5" /> Over {money(Math.abs(variance))}</>
          ) : (
            <><TrendingDown className="h-3.5 w-3.5" /> Short {money(Math.abs(variance))}</>
          )}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            isBalanced ? "bg-emerald-500" : isOver ? "bg-amber-400" : "bg-red-500",
          )}
          style={{ width: isBalanced ? "100%" : `${pct}%`, minWidth: isBalanced ? undefined : "4px" }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-[var(--text-muted)]">
        <span>Expected {money(expected)}</span>
        {!isBalanced && (
          <span className={isOver ? "text-amber-600" : "text-red-600"}>
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
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedRegisterId, setSelectedRegisterId] = useState("");
  const [openingFloat, setOpeningFloat] = useState("0");
  const [countedCash, setCountedCash] = useState("");
  const [activeNumericTarget, setActiveNumericTarget] = useState<"opening_float" | "counted_cash" | null>(null);
  const [closeNotes, setCloseNotes] = useState("");
  const [closeoutSummary, setCloseoutSummary] = useState<CloseoutSummary | null>(null);

  const { reservedId: shiftNo, isReserving, error: reserveError } = useReservedId({
    entity: "RETAIL_SHIFT",
    enabled: openDialog && Boolean(selectedSiteId),
    siteId: selectedSiteId || undefined,
  });

  const siteOptions = useMemo<SearchableOption[]>(
    () => sites.map((site) => ({ value: site.id, label: site.name, meta: site.code })),
    [sites],
  );
  const selectedSite =
    sites.find((site) => site.id === selectedSiteId) ?? null;
  const registerOptions = useMemo<SearchableOption[]>(
    () =>
      (selectedSite?.registers ?? []).map((register) => ({
        value: register.id,
        label: register.name,
        meta: register.code,
      })),
    [selectedSite?.registers],
  );
  const selectedRegister =
    selectedSite?.registers.find((register) => register.id === selectedRegisterId) ??
    null;

  useEffect(() => {
    if (!openDialog) return;
    if (!selectedSiteId) {
      const fallbackSiteId =
        defaultSiteId ??
        sites.find((site) => site.registers.length > 0)?.id ??
        sites[0]?.id ??
        "";
      if (fallbackSiteId) {
        setSelectedSiteId(fallbackSiteId);
      }
    }
  }, [defaultSiteId, openDialog, selectedSiteId, sites]);

  useEffect(() => {
    if (!openDialog || !selectedSite) return;
    const hasSelectedRegister = selectedSite.registers.some(
      (register) => register.id === selectedRegisterId,
    );
    if (hasSelectedRegister) return;

    const fallbackRegisterId =
      (selectedSite.id === defaultSiteId &&
      defaultRegisterId &&
      selectedSite.registers.some((register) => register.id === defaultRegisterId)
        ? defaultRegisterId
        : null) ??
      selectedSite.registers[0]?.id ??
      "";

    setSelectedRegisterId(fallbackRegisterId);
  }, [
    defaultRegisterId,
    defaultSiteId,
    openDialog,
    selectedRegisterId,
    selectedSite,
  ]);

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
      setSelectedSiteId("");
      setSelectedRegisterId("");
      setOpeningFloat("0");
      setCloseoutSummary(null);
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
    },
    onError: (error) =>
      toast({ title: "Unable to open shift", description: getApiErrorMessage(error), variant: "destructive" }),
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
      setCloseoutSummary({
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
      toast({ title: "Unable to close shift", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const variancePreview = round(Number(countedCash || "0") - (currentShift?.expectedCash ?? 0));
  const varianceIsBalanced = Math.abs(variancePreview) < 0.01;

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
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Drawer control
              </p>
              <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.03em] text-[var(--text-strong)]">
                {currentShift
                  ? `Shift ${currentShift.shiftNo} — ${currentShift.registerName}`
                  : "No active shift"}
              </h2>
              {currentShift?.site?.name && (
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">{currentShift.site.name}</p>
              )}
            </div>
            <PosStatusPill tone={currentShift ? "success" : "warning"}>
              {currentShift ? "Open" : "Closed"}
            </PosStatusPill>
          </div>

          {/* Closeout result banner */}
          {closeoutSummary && (
            <div className={cn(
              "mb-5 flex items-center gap-4 rounded-2xl px-5 py-4",
              Math.abs(closeoutSummary.variance) < 0.01
                ? "border border-emerald-200 bg-emerald-50"
                : closeoutSummary.variance > 0
                  ? "border border-amber-200 bg-amber-50"
                  : "border border-red-100 bg-red-50",
            )}>
              <CheckCircle2 className={cn(
                "h-6 w-6 shrink-0",
                Math.abs(closeoutSummary.variance) < 0.01 ? "text-emerald-600" : closeoutSummary.variance > 0 ? "text-amber-600" : "text-red-500",
              )} />
              <div>
                <div className="text-sm font-bold text-[var(--text-strong)]">
                  {closeoutSummary.shiftNo} closed
                </div>
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Expected {money(closeoutSummary.expectedCash)} · Counted {money(closeoutSummary.countedCash)} · Variance {money(closeoutSummary.variance)}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PosMetricCard
              icon={Clock}
              label="Shift"
              value={currentShift?.shiftNo ?? "Not open"}
              meta={currentShift?.site?.name ?? "Open to start selling"}
              tone={currentShift ? "brand" : "warning"}
            />
            <PosMetricCard
              icon={Wallet}
              label="Net sales"
              value={money(currentShift?.netSalesValue ?? 0)}
              meta={`${currentShift?.saleCount ?? 0} sale${(currentShift?.saleCount ?? 0) !== 1 ? "s" : ""}`}
              tone="success"
            />
            <PosMetricCard
              icon={Payments}
              label="Expected cash"
              value={money(currentShift?.expectedCash ?? 0)}
              meta="Float + cash sales"
              tone="warning"
            />
            <PosMetricCard
              icon={Payments}
              label="Non-cash"
              value={money(currentShift?.nonCashSales ?? 0)}
              meta="Card, mobile, transfer"
              tone="neutral"
            />
          </div>
        </PosPanel>

        {/* ── Primary action ────────────────────────────── */}
        <PosPanel>
          <PosPanelHeader
            eyebrow="Action"
            title={currentShift ? "Close this shift" : "Open a new shift"}
            description={
              currentShift
                ? "Count the cash drawer, reconcile the variance, and finish your trading period."
                : "Select a site and register, then enter the opening float to begin selling."
            }
            className="mb-4"
          />
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
        </PosPanel>
      </div>

      {/* ══ Open Shift Dialog ══════════════════════════════════════════ */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Open shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Shift number */}
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Shift number
                </p>
                <PosStatusPill tone="brand">Auto-generated</PosStatusPill>
              </div>
              <Input value={shiftNo} readOnly disabled={isReserving} className="h-11 font-mono font-bold" />
              <FieldHelp
                error={reserveError ?? undefined}
                hint={reserveError ? undefined : "Generated automatically when a site is selected."}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-4">
                {/* Register */}
                <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                  <p className="mb-3 text-[13px] font-bold text-[var(--text-strong)]">Register details</p>
                  <div className="space-y-3">
                    <SearchableSelect
                      label="Site"
                      value={selectedSiteId}
                      options={siteOptions}
                      placeholder="Select site"
                      onValueChange={setSelectedSiteId}
                    />
                    <SearchableSelect
                      label="Register"
                      value={selectedRegisterId}
                      options={registerOptions}
                      placeholder={
                        !selectedSiteId
                          ? "Select site first"
                          : registerOptions.length > 0
                            ? "Select register"
                            : "No registers configured"
                      }
                      searchPlaceholder="Search registers"
                      onValueChange={setSelectedRegisterId}
                      disabled={!selectedSiteId || registerOptions.length === 0}
                    />
                    <FieldHelp
                      hint={
                        !selectedSiteId
                          ? "Choose the branch first."
                          : selectedRegister
                            ? `Shift will open on ${selectedRegister.name}.`
                            : "Ask a manager or admin to provision a register name for this branch in setup."
                      }
                    />
                  </div>
                </div>

                {/* Float */}
                <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                  <p className="mb-1 text-[13px] font-bold text-[var(--text-strong)]">Opening float</p>
                  <p className="mb-3 text-xs text-[var(--text-muted)]">Cash placed in the drawer before trading starts.</p>
                  <PosNumericField
                    label="Float amount"
                    value={openingFloat}
                    active={activeNumericTarget === "opening_float"}
                    onActivate={() => setActiveNumericTarget("opening_float")}
                  />
                </div>
              </div>

              {/* Keypad */}
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
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
          {/* Header */}
          <div className={cn(
            "px-6 pt-6 pb-5 border-b",
            varianceIsBalanced
              ? "bg-gradient-to-r from-emerald-50 to-transparent border-emerald-100"
              : variancePreview > 0
                ? "bg-gradient-to-r from-amber-50 to-transparent border-amber-100"
                : "bg-gradient-to-r from-red-50 to-transparent border-red-100",
          )}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Closeout
                </p>
                <h3 className="mt-1 text-lg font-bold text-[var(--text-strong)]">
                  {currentShift?.shiftNo ?? "Close shift"}
                </h3>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                  {currentShift?.registerName} · {currentShift?.site?.name}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-[var(--text-muted)]">Net sales</div>
                <div className="font-mono text-xl font-black text-[var(--text-strong)]">
                  {money(currentShift?.netSalesValue ?? 0)}
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Shift summary */}
            <div className="grid grid-cols-2 gap-3">
              <PosMetricCard
                icon={Wallet}
                label="Opening float"
                value={money(currentShift?.openingFloat ?? 0)}
                meta="Cash at start"
                tone="neutral"
              />
              <PosMetricCard
                icon={Wallet}
                label="Expected cash"
                value={money(currentShift?.expectedCash ?? 0)}
                meta="What the drawer should have"
                tone="warning"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-4">
                {/* Counted cash input */}
                <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                  <p className="mb-1 text-[13px] font-bold text-[var(--text-strong)]">Count the drawer</p>
                  <p className="mb-3 text-xs text-[var(--text-muted)]">Tap the field, count the physical cash, enter the total.</p>
                  <PosNumericField
                    label="Counted cash"
                    value={countedCash}
                    active={activeNumericTarget === "counted_cash"}
                    onActivate={() => setActiveNumericTarget("counted_cash")}
                  />
                </div>

                {/* Live variance bar */}
                <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                  <VarianceBar
                    variance={variancePreview}
                    expected={currentShift?.expectedCash ?? 0}
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-[var(--text-strong)]">
                    Closeout notes <span className="text-[var(--text-muted)] font-normal">(optional)</span>
                  </label>
                  <Textarea
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    rows={3}
                    placeholder="Variance reason, handoff notes, or manager comments…"
                    className="resize-none"
                  />
                </div>
              </div>

              {/* Keypad */}
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
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
              className={cn(
                varianceIsBalanced
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-amber-500 hover:bg-amber-600",
              )}
            >
              Close shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
