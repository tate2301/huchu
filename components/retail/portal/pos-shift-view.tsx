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

  return (
    <div className="space-y-3">
      {closeoutSummary ? (
        <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3 text-sm">
          <div className="font-semibold">{closeoutSummary.shiftNo} closeout saved</div>
          <div className="mt-1 text-[var(--text-muted)]">
            Expected {money(closeoutSummary.expectedCash)} | Counted {money(closeoutSummary.countedCash)} | Variance {money(closeoutSummary.variance)}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Shift
          </div>
          <div className="mt-2 font-mono text-base font-semibold">
            {currentShift?.shiftNo ?? "Not open"}
          </div>
        </div>
        <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Register
          </div>
          <div className="mt-2 text-base font-semibold">
            {currentShift?.registerName ?? "No register"}
          </div>
        </div>
        <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Expected cash
          </div>
          <div className="mt-2 font-mono text-base font-semibold">
            {money(currentShift?.expectedCash ?? 0)}
          </div>
        </div>
        <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Net sales
          </div>
          <div className="mt-2 font-mono text-base font-semibold">
            {money(currentShift?.netSalesValue ?? 0)}
          </div>
        </div>
      </div>

      <div className="rounded-[1.5rem] bg-[var(--surface-muted)] p-3">
        <div className="flex flex-wrap gap-2">
          {!currentShift ? (
            <Button size="sm" onClick={() => setOpenDialog(true)}>
              Open shift
            </Button>
          ) : (
            <Button size="sm" onClick={() => setCloseDialog(true)}>
              Close shift
            </Button>
          )}
        </div>
      </div>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Open shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Shift number</label>
              <Input value={shiftNo} readOnly disabled={isReserving} />
              <FieldHelp
                error={reserveError ?? undefined}
                hint={reserveError ? undefined : "Generated automatically."}
              />
            </div>
            <SearchableSelect
              label="Site"
              value={selectedSiteId}
              options={siteOptions}
              placeholder="Select site"
              onValueChange={setSelectedSiteId}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Register name</label>
                <Input
                  value={registerName}
                  onChange={(event) => setRegisterName(event.target.value)}
                  placeholder="Front till"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Register code</label>
                <Input
                  value={registerCode}
                  onChange={(event) => setRegisterCode(event.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Opening float</label>
              <Input
                value={openingFloat}
                onChange={(event) => setOpeningFloat(event.target.value)}
                inputMode="decimal"
              />
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>Opening float</span>
                  <span className="font-mono">{money(currentShift?.openingFloat ?? 0)}</span>
                </div>
              </div>
              <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>Expected cash</span>
                  <span className="font-mono">{money(currentShift?.expectedCash ?? 0)}</span>
                </div>
              </div>
              <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>Net sales</span>
                  <span className="font-mono">{money(currentShift?.netSalesValue ?? 0)}</span>
                </div>
              </div>
              <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>Refunds</span>
                  <span className="font-mono">{money(currentShift?.refundValue ?? 0)}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Counted cash</label>
              <Input
                value={countedCash}
                onChange={(event) => setCountedCash(event.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="rounded-[1.25rem] bg-[var(--surface-muted)] px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>Variance</span>
                <span className="font-mono">{money(variancePreview)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Notes</label>
              <Textarea
                value={closeNotes}
                onChange={(event) => setCloseNotes(event.target.value)}
                rows={3}
              />
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
  );
}
