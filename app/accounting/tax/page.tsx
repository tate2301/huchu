"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
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
  type VatSummaryRow,
  fetchAccountingPeriods,
  fetchTaxCodes,
  fetchVatSummary,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

export default function TaxSetupPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<"codes" | "vat-summary">("codes");
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState({
    code: "",
    name: "",
    rate: "",
    type: "VAT",
    isActive: true,
  });
  const [summaryPeriodId, setSummaryPeriodId] = useState("");
  const [summaryStartDate, setSummaryStartDate] = useState("");
  const [summaryEndDate, setSummaryEndDate] = useState("");

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

  const columns = useMemo<ColumnDef<TaxCodeRecord>[]>(
    () => [
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
      },
      {
        id: "name",
        header: "Tax Name",
        accessorKey: "name",
      },
      {
        id: "rate",
        header: "Rate",
        cell: ({ row }) => <span className="font-mono">{row.original.rate}%</span>,
      },
      {
        id: "type",
        header: "Type",
        accessorKey: "type",
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "outline"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const vatColumns = useMemo<ColumnDef<VatSummaryRow>[]>(
    () => [
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
      },
      {
        id: "name",
        header: "Tax Name",
        accessorKey: "name",
      },
      {
        id: "rate",
        header: "Rate",
        cell: ({ row }) => <span className="font-mono">{row.original.rate}%</span>,
      },
      {
        id: "output",
        header: "Output VAT",
        cell: ({ row }) => <NumericCell>{row.original.outputTax.toFixed(2)}</NumericCell>,
      },
      {
        id: "input",
        header: "Input VAT",
        cell: ({ row }) => <NumericCell>{row.original.inputTax.toFixed(2)}</NumericCell>,
      },
      {
        id: "net",
        header: "Net VAT",
        cell: ({ row }) => <NumericCell>{row.original.netTax.toFixed(2)}</NumericCell>,
      },
    ],
    [],
  );

  const periods = periodsData?.data ?? [];
  const vatRows = vatSummary?.rows ?? [];
  const vatTotals = vatSummary?.totals ?? { outputTax: 0, inputTax: 0, netTax: 0 };

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
      setFormState({ code: "", name: "", rate: "", type: "VAT", isActive: true });
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.code.trim() || !formState.name.trim() || !formState.rate) {
      toast({
        title: "Missing details",
        description: "Code, name, and rate are required.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      code: formState.code.trim(),
      name: formState.name.trim(),
      rate: Number(formState.rate),
      type: formState.type,
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
      {(error || vatSummaryError) ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load tax codes</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error || vatSummaryError)}</AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "codes", label: "Tax Codes", count: taxCodes?.length ?? 0 },
          { id: "vat-summary", label: "VAT Summary", count: vatRows.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as "codes" | "vat-summary")}
        railLabel="Tax Views"
      >
        <div className={activeView === "codes" ? "space-y-3" : "hidden"}>
          <DataTable
            data={taxCodes ?? []}
            columns={columns}
            searchPlaceholder="Search tax codes"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={isLoading ? "Loading tax codes..." : "No tax codes found."}
          />
        </div>
        <div className={activeView === "vat-summary" ? "space-y-3" : "hidden"}>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>Output VAT</CardDescription>
                <CardTitle className="font-mono">{vatTotals.outputTax.toFixed(2)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Input VAT</CardDescription>
                <CardTitle className="font-mono">{vatTotals.inputTax.toFixed(2)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Net VAT</CardDescription>
                <CardTitle className="font-mono">{vatTotals.netTax.toFixed(2)}</CardTitle>
              </CardHeader>
            </Card>
          </div>
          <DataTable
            data={vatRows}
            columns={vatColumns}
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
      </VerticalDataViews>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>New Tax Code</SheetTitle>
            <SheetDescription>Add VAT and tax rates for invoicing.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Code *</label>
              <Input
                value={formState.code}
                onChange={(event) => setFormState((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="VAT"
                required
              />
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
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
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
