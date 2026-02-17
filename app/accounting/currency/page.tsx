"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { type CurrencyRateRecord, fetchCurrencyRates } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

const today = format(new Date(), "yyyy-MM-dd");

export default function CurrencyRatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState({
    baseCurrency: "USD",
    quoteCurrency: "ZWL",
    rate: "",
    effectiveDate: today,
  });

  const { data: ratesData, isLoading, error } = useQuery({
    queryKey: ["accounting", "currency"],
    queryFn: () => fetchCurrencyRates({ limit: 200 }),
  });

  const rates = ratesData?.data ?? [];

  const columns = useMemo<ColumnDef<CurrencyRateRecord>[]>(
    () => [
      {
        id: "pair",
        header: "Pair",
        cell: ({ row }) => (
          <span className="font-mono">
            {row.original.baseCurrency}/{row.original.quoteCurrency}
          </span>
        ),
      },
      {
        id: "rate",
        header: "Rate",
        cell: ({ row }) => <NumericCell>{row.original.rate.toFixed(6)}</NumericCell>,
      },
      {
        id: "date",
        header: "Effective Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.effectiveDate), "yyyy-MM-dd")}
          </NumericCell>
        ),
      },
    ],
    [],
  );

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/currency", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Rate created",
        description: "Currency rate saved successfully.",
        variant: "success",
      });
      setFormOpen(false);
      setFormState({ baseCurrency: "USD", quoteCurrency: "ZWL", rate: "", effectiveDate: today });
      queryClient.invalidateQueries({ queryKey: ["accounting", "currency"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create rate",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.baseCurrency.trim() || !formState.quoteCurrency.trim() || !formState.rate) {
      toast({
        title: "Missing details",
        description: "Base currency, quote currency, and rate are required.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      baseCurrency: formState.baseCurrency.trim(),
      quoteCurrency: formState.quoteCurrency.trim(),
      rate: Number(formState.rate),
      effectiveDate: formState.effectiveDate,
    });
  };

  return (
    <AccountingShell
      activeTab="currency"
      title="Currency Rates"
      description="Maintain exchange rates for multi-currency accounting."
      actions={
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 size-4" />
          New Rate
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load currency rates</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={rates}
        columns={columns}
        searchPlaceholder="Search currency pairs"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={isLoading ? "Loading currency rates..." : "No currency rates found."}
      />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>New Currency Rate</SheetTitle>
            <SheetDescription>Add a new base/quote exchange rate.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Base Currency *</label>
                <Input
                  value={formState.baseCurrency}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, baseCurrency: event.target.value }))
                  }
                  placeholder="USD"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Quote Currency *</label>
                <Input
                  value={formState.quoteCurrency}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, quoteCurrency: event.target.value }))
                  }
                  placeholder="ZWL"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Rate *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={formState.rate}
                  onChange={(event) => setFormState((prev) => ({ ...prev, rate: event.target.value }))}
                  className="text-right font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Effective Date *</label>
                <Input
                  type="date"
                  value={formState.effectiveDate}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, effectiveDate: event.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
                Save Rate
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
