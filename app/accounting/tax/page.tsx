"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { type TaxCodeRecord, fetchTaxCodes } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

export default function TaxSetupPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState({
    code: "",
    name: "",
    rate: "",
    type: "VAT",
    isActive: true,
  });

  const { data: taxCodes, isLoading, error } = useQuery({
    queryKey: ["accounting", "tax"],
    queryFn: fetchTaxCodes,
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
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load tax codes</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={taxCodes ?? []}
        columns={columns}
        searchPlaceholder="Search tax codes"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={isLoading ? "Loading tax codes..." : "No tax codes found."}
      />

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
