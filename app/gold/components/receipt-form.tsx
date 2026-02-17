"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/shared/field-help";
import { FormShell } from "@/components/shared/form-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { buildSavedRecordRedirect } from "@/lib/saved-record";
import { goldRoutes } from "@/app/gold/routes";
import { Send, Shield } from "@/lib/icons";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { useReservedId } from "@/hooks/use-reserved-id";

export function ReceiptForm({
  cancelHref,
  dispatchCreateHref,
  availableDispatches,
}: {
  cancelHref?: string;
  dispatchCreateHref?: string;
  availableDispatches: Array<{
    id: string;
    dispatchDate: string;
    courier: string;
    goldPour: { pourBarId: string; grossWeight: number; site: { name: string } };
  }>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [formData, setFormData] = useState({
    goldDispatchId: "",
    receiptDate: new Date().toISOString().slice(0, 16),
    assayResult: "",
    paidAmount: "",
    paymentMethod: "BANK_TRANSFER",
    paymentChannel: "",
    paymentReference: "",
    notes: "",
  });
  const [paymentMethods, setPaymentMethods] = useState<SearchableOption[]>([
    { value: "BANK_TRANSFER", label: "Bank Transfer" },
    { value: "CASH", label: "Cash" },
    { value: "MOBILE_MONEY", label: "Mobile Money" },
    { value: "CRYPTO", label: "Cryptocurrency" },
    { value: "CHECK", label: "Check" },
  ]);
  const {
    reservedId: reservedReceiptNumber,
    isReserving: reservingReceiptNumber,
    error: reserveReceiptNumberError,
  } = useReservedId({
    entity: "GOLD_RECEIPT",
    enabled: true,
  });

  const handleSelectChange =
    (field: keyof typeof formData) => (value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const dispatchOptions = useMemo(
    () =>
      availableDispatches.map((dispatch) => ({
        value: dispatch.id,
        label: dispatch.goldPour.pourBarId,
        description: `${dispatch.goldPour.site.name} - ${dispatch.courier}`,
        meta: `${dispatch.goldPour.grossWeight} g`,
      })),
    [availableDispatches],
  );

  const createReceiptMutation = useMutation({
    mutationFn: async (payload: {
      receiptNumber: string;
      goldDispatchId: string;
      receiptDate: string;
      assayResult?: number;
      paidAmount: number;
      paymentMethod: string;
      paymentChannel?: string;
      paymentReference?: string;
      notes?: string;
    }) =>
      fetchJson<{ id: string; createdAt?: string }>("/api/gold/receipts", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (receipt, payload) => {
      toast({
        title: "Sale recorded",
        description: "Sale record saved successfully.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["gold-receipts"] });
      const destination = buildSavedRecordRedirect(goldRoutes.settlement.receipts, {
        createdId: receipt.id,
        createdAt: receipt.createdAt ?? payload.receiptDate,
        source: "gold-receipt",
      });
      router.push(destination);
    },
  });

  const handleAddPaymentMethod = (query: string) => {
    const label = query.trim();
    if (!label) return;
    const value = label.toUpperCase().replace(/\s+/g, "_");
    if (paymentMethods.some((method) => method.value === value)) return;
    const next = { value, label };
    setPaymentMethods((prev) => [...prev, next]);
    setFormData((prev) => ({ ...prev, paymentMethod: value }));
  };

  const paidAmountValue = Number(formData.paidAmount);
  const assayResultValue = formData.assayResult
    ? Number(formData.assayResult)
    : undefined;
  const canSubmit =
    !!reservedReceiptNumber &&
    !!formData.goldDispatchId &&
    !!formData.receiptDate &&
    !!formData.assayResult &&
    !Number.isNaN(paidAmountValue) &&
    paidAmountValue >= 0 &&
    !!formData.paymentMethod;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      toast({
        title: "Missing details",
        description: "Fill all required receipt fields before saving.",
        variant: "destructive",
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
      goldDispatchId: formData.goldDispatchId,
      receiptDate: formData.receiptDate,
      assayResult: assayResultValue,
      paidAmount: paidAmountValue,
      paymentMethod: formData.paymentMethod,
      paymentChannel: formData.paymentChannel?.trim() || undefined,
      paymentReference: formData.paymentReference?.trim() || undefined,
      notes: formData.notes?.trim() || undefined,
    });
  };

  return (
    <FormShell
      title="Sale Record"
      description="Capture buyer test results and payment details."
      onSubmit={handleSubmit}
      formClassName="space-y-6"
      requiredHint="Fields marked * are required. Submitting redirects to sales history with this record highlighted."
      errors={
        createReceiptMutation.error
          ? [getApiErrorMessage(createReceiptMutation.error)]
          : undefined
      }
      errorTitle="Unable to record sale"
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(cancelHref ?? goldRoutes.settlement.receipts)}
            className="flex-1 sm:flex-none"
          >
            Back to Sales
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit || createReceiptMutation.isPending || reservingReceiptNumber}
            className="flex-1 sm:flex-none"
          >
            <Send className="mr-2 h-5 w-5" />
            {createReceiptMutation.isPending ? "Recording..." : "Save Sale"}
          </Button>
        </>
      }
    >
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong className="block mb-1">Sale Details</strong>
              <p className="text-foreground">
                Record buyer test results and payment details.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sale Record</CardTitle>
          <CardDescription>Fill all required fields.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {availableDispatches.length === 0 ? (
            <Alert>
              <AlertTitle>No dispatches awaiting receipt</AlertTitle>
              <AlertDescription>
                Record a dispatch before adding a receipt.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Receipt Number</label>
              <Input
                value={reservedReceiptNumber}
                readOnly
                aria-readonly="true"
                placeholder={reservingReceiptNumber ? "Reserving..." : "Auto-generated"}
              />
              <FieldHelp
                hint={
                  reserveReceiptNumberError ??
                  "Receipt number is auto-generated and cannot be edited."
                }
              />
            </div>

            <SearchableSelect
              label="Select Dispatch *"
              value={formData.goldDispatchId || undefined}
              options={dispatchOptions}
              placeholder={
                availableDispatches.length === 0
                  ? "No dispatches awaiting receipt"
                  : "Select dispatch"
              }
              searchPlaceholder="Search dispatches..."
              onValueChange={handleSelectChange("goldDispatchId")}
              onAddOption={() =>
                router.push(dispatchCreateHref ?? goldRoutes.transit.newDispatch)
              }
              addLabel="Record dispatch"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Sale Date *</label>
            <Input
              type="datetime-local"
              value={formData.receiptDate}
              onChange={(e) => setFormData({ ...formData, receiptDate: e.target.value })}
              required
            />
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">Buyer Test Results</h4>
            <div>
              <label className="block text-sm font-semibold mb-2">
                Final tested gold (grams) *
              </label>
              <Input
                type="number"
                step="0.01"
                value={formData.assayResult}
                onChange={(e) => setFormData({ ...formData, assayResult: e.target.value })}
                placeholder="e.g., 42.35"
                required
              />
              <FieldHelp hint="Enter the buyer-confirmed tested gold weight." />
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">Payment Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Paid weight (grams) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.paidAmount}
                  onChange={(e) => setFormData({ ...formData, paidAmount: e.target.value })}
                  placeholder="0.000"
                  required
                />
                <FieldHelp hint="Paid weight used for settlement and payout calculations." />
              </div>

              <SearchableSelect
                label="Payment Method *"
                value={formData.paymentMethod}
                options={paymentMethods}
                placeholder="Select method"
                searchPlaceholder="Search methods..."
                onValueChange={handleSelectChange("paymentMethod")}
                onAddOption={handleAddPaymentMethod}
                addLabel="Add payment method"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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
                <label className="block text-sm font-semibold mb-2">
                  Payment Reference
                </label>
                <Input
                  value={formData.paymentReference}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      paymentReference: e.target.value,
                    })
                  }
                  placeholder="Transaction ID or reference"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              placeholder="Additional payment notes..."
            />
            <FieldHelp hint="Optional notes for discrepancies, buyer comments, or exceptions." />
          </div>
        </CardContent>
      </Card>
    </FormShell>
  );
}
