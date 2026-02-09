"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
import { Send, Shield } from "lucide-react";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";

export function ReceiptForm({
  setViewMode,
  availableDispatches,
}: {
  setViewMode: (mode: "menu" | "pour" | "dispatch" | "receipt" | "reconciliation" | "audit") => void;
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
    receiptNumber: "",
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
      goldDispatchId: string;
      receiptNumber: string;
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
    onSuccess: (receipt) => {
      toast({
        title: "Sale recorded",
        description: "Receipt saved and chain closed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["gold-receipts"] });
      const destination = buildSavedRecordRedirect("/gold/receipt", {
        createdId: receipt.id,
        createdAt: receipt.createdAt,
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
    !!formData.receiptNumber &&
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
    createReceiptMutation.mutate({
      goldDispatchId: formData.goldDispatchId,
      receiptNumber: formData.receiptNumber.trim(),
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <Button type="button" variant="outline" onClick={() => setViewMode("menu")}>
        Back to Menu
      </Button>

      {createReceiptMutation.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to record sale receipt</AlertTitle>
          <AlertDescription>{getApiErrorMessage(createReceiptMutation.error)}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="bg-green-50 border-green-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong className="block mb-1">Sale Confirmation</strong>
              <p className="text-foreground">
                Record final assay results and sale details to complete the
                gold transaction cycle.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buyer Receipt</CardTitle>
          <CardDescription>Record assay and sale confirmation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {availableDispatches.length === 0 ? (
            <Alert>
              <AlertTitle>No dispatches awaiting receipt</AlertTitle>
              <AlertDescription>
                Record a dispatch manifest before confirming a sale receipt.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Receipt Number *</label>
              <Input
                value={formData.receiptNumber}
                onChange={(e) =>
                  setFormData({ ...formData, receiptNumber: e.target.value })
                }
                placeholder="e.g., RCP-2026-001"
                required
              />
            </div>

            <SearchableSelect
              label="Dispatch ID *"
              value={formData.goldDispatchId || undefined}
              options={dispatchOptions}
              placeholder={
                availableDispatches.length === 0
                  ? "No dispatches awaiting receipt"
                  : "Select dispatch"
              }
              searchPlaceholder="Search dispatches..."
              onValueChange={handleSelectChange("goldDispatchId")}
              onAddOption={() => setViewMode("dispatch")}
              addLabel="Record dispatch"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Receipt Date *</label>
            <Input
              type="datetime-local"
              value={formData.receiptDate}
              onChange={(e) => setFormData({ ...formData, receiptDate: e.target.value })}
              required
            />
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">Assay Results</h4>
            <div>
              <label className="block text-sm font-semibold mb-2">
                Actual Purity/Fine Weight (grams) *
              </label>
              <Input
                type="number"
                step="0.01"
                value={formData.assayResult}
                onChange={(e) => setFormData({ ...formData, assayResult: e.target.value })}
                placeholder="e.g., 42.35"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                After buyer assay test
              </p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">Sale Details</h4>
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
              </div>

              <SearchableSelect
                label="Settlement Method *"
                value={formData.paymentMethod}
                options={paymentMethods}
                placeholder="Select method"
                searchPlaceholder="Search methods..."
                onValueChange={handleSelectChange("paymentMethod")}
                onAddOption={handleAddPaymentMethod}
                addLabel="Add settlement method"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Settlement Channel</label>
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
                  Settlement Reference
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
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" size="lg" disabled={!canSubmit}>
        <Send className="mr-2 h-5 w-5" />
        {createReceiptMutation.isPending ? "Recording..." : "Confirm Sale Receipt"}
      </Button>
    </form>
  );
}
