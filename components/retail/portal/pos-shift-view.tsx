"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { FieldHelp } from "@/components/shared/field-help";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useReservedId } from "@/hooks/use-reserved-id";
import { Clock, Payments, Wallet } from "@/lib/icons";
import { PosNumericField } from "./pos-numeric-field";
import { PosNumericKeypad } from "./pos-numeric-keypad";
import { applyPosKeypadAction, type PosKeypadAction } from "./pos-numeric-input";
import { PosMetricCard, PosPanel, PosPanelHeader, PosStatusPill } from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import { money, round } from "./pos-utils";

type CloseoutSummary = {
  shiftNo: string;
  expectedCash: number;
  countedCash: number;
  variance: number;
};

export function PosShiftView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sites, currentShift } = usePosPortalState();
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerCode, setRegisterCode] = useState("");
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

  const openShiftMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/shifts", {
        method: "POST",
        body: JSON.stringify({
          shiftNo: shiftNo || undefined,
          siteId: selectedSiteId,
          registerName,
          registerCode: registerCode.trim() || undefined,
          openingFloat: Number(openingFloat || 0),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Shift opened", variant: "success" });
      setOpenDialog(false);
      setSelectedSiteId("");
      setRegisterName("");
      setRegisterCode("");
      setOpeningFloat("0");
      setCloseoutSummary(null);
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to open shift",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const closeShiftMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/retail/shifts/${currentShift?.id}/close`, {
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
      toast({
        title: "Unable to close shift",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const variancePreview = round(Number(countedCash || "0") - (currentShift?.expectedCash ?? 0));

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
      <div className="space-y-4 pb-1">
        <PosPanel>
          <PosPanelHeader
            eyebrow="Drawer control"
            title="Shift controls"
            description="Open the drawer, sell through the shift, then count cash and reconcile the variance calmly."
            actions={
              currentShift ? (
                <PosStatusPill tone="success">{currentShift.shiftNo}</PosStatusPill>
              ) : (
                <PosStatusPill tone="warning">Shift closed</PosStatusPill>
              )
            }
          />
          {closeoutSummary ? (
            <div className="mb-4 rounded-[1.1rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-3 text-sm">
              <div className="font-semibold text-[var(--text-strong)]">
                {closeoutSummary.shiftNo} closeout saved
              </div>
              <div className="mt-1 text-[var(--text-muted)]">
                Expected {money(closeoutSummary.expectedCash)} / Counted{" "}
                {money(closeoutSummary.countedCash)} / Variance{" "}
                {money(closeoutSummary.variance)}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PosMetricCard
              icon={Clock}
              label="Shift"
              value={currentShift?.shiftNo ?? "Not open"}
              meta={currentShift?.site?.name ?? "Open a shift to start selling"}
              tone={currentShift ? "brand" : "warning"}
            />
            <PosMetricCard
              icon={Payments}
              label="Register"
              value={currentShift?.registerName ?? "No register"}
              meta={currentShift?.actorRole ?? "Register assignment pending"}
              tone="neutral"
            />
            <PosMetricCard
              icon={Wallet}
              label="Expected cash"
              value={money(currentShift?.expectedCash ?? 0)}
              meta="Used during closeout"
              tone="warning"
            />
            <PosMetricCard
              icon={Payments}
              label="Net sales"
              value={money(currentShift?.netSalesValue ?? 0)}
              meta="Current shift performance"
              tone="success"
            />
          </div>
        </PosPanel>

        <PosPanel>
          <PosPanelHeader
            eyebrow="Primary action"
            title={currentShift ? "Close this shift" : "Open a new shift"}
            description={
              currentShift
                ? "Use the closeout flow to count cash, review variance, and finish the drawer."
                : "Start the register with a site, register, and opening float."
            }
          />
          <div className="flex flex-wrap gap-2">
            {!currentShift ? (
              <Button
                size="sm"
                className="min-h-11 px-5 text-[15px]"
                onClick={() => setOpenDialog(true)}
              >
                Open shift
              </Button>
            ) : (
              <Button
                size="sm"
                className="min-h-11 px-5 text-[15px]"
                onClick={() => setCloseDialog(true)}
              >
                Close shift
              </Button>
            )}
          </div>
        </PosPanel>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Open shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Shift setup
                  </p>
                  <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-strong)]">
                    Prepare the drawer before the first sale
                  </h3>
                </div>
                <PosStatusPill tone="brand">Open drawer</PosStatusPill>
              </div>
              <div className="mt-4 space-y-2">
                <label className="block text-sm font-medium text-[var(--text-strong)]">
                  Shift number
                </label>
                <Input value={shiftNo} readOnly disabled={isReserving} className="h-11" />
                <FieldHelp
                  error={reserveError ?? undefined}
                  hint={reserveError ? undefined : "Generated automatically."}
                />
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                  <div className="text-sm font-semibold text-[var(--text-strong)]">
                    Register details
                  </div>
                  <div className="mt-3 space-y-3">
                    <SearchableSelect
                      label="Site"
                      value={selectedSiteId}
                      options={siteOptions}
                      placeholder="Select site"
                      onValueChange={setSelectedSiteId}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-[var(--text-strong)]">
                          Register name
                        </label>
                        <Input
                          value={registerName}
                          onChange={(event) => setRegisterName(event.target.value)}
                          placeholder="Front till"
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-[var(--text-strong)]">
                          Register code
                        </label>
                        <Input
                          value={registerCode}
                          onChange={(event) => setRegisterCode(event.target.value)}
                          placeholder="Optional"
                          className="h-11"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                  <div className="text-sm font-semibold text-[var(--text-strong)]">
                    Opening float
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    Enter the cash placed in the drawer before trading starts.
                  </p>
                  <div className="mt-3">
                    <PosNumericField
                      label="Opening float"
                      value={openingFloat}
                      active={activeNumericTarget === "opening_float"}
                      onActivate={() => setActiveNumericTarget("opening_float")}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                <div className="text-sm font-semibold text-[var(--text-strong)]">
                  Amount keypad
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  Keep numeric entry quick on touch devices and shared terminals.
                </p>
                <div className="mt-4">
                  <PosNumericKeypad onAction={handleKeypadAction} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => openShiftMutation.mutate()}
              disabled={openShiftMutation.isPending || !selectedSiteId || !registerName}
            >
              Open shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{currentShift?.shiftNo ?? "Close shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Closeout
                  </p>
                  <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-strong)]">
                    Count the drawer and reconcile the shift
                  </h3>
                </div>
                <PosStatusPill
                  tone={
                    variancePreview === 0
                      ? "success"
                      : variancePreview > 0
                        ? "warning"
                        : "danger"
                  }
                >
                  {variancePreview === 0
                    ? "Balanced"
                    : variancePreview > 0
                      ? "Over"
                      : "Short"}
                </PosStatusPill>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <PosMetricCard
                icon={Wallet}
                label="Opening float"
                value={money(currentShift?.openingFloat ?? 0)}
                meta="Cash placed in the drawer at start"
                tone="neutral"
              />
              <PosMetricCard
                icon={Wallet}
                label="Expected cash"
                value={money(currentShift?.expectedCash ?? 0)}
                meta="What the drawer should contain now"
                tone="warning"
              />
              <PosMetricCard
                icon={Payments}
                label="Net sales"
                value={money(currentShift?.netSalesValue ?? 0)}
                meta="Sales posted during this shift"
                tone="success"
              />
              <PosMetricCard
                icon={Payments}
                label="Refunds"
                value={money(currentShift?.refundValue ?? 0)}
                meta="Refund value already posted"
                tone="danger"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                  <div className="text-sm font-semibold text-[var(--text-strong)]">
                    Counted cash
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    Tap the amount field, count the drawer, then compare against the expected cash.
                  </p>
                  <div className="mt-3">
                    <PosNumericField
                      label="Counted cash"
                      value={countedCash}
                      active={activeNumericTarget === "counted_cash"}
                      onActivate={() => setActiveNumericTarget("counted_cash")}
                    />
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--text-strong)]">
                      Variance
                    </div>
                    <PosStatusPill
                      tone={
                        variancePreview === 0
                          ? "success"
                          : variancePreview > 0
                            ? "warning"
                            : "danger"
                      }
                    >
                      {money(variancePreview)}
                    </PosStatusPill>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    Positive means extra cash is in the drawer. Negative means the drawer is short.
                  </p>
                </div>

                <div className="space-y-2 rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                  <label className="block text-sm font-medium text-[var(--text-strong)]">
                    Closeout notes
                  </label>
                  <Textarea
                    value={closeNotes}
                    onChange={(event) => setCloseNotes(event.target.value)}
                    rows={3}
                    placeholder="Optional notes for variance, handoff, or manager review"
                  />
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4">
                <div className="text-sm font-semibold text-[var(--text-strong)]">
                  Amount keypad
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  Keep closeout entry fast and consistent with checkout and refund flows.
                </p>
                <div className="mt-4">
                  <PosNumericKeypad onAction={handleKeypadAction} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCloseDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => closeShiftMutation.mutate()}
              disabled={closeShiftMutation.isPending}
            >
              Close shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
