"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { FrappeStatCard } from "@/components/charts/frappe-stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccountingListView as DataTable } from "@/components/accounting/listview/accounting-list-view";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { useToast } from "@/components/ui/use-toast";
import {
  type AccountingPeriodRecord,
  type TaxCodeRecord,
  type VatReturnRecord,
  type VatSummaryRow,
  createVatReturnDraft,
  fetchVatReturns,
  fileVatReturn,
  finalizeVatReturn,
  fetchAccountingPeriods,
  fetchTaxCodes,
  fetchVatSummary,
  refreshVatReturn,
  reviewVatReturn,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

export default function TaxSetupPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialViewParam = searchParams.get("view");
  const initialView =
    initialViewParam === "vat-summary" || initialViewParam === "vat-returns"
      ? initialViewParam
      : "codes";
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<"codes" | "vat-summary" | "vat-returns">(
    initialView,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState({
    code: "",
    name: "",
    rate: "",
    type: "VAT",
    appliesTo: "BOTH",
    vat7OutputBox: "",
    vat7InputBox: "",
    scheduleType: "NONE",
    isActive: true,
  });
  const [summaryPeriodId, setSummaryPeriodId] = useState("");
  const [summaryStartDate, setSummaryStartDate] = useState("");
  const [summaryEndDate, setSummaryEndDate] = useState("");
  const [vatReturnPeriodId, setVatReturnPeriodId] = useState("");
  const [vatReturnAdjustmentsTax, setVatReturnAdjustmentsTax] = useState("");
  const [vatReturnFilingCategory, setVatReturnFilingCategory] = useState("GENERAL");
  const {
    reservedId,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "TAX_CODE",
    enabled: formOpen,
  });

  const { data: taxCodes, isLoading, error } = useQuery({
    queryKey: ["accounting", "tax"],
    queryFn: fetchTaxCodes,
  });

  const { data: periodsData } = useQuery({
    queryKey: ["accounting", "periods", "vat"],
    queryFn: () => fetchAccountingPeriods({ limit: 200 }),
  });

  const {
    data: vatSummary,
    isLoading: vatSummaryLoading,
    error: vatSummaryError,
  } = useQuery({
    queryKey: ["accounting", "vat-summary", summaryPeriodId, summaryStartDate, summaryEndDate],
    queryFn: () =>
      fetchVatSummary({
        periodId: summaryPeriodId || undefined,
        startDate: summaryStartDate || undefined,
        endDate: summaryEndDate || undefined,
      }),
    enabled: activeView === "vat-summary",
  });
  const {
    data: vatReturnsData,
    isLoading: vatReturnsLoading,
    error: vatReturnsError,
  } = useQuery({
    queryKey: ["accounting", "vat-returns"],
    queryFn: () => fetchVatReturns({ limit: 200 }),
    enabled: activeView === "vat-returns",
  });
  const actionMutation = useMutation({
    mutationFn: async (input: { action: "review" | "refresh" | "finalize" | "file"; vatReturnId: string }) => {
      if (input.action === "review") return reviewVatReturn(input.vatReturnId);
      if (input.action === "refresh") return refreshVatReturn(input.vatReturnId);
      if (input.action === "finalize") return finalizeVatReturn(input.vatReturnId);
      return fileVatReturn(input.vatReturnId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting", "vat-returns"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "vat-summary"] });
      toast({
        title: "VAT return updated",
        description: "VAT return status changed successfully.",
        variant: "success",
      });
    },
    onError: (err) => {
      toast({
        title: "Unable to update VAT return",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<TaxCodeRecord>[]>(
    () => [
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
        size: 112,
        minSize: 112,
        maxSize: 112},
      {
        id: "name",
        header: "Tax Name",
        accessorKey: "name",
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "rate",
        header: "Rate",
        cell: ({ row }) => <span className="font-mono">{row.original.rate}%</span>,
        size: 88,
        minSize: 88,
        maxSize: 88},
      {
        id: "type",
        header: "Type",
        accessorKey: "type",
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "appliesTo",
        header: "Applies To",
        accessorKey: "appliesTo",
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "outline"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120},
    ],
    [],
  );

  const vatColumns = useMemo<ColumnDef<VatSummaryRow>[]>(
    () => [
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "name",
        header: "Tax Name",
        accessorKey: "name",
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "rate",
        header: "Rate",
        cell: ({ row }) => <span className="font-mono">{row.original.rate}%</span>,
        size: 88,
        minSize: 88,
        maxSize: 88},
      {
        id: "output",
        header: "Output VAT",
        cell: ({ row }) => <NumericCell>{row.original.outputTax.toFixed(2)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "input",
        header: "Input VAT",
        cell: ({ row }) => <NumericCell>{row.original.inputTax.toFixed(2)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "net",
        header: "Net VAT",
        cell: ({ row }) => <NumericCell>{row.original.netTax.toFixed(2)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
    ],
    [],
  );
  const vatReturnColumns = useMemo<ColumnDef<VatReturnRecord>[]>(
    () => [
      {
        id: "period",
        header: "Period",
        cell: ({ row }) => (
          <span className="font-mono">
            {format(new Date(row.original.periodStart), "yyyy-MM-dd")} to{" "}
            {format(new Date(row.original.periodEnd), "yyyy-MM-dd")}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === "FILED" ? "secondary" : "outline"}
            className="font-mono"
          >
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "dueDates",
        header: "Due Dates",
        cell: ({ row }) => (
          <div className="text-xs">
            <div className="font-mono">
              Return: {row.original.returnDueDate ? format(new Date(row.original.returnDueDate), "yyyy-MM-dd") : "-"}
            </div>
            <div className="font-mono">
              Payment: {row.original.paymentDueDate ? format(new Date(row.original.paymentDueDate), "yyyy-MM-dd") : "-"}
            </div>
          </div>
        ),
      },
      {
        id: "outputTax",
        header: "Output Tax",
        cell: ({ row }) => <NumericCell>{row.original.outputTax.toFixed(2)}</NumericCell>,
      },
      {
        id: "inputTax",
        header: "Input Tax",
        cell: ({ row }) => <NumericCell>{row.original.inputTax.toFixed(2)}</NumericCell>,
      },
      {
        id: "payableRefundable",
        header: "Payable / Refundable",
        cell: ({ row }) => {
          const boxes = row.original.vat7Boxes ?? {};
          const payable = Number(boxes.vatPayable ?? 0);
          const refundable = Number(boxes.vatRefundable ?? 0);
          return (
            <div className="text-right font-mono text-xs">
              <div>Payable: {payable.toFixed(2)}</div>
              <div>Refund: {refundable.toFixed(2)}</div>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const vatReturn = row.original;
          return (
            <div className="flex items-center justify-end gap-2">
              {vatReturn.status === "DRAFT" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => actionMutation.mutate({ action: "review", vatReturnId: vatReturn.id })}
                >
                  Review
                </Button>
              ) : null}
              {vatReturn.status === "REVIEWED" ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      actionMutation.mutate({ action: "refresh", vatReturnId: vatReturn.id })
                    }
                  >
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => actionMutation.mutate({ action: "finalize", vatReturnId: vatReturn.id })}
                  >
                    Finalize
                  </Button>
                </>
              ) : null}
              {vatReturn.status === "FINALIZED" ? (
                <Button
                  size="sm"
                  onClick={() => actionMutation.mutate({ action: "file", vatReturnId: vatReturn.id })}
                >
                  Mark Filed
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [actionMutation],
  );

  const periods = periodsData?.data ?? [];
  const vatRows = vatSummary?.rows ?? [];
  const vatTotals = vatSummary?.totals ?? { outputTax: 0, inputTax: 0, netTax: 0 };
  const vatReturns = vatReturnsData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/tax", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Tax code created",
        description: "Tax code saved successfully.",
        variant: "success",
      });
      setFormOpen(false);
      setFormState({
        code: "",
        name: "",
        rate: "",
        type: "VAT",
        appliesTo: "BOTH",
        vat7OutputBox: "",
        vat7InputBox: "",
        scheduleType: "NONE",
        isActive: true,
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "tax"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create tax code",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });
  const createVatReturnMutation = useMutation({
    mutationFn: async () => {
      if (!vatReturnPeriodId) {
        throw new Error("Select a period to generate a VAT return.");
      }
      const period = periods.find((item) => item.id === vatReturnPeriodId);
      if (!period || period.status !== "OPEN") {
        throw new Error("VAT return drafts can only be created for OPEN periods.");
      }
      return createVatReturnDraft({
        periodId: vatReturnPeriodId,
        adjustmentsTax: vatReturnAdjustmentsTax ? Number(vatReturnAdjustmentsTax) : undefined,
        filingCategory: vatReturnFilingCategory,
      });
    },
    onSuccess: () => {
      toast({
        title: "VAT return draft created",
        description: "VAT return draft has been generated for the selected period.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "vat-returns"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create VAT return draft",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.name.trim() || !formState.rate) {
      toast({
        title: "Missing details",
        description: "Name and rate are required.",
        variant: "destructive",
      });
      return;
    }

    if (!reservedId.trim()) {
      toast({
        title: "Unable to reserve tax code",
        description: reserveError ?? "Please wait for code reservation to complete.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      code: reservedId.trim(),
      name: formState.name.trim(),
      rate: Number(formState.rate),
      type: formState.type,
      appliesTo: formState.appliesTo,
      vat7OutputBox: formState.vat7OutputBox || undefined,
      vat7InputBox: formState.vat7InputBox || undefined,
      scheduleType: formState.scheduleType,
      isActive: formState.isActive,
    });
  };

  const handlePeriodChange = (value: string) => {
    setSummaryPeriodId(value);
    if (value) {
      setSummaryStartDate("");
      setSummaryEndDate("");
    }
  };

  const handleStartDateChange = (value: string) => {
    setSummaryStartDate(value);
    if (value) setSummaryPeriodId("");
  };

  const handleEndDateChange = (value: string) => {
    setSummaryEndDate(value);
    if (value) setSummaryPeriodId("");
  };

  return (
    <AccountingShell
      activeTab="tax"
      title="Tax Setup"
      description="Configure VAT and tax codes for sales and purchases."
      actions={
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 size-4" />
          New Tax Code
        </Button>
      }
    >
      {(error || vatSummaryError || vatReturnsError) ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load tax codes</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error || vatSummaryError || vatReturnsError)}</AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "codes", label: "Tax Codes", count: taxCodes?.length ?? 0 },
          { id: "vat-summary", label: "VAT Summary", count: vatRows.length },
          { id: "vat-returns", label: "VAT Returns", count: vatReturns.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as "codes" | "vat-summary" | "vat-returns")}
        railLabel="Tax Views"
      >
        <div className={activeView === "codes" ? "space-y-3" : "hidden"}>
          <DataTable
            data={taxCodes ?? []}
            columns={columns}
            groupBy="type"
            searchPlaceholder="Search tax codes"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={isLoading ? "Loading tax codes..." : "No tax codes found."}
          />
        </div>
        <div className={activeView === "vat-summary" ? "space-y-3" : "hidden"}>
          <div className="grid gap-4 md:grid-cols-3">
            <FrappeStatCard label="Output VAT" value={vatTotals.outputTax} valueLabel={vatTotals.outputTax.toFixed(2)} />
            <FrappeStatCard label="Input VAT" value={vatTotals.inputTax} valueLabel={vatTotals.inputTax.toFixed(2)} />
            <FrappeStatCard
              label="Net VAT"
              value={vatTotals.netTax}
              valueLabel={vatTotals.netTax.toFixed(2)}
              tone={vatTotals.netTax > 0 ? "warning" : "success"}
              negativeIsBetter
            />
          </div>
          <DataTable
            data={vatRows}
            columns={vatColumns}
            groupBy={(row) => `${row.rate}%`}
            searchPlaceholder="Search VAT summary"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={summaryPeriodId} onValueChange={handlePeriodChange}>
                  <SelectTrigger size="sm" className="h-8 w-[220px]">
                    <SelectValue placeholder="Filter by period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Periods</SelectItem>
                    {periods.map((period: AccountingPeriodRecord) => (
                      <SelectItem key={period.id} value={period.id}>
                        {format(new Date(period.startDate), "yyyy-MM-dd")} to{" "}
                        {format(new Date(period.endDate), "yyyy-MM-dd")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={summaryStartDate}
                  onChange={(event) => handleStartDateChange(event.target.value)}
                  className="h-8"
                />
                <Input
                  type="date"
                  value={summaryEndDate}
                  onChange={(event) => handleEndDateChange(event.target.value)}
                  className="h-8"
                />
              </div>
            }
            emptyState={vatSummaryLoading ? "Loading VAT summary..." : "No VAT summary data."}
          />
        </div>
        <div className={activeView === "vat-returns" ? "space-y-3" : "hidden"}>
          <DataTable
            data={vatReturns}
            columns={vatReturnColumns}
            groupBy="status"
            searchPlaceholder="Search VAT returns"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={vatReturnPeriodId} onValueChange={setVatReturnPeriodId}>
                  <SelectTrigger size="sm" className="h-8 w-[220px]">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Select period</SelectItem>
                    {periods.map((period: AccountingPeriodRecord) => (
                      <SelectItem key={period.id} value={period.id}>
                        {format(new Date(period.startDate), "yyyy-MM-dd")} to{" "}
                        {format(new Date(period.endDate), "yyyy-MM-dd")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="-999999999"
                  step="0.01"
                  value={vatReturnAdjustmentsTax}
                  onChange={(event) => setVatReturnAdjustmentsTax(event.target.value)}
                  placeholder="Adjustments tax"
                  className="h-8 w-[180px] text-right font-mono"
                />
                <Select value={vatReturnFilingCategory} onValueChange={setVatReturnFilingCategory}>
                  <SelectTrigger size="sm" className="h-8 w-[180px]">
                    <SelectValue placeholder="Filing category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GENERAL">General</SelectItem>
                    <SelectItem value="CATEGORY_A">Category A</SelectItem>
                    <SelectItem value="CATEGORY_C">Category C</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => createVatReturnMutation.mutate()}
                  disabled={createVatReturnMutation.isPending || !vatReturnPeriodId}
                >
                  Create Draft
                </Button>
              </div>
            }
            emptyState={vatReturnsLoading ? "Loading VAT returns..." : "No VAT returns found."}
          />
        </div>
      </VerticalDataViews>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>New Tax Code</SheetTitle>
            <SheetDescription>Add VAT and tax rates for invoicing.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Code *</label>
              <Input
                value={reservedId}
                readOnly
                placeholder={isReserving ? "Reserving..." : "Auto-generated"}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {reserveError ?? "Code is auto-generated and cannot be edited."}
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Name *</label>
              <Input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="VAT Standard"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Rate (%) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.rate}
                  onChange={(event) => setFormState((prev) => ({ ...prev, rate: event.target.value }))}
                  className="text-right font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Type</label>
                <Input
                  value={formState.type}
                  onChange={(event) => setFormState((prev) => ({ ...prev, type: event.target.value }))}
                  placeholder="VAT"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Applies To</label>
                <Select
                  value={formState.appliesTo}
                  onValueChange={(value) =>
                    setFormState((prev) => ({ ...prev, appliesTo: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Applies to" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOTH">Both</SelectItem>
                    <SelectItem value="SALES">Sales</SelectItem>
                    <SelectItem value="PURCHASE">Purchase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Schedule Type</label>
                <Select
                  value={formState.scheduleType}
                  onValueChange={(value) =>
                    setFormState((prev) => ({ ...prev, scheduleType: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Schedule type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    <SelectItem value="FX">Foreign Currency</SelectItem>
                    <SelectItem value="RTGS">RTGS</SelectItem>
                    <SelectItem value="WITHHOLDING">Withholding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">VAT-7 Output Box</label>
                <Input
                  value={formState.vat7OutputBox}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, vat7OutputBox: event.target.value }))
                  }
                  placeholder="outputStandardRatedTax"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">VAT-7 Input Box</label>
                <Input
                  value={formState.vat7InputBox}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, vat7InputBox: event.target.value }))
                  }
                  placeholder="inputDomesticTax"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending || isReserving || !reservedId}
              >
                Save Tax Code
              </Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </AccountingShell>
  );
}
