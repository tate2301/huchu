"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FormShell } from "@/components/shared/form-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { buildSavedRecordRedirect } from "@/lib/saved-record";
import { goldRoutes } from "@/app/gold/routes";
import { Send, ChevronDown } from "@/lib/icons";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { useReservedId } from "@/hooks/use-reserved-id";

type AvailableBatch = {
  id: string;
  pourDate: string;
  pourBarId: string;
  grossWeight: number;
  valueUsd?: number | null;
  site: { name: string };
};

type AvailableDispatch = {
  id: string;
  dispatchDate: string;
  courier: string;
  goldPourId: string;
  goldPour: { pourBarId: string; grossWeight: number; site: { name: string } };
  batches?: Array<{
    goldPourId: string;
    goldPour: {
      id: string;
      pourBarId: string;
      grossWeight: number;
      valueUsd?: number | null;
      site: { name: string };
    };
  }>;
};

type LineItem = {
  goldPourId: string;
  pourBarId: string;
  grossWeight: number;
  assayResult: string;
  paidAmount: string;
  selected: boolean;
};

const DEFAULT_PAYMENT_METHODS: SearchableOption[] = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "CRYPTO", label: "Cryptocurrency" },
  { value: "CHECK", label: "Check" },
];

export function ReceiptForm({
  cancelHref,
  batchCreateHref,
  availableBatches,
  availableDispatches,
  soldPourIds,
  mode = "page",
  onSuccess,
  onCancel,
  redirectOnSuccess,
}: {
  cancelHref?: string;
  batchCreateHref?: string;
  availableBatches: AvailableBatch[];
  availableDispatches: AvailableDispatch[];
  soldPourIds?: Set<string>;
  mode?: "page" | "modal";
  onSuccess?: () => void;
  onCancel?: () => void;
  redirectOnSuccess?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const shouldRedirect = redirectOnSuccess ?? mode === "page";
  const [quickEntry, setQuickEntry] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<SearchableOption[]>(DEFAULT_PAYMENT_METHODS);

  const [formData, setFormData] = useState({
    goldPourId: "",
    goldDispatchId: "",
    receiptDate: (() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); })(),
    assayResult: "",
    paidAmount: "",
    paymentMethod: "CASH",
    paymentChannel: "",
    paymentReference: "",
    notes: "",
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const {
    reservedId: reservedReceiptNumber,
    isReserving: reservingReceiptNumber,
    error: reserveReceiptNumberError,
  } = useReservedId({
    entity: "GOLD_RECEIPT",
    enabled: true,
  });

  const dispatchById = useMemo(
    () => new Map(availableDispatches.map((dispatch) => [dispatch.id, dispatch])),
    [availableDispatches],
  );

  const selectedDispatch = formData.goldDispatchId
    ? dispatchById.get(formData.goldDispatchId)
    : null;

  const dispatchHasMultipleBatches = Boolean(
    selectedDispatch?.batches && selectedDispatch.batches.length > 1,
  );
  // Backfill mode without a chosen dispatch: pick batches across the whole pool.
  const crossDispatchBackfill =
    quickEntry && !formData.goldDispatchId && availableBatches.length > 0;
  const isBatchMode = dispatchHasMultipleBatches || crossDispatchBackfill;

  // Look up valueUsd for any pour we may want to autofill.
  const batchValueByPourId = useMemo(() => {
    const map = new Map<string, { grossWeight: number; valueUsd: number | null; pourBarId: string; siteName: string }>();
    for (const batch of availableBatches) {
      map.set(batch.id, {
        grossWeight: batch.grossWeight,
        valueUsd: batch.valueUsd ?? null,
        pourBarId: batch.pourBarId,
        siteName: batch.site.name,
      });
    }
    for (const dispatch of availableDispatches) {
      // Primary batch
      const primaryId = dispatch.goldPourId;
      if (!map.has(primaryId)) {
        map.set(primaryId, {
          grossWeight: dispatch.goldPour.grossWeight,
          valueUsd: null,
          pourBarId: dispatch.goldPour.pourBarId,
          siteName: dispatch.goldPour.site.name,
        });
      }
      for (const batch of dispatch.batches ?? []) {
        if (!map.has(batch.goldPourId)) {
          map.set(batch.goldPourId, {
            grossWeight: batch.goldPour.grossWeight,
            valueUsd: batch.goldPour.valueUsd ?? null,
            pourBarId: batch.goldPour.pourBarId,
            siteName: batch.goldPour.site.name,
          });
        }
      }
    }
    return map;
  }, [availableBatches, availableDispatches]);

  // When dispatch changes, derive line items from its batches and autofill paid
  // amounts from the valuation snapshot.
  useEffect(() => {
    if (!selectedDispatch) {
      // Don't blow away lineItems if we're in cross-dispatch backfill — handled below.
      if (!crossDispatchBackfill) setLineItems([]);
      return;
    }
    const dispatchBatches = selectedDispatch.batches?.length
      ? selectedDispatch.batches.map((batch) => ({
          goldPourId: batch.goldPourId,
          pourBarId: batch.goldPour.pourBarId,
          grossWeight: batch.goldPour.grossWeight,
          valueUsd: batch.goldPour.valueUsd ?? null,
        }))
      : [
          {
            goldPourId: selectedDispatch.goldPourId,
            pourBarId: selectedDispatch.goldPour.pourBarId,
            grossWeight: selectedDispatch.goldPour.grossWeight,
            valueUsd: null as number | null,
          },
        ];

    setLineItems(
      dispatchBatches.map((batch) => ({
        goldPourId: batch.goldPourId,
        pourBarId: batch.pourBarId,
        grossWeight: batch.grossWeight,
        assayResult: "",
        paidAmount: batch.valueUsd != null ? Number(batch.valueUsd).toFixed(2) : "",
        selected: !soldPourIds?.has(batch.goldPourId),
      })),
    );
  }, [selectedDispatch, soldPourIds, crossDispatchBackfill]);

  // Cross-dispatch backfill: load all unsold batches as line items.
  useEffect(() => {
    if (!crossDispatchBackfill) return;
    setLineItems(
      availableBatches.slice(0, 50).map((batch) => ({
        goldPourId: batch.id,
        pourBarId: batch.pourBarId,
        grossWeight: batch.grossWeight,
        assayResult: "",
        paidAmount: batch.valueUsd != null ? Number(batch.valueUsd).toFixed(2) : "",
        selected: false,
      })),
    );
  }, [crossDispatchBackfill, availableBatches]);

  // Single-mode: when a batch is picked, autofill paidAmount from its valuation.
  useEffect(() => {
    if (isBatchMode || !formData.goldPourId) return;
    const batch = batchValueByPourId.get(formData.goldPourId);
    if (!batch) return;
    if (formData.paidAmount) return; // don't clobber user input
    if (batch.valueUsd != null) {
      setFormData((prev) => ({ ...prev, paidAmount: Number(batch.valueUsd!).toFixed(2) }));
    }
  }, [formData.goldPourId, isBatchMode, batchValueByPourId, formData.paidAmount]);

  const batchOptions = useMemo(
    () =>
      availableBatches.map((batch) => ({
        value: batch.id,
        label: batch.pourBarId,
        description: batch.site.name,
        meta: `${Number(batch.grossWeight)} g | $${Number(batch.valueUsd ?? 0).toFixed(2)}`,
      })),
    [availableBatches],
  );

  const dispatchOptions = useMemo(
    () =>
      availableDispatches.map((dispatch) => {
        const batchCount = dispatch.batches?.length ?? 1;
        const batchLabel =
          batchCount > 1
            ? `${batchCount} batches`
            : dispatch.goldPour.pourBarId;
        return {
          value: dispatch.id,
          label: batchLabel,
          description: `${dispatch.courier} • ${dispatch.dispatchDate.slice(0, 10)}`,
          meta: dispatch.goldPour.site.name,
        };
      }),
    [availableDispatches],
  );

  const updateLineItem = (index: number, patch: Partial<LineItem>) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const handleAddPaymentMethod = (query: string) => {
    const label = query.trim();
    if (!label) return;
    const value = label.toUpperCase().replace(/\s+/g, "_");
    if (paymentMethods.some((method) => method.value === value)) return;
    const next = { value, label };
    setPaymentMethods((prev) => [...prev, next]);
    setFormData((prev) => ({ ...prev, paymentMethod: value }));
  };

  const createReceiptMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson<{ id: string; createdAt?: string }>("/api/gold/receipts", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: handleSuccess,
  });

  const createBatchReceiptMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson<{ count: number; ids: string[] }>("/api/gold/receipts/batch", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (result) => {
      toast({
        title: `Recorded ${result.count} sale${result.count === 1 ? "" : "s"}`,
        description: "Batch sale records saved successfully.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["gold-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["gold-dispatches"] });
      onSuccess?.();
      if (quickEntry && mode === "modal") {
        setFormData((prev) => ({
          ...prev,
          goldPourId: "",
          goldDispatchId: "",
          assayResult: "",
          paidAmount: "",
          paymentReference: "",
          notes: "",
        }));
        setLineItems([]);
        return;
      }
      if (shouldRedirect) {
        router.push(goldRoutes.settlement.receipts);
      }
    },
  });

  function handleSuccess(receipt: { id: string; createdAt?: string }) {
    toast({
      title: "Sale recorded",
      description: "Sale record saved successfully.",
      variant: "success",
    });
    queryClient.invalidateQueries({ queryKey: ["gold-receipts"] });
    onSuccess?.();
    if (quickEntry && mode === "modal") {
      setFormData((prev) => ({
        ...prev,
        goldPourId: "",
        goldDispatchId: "",
        assayResult: "",
        paidAmount: "",
        paymentReference: "",
        notes: "",
      }));
      setLineItems([]);
      return;
    }
    if (shouldRedirect) {
      const destination = buildSavedRecordRedirect(goldRoutes.settlement.receipts, {
        createdId: receipt.id,
        createdAt: receipt.createdAt,
        source: "gold-receipt",
      });
      router.push(destination);
    }
  }

  const isSubmitting =
    createReceiptMutation.isPending || createBatchReceiptMutation.isPending;
  const submissionError =
    createReceiptMutation.error ?? createBatchReceiptMutation.error;

  const selectedLineItems = lineItems.filter((item) => item.selected);
  const batchModeReady =
    isBatchMode &&
    selectedLineItems.length > 0 &&
    selectedLineItems.every((item) => {
      const paid = Number(item.paidAmount);
      return !!item.paidAmount && !Number.isNaN(paid) && paid >= 0;
    });

  const paidAmountValue = Number(formData.paidAmount);
  const singleModeReady =
    !isBatchMode &&
    !!reservedReceiptNumber &&
    !!formData.goldPourId &&
    !!formData.receiptDate &&
    !Number.isNaN(paidAmountValue) &&
    paidAmountValue >= 0 &&
    !!formData.paymentMethod;

  const canSubmit = isBatchMode ? batchModeReady : singleModeReady;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      toast({
        title: "Missing details",
        description: isBatchMode
          ? "Enter paid amount for each selected batch."
          : "Fill all required receipt fields before saving.",
        variant: "destructive",
      });
      return;
    }
    if (isBatchMode) {
      createBatchReceiptMutation.mutate({
        // Cross-dispatch backfill: don't lock items to one dispatch.
        goldDispatchId: formData.goldDispatchId || undefined,
        receiptDate: formData.receiptDate,
        paymentMethod: formData.paymentMethod,
        paymentChannel: formData.paymentChannel?.trim() || undefined,
        paymentReference: formData.paymentReference?.trim() || undefined,
        notes: formData.notes?.trim() || undefined,
        items: selectedLineItems.map((item) => ({
          goldPourId: item.goldPourId,
          assayResult: item.assayResult ? Number(item.assayResult) : undefined,
          paidAmount: Number(item.paidAmount),
        })),
      });
      return;
    }
    if (!reservedReceiptNumber) {
      toast({
        title: "Unable to reserve receipt number",
        description:
          reserveReceiptNumberError ??
          "Please wait for receipt number reservation to complete.",
        variant: "destructive",
      });
      return;
    }
    createReceiptMutation.mutate({
      receiptNumber: reservedReceiptNumber,
      goldPourId: formData.goldPourId,
      goldDispatchId: formData.goldDispatchId || undefined,
      receiptDate: formData.receiptDate,
      assayResult: formData.assayResult ? Number(formData.assayResult) : undefined,
      paidAmount: paidAmountValue,
      paymentMethod: formData.paymentMethod,
      paymentChannel: formData.paymentChannel?.trim() || undefined,
      paymentReference: formData.paymentReference?.trim() || undefined,
      notes: formData.notes?.trim() || undefined,
    });
  };

  return (
    <FormShell
      variant={mode === "modal" ? "bare" : "page"}
      title={mode === "modal" ? undefined : "Record Sale"}
      onSubmit={handleSubmit}
      formClassName="space-y-5"
      requiredHint="Pick the dispatch (or batch), enter the cash paid. Channel and notes are optional."
      errors={submissionError ? [getApiErrorMessage(submissionError)] : undefined}
      errorTitle="Unable to record sale"
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (mode === "modal") {
                onCancel?.();
                return;
              }
              router.push(cancelHref ?? goldRoutes.settlement.receipts);
            }}
            className="flex-1 sm:flex-none"
          >
            {mode === "modal" ? "Cancel" : "Back to Sales"}
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit || isSubmitting || (!isBatchMode && reservingReceiptNumber)}
            className="flex-1 sm:flex-none"
          >
            <Send className="mr-2 h-5 w-5" />
            {isSubmitting
              ? "Recording..."
              : isBatchMode
                ? `Save ${selectedLineItems.length} Sale${selectedLineItems.length === 1 ? "" : "s"}`
                : "Save Sale"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        Pick a dispatch (multi-batch shipments record sales for all batches at once) or sell directly from a batch.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="receipt-quick-entry"
            checked={quickEntry}
            onCheckedChange={(checked) => setQuickEntry(checked === true)}
          />
          <label htmlFor="receipt-quick-entry" className="text-sm font-medium cursor-pointer">
            Backfill mode: keep date & payment method after save
          </label>
        </div>
        <span className="text-xs text-muted-foreground">
          For ledger backfill: stay on the form, swap dispatch/batch and re-enter amounts.
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-2">Dispatch</label>
          <SearchableSelect
            value={formData.goldDispatchId || undefined}
            options={[{ value: "", label: "No dispatch (direct from batch)" }, ...dispatchOptions]}
            placeholder={availableDispatches.length === 0 ? "No active dispatches" : "Select dispatch"}
            searchPlaceholder="Search dispatches..."
            onValueChange={(value) => {
              if (value === "") {
                setFormData((prev) => ({ ...prev, goldDispatchId: "", goldPourId: "" }));
                return;
              }
              const dispatch = dispatchById.get(value);
              setFormData((prev) => ({
                ...prev,
                goldDispatchId: value,
                // Auto-select primary batch so single-batch dispatches don't need a second click.
                goldPourId: dispatch?.goldPourId ?? "",
                // Reset paidAmount so the autofill effect can kick in fresh.
                paidAmount: "",
              }));
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a dispatch to auto-fill its batches and amounts. Leave blank in
            backfill mode to record sales across many dispatches in one go.
          </p>
        </div>

        {!isBatchMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Receipt Number</label>
              <Input
                value={reservedReceiptNumber}
                readOnly
                aria-readonly="true"
                placeholder={reservingReceiptNumber ? "Reserving..." : "Auto-generated"}
              />
            </div>

            <SearchableSelect
              label="Select Batch *"
              value={formData.goldPourId || undefined}
              options={batchOptions}
              placeholder={availableBatches.length === 0 ? "No batches awaiting sale" : "Select batch"}
              searchPlaceholder="Search batches..."
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, goldPourId: value }))
              }
              onAddOption={() =>
                router.push(batchCreateHref ?? goldRoutes.intake.create)
              }
              addLabel="Record batch"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Sale Date *</label>
            <Input
              type="datetime-local"
              value={formData.receiptDate}
              onChange={(e) => setFormData({ ...formData, receiptDate: e.target.value })}
              required
            />
          </div>
          <SearchableSelect
            label="Payment Method *"
            value={formData.paymentMethod}
            options={paymentMethods}
            placeholder="Select method"
            searchPlaceholder="Search methods..."
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, paymentMethod: value }))
            }
            onAddOption={handleAddPaymentMethod}
            addLabel="Add payment method"
          />
        </div>

        {isBatchMode ? (
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">
                {crossDispatchBackfill ? "Backfill receipts" : "Batch Receipts"}{" "}
                ({selectedLineItems.length} of {lineItems.length} selected)
              </h4>
              <button
                type="button"
                onClick={() =>
                  setLineItems((prev) => prev.map((item) => ({ ...item, selected: true })))
                }
                className="text-xs text-primary hover:underline"
              >
                Select all
              </button>
            </div>
            {crossDispatchBackfill ? (
              <p className="text-xs text-muted-foreground">
                Pick any unsold batches — across dispatches or direct sales — and record their
                receipts in one go. Amounts are pre-filled from each batch&apos;s USD valuation.
              </p>
            ) : null}
            <div className="rounded-md border divide-y">
              {lineItems.map((item, index) => {
                const alreadySold = soldPourIds?.has(item.goldPourId);
                return (
                  <div
                    key={item.goldPourId}
                    className={`grid grid-cols-1 sm:grid-cols-[auto_1fr_140px_140px] gap-3 items-center px-3 py-2 ${item.selected ? "bg-primary/5" : ""}`}
                  >
                    <Checkbox
                      checked={item.selected}
                      disabled={alreadySold}
                      onCheckedChange={(checked) =>
                        updateLineItem(index, { selected: checked === true })
                      }
                    />
                    <div className="min-w-0">
                      <div className="font-mono font-semibold truncate">
                        {item.pourBarId}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {Number(item.grossWeight).toFixed(3)} g
                        {alreadySold ? " • already sold" : ""}
                      </div>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Tested g"
                      value={item.assayResult}
                      onChange={(e) =>
                        updateLineItem(index, { assayResult: e.target.value })
                      }
                      disabled={!item.selected}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Paid (USD)"
                      value={item.paidAmount}
                      onChange={(e) =>
                        updateLineItem(index, { paidAmount: e.target.value })
                      }
                      disabled={!item.selected}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Paid amount per batch is required. Tested gold goes under <strong>More details</strong>.
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-semibold mb-2">
              Paid amount (USD) *
            </label>
            <Input
              autoFocus
              type="number"
              step="0.01"
              value={formData.paidAmount}
              onChange={(e) => setFormData({ ...formData, paidAmount: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
        )}

        <details
          className="group rounded-md border bg-card transition-all"
          open={moreOpen}
          onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold">
            <span>More details</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-4 px-4 pb-4 pt-1">
            {!isBatchMode ? (
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Final tested gold (grams)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.assayResult}
                  onChange={(e) => setFormData({ ...formData, assayResult: e.target.value })}
                  placeholder="e.g., 42.35"
                />
              </div>
            ) : null}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Payment Channel</label>
                <Input
                  value={formData.paymentChannel}
                  onChange={(e) =>
                    setFormData({ ...formData, paymentChannel: e.target.value })
                  }
                  placeholder="e.g., Standard Bank, EcoCash"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Payment Reference</label>
                <Input
                  value={formData.paymentReference}
                  onChange={(e) =>
                    setFormData({ ...formData, paymentReference: e.target.value })
                  }
                  placeholder="Transaction ID or reference"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Notes</label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                placeholder="Anything to flag..."
              />
            </div>
          </div>
        </details>
      </div>
    </FormShell>
  );
}
