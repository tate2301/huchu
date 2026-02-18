"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/components/ui/use-toast";
import { type FixedAssetRecord, fetchAssets } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

const today = format(new Date(), "yyyy-MM-dd");

export default function AssetsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState({
    assetCode: "",
    name: "",
    category: "",
    acquisitionDate: today,
    cost: "",
    salvageValue: "",
    usefulLifeMonths: "36",
    depreciationMethod: "STRAIGHT_LINE",
    isActive: true,
  });
  const {
    reservedId,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "FIXED_ASSET",
    enabled: formOpen,
  });

  const { data: assetsData, isLoading, error } = useQuery({
    queryKey: ["accounting", "assets"],
    queryFn: () => fetchAssets({ limit: 200 }),
  });

  const assets = assetsData?.data ?? [];

  const columns = useMemo<ColumnDef<FixedAssetRecord>[]>(
    () => [
      {
        id: "code",
        header: "Asset Code",
        cell: ({ row }) => <span className="font-mono">{row.original.assetCode}</span>,
      },
      {
        id: "name",
        header: "Asset",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.category ?? "-"}</div>
          </div>
        ),
      },
      {
        id: "date",
        header: "Acquired",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.acquisitionDate), "yyyy-MM-dd")}
          </NumericCell>
        ),
      },
      {
        id: "cost",
        header: "Cost",
        cell: ({ row }) => <NumericCell>{row.original.cost.toFixed(2)}</NumericCell>,
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
      fetchJson("/api/accounting/assets", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Asset created",
        description: "Asset added to register.",
        variant: "success",
      });
      setFormOpen(false);
      setFormState({
        assetCode: "",
        name: "",
        category: "",
        acquisitionDate: today,
        cost: "",
        salvageValue: "",
        usefulLifeMonths: "36",
        depreciationMethod: "STRAIGHT_LINE",
        isActive: true,
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "assets"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create asset",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.name.trim() || !formState.cost) {
      toast({
        title: "Missing details",
        description: "Asset name and cost are required.",
        variant: "destructive",
      });
      return;
    }

    if (!reservedId.trim()) {
      toast({
        title: "Unable to reserve asset code",
        description: reserveError ?? "Please wait for code reservation to complete.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      assetCode: reservedId.trim(),
      name: formState.name.trim(),
      category: formState.category.trim() || undefined,
      acquisitionDate: formState.acquisitionDate,
      cost: Number(formState.cost),
      salvageValue: formState.salvageValue ? Number(formState.salvageValue) : undefined,
      usefulLifeMonths: formState.usefulLifeMonths ? Number(formState.usefulLifeMonths) : undefined,
      depreciationMethod: formState.depreciationMethod,
      isActive: formState.isActive,
    });
  };

  return (
    <AccountingShell
      activeTab="assets"
      title="Fixed Assets"
      description="Maintain the fixed asset register and depreciation details."
      actions={
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 size-4" />
          New Asset
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load assets</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={assets}
        columns={columns}
        searchPlaceholder="Search assets"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={isLoading ? "Loading assets..." : "No assets found."}
      />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>New Asset</SheetTitle>
            <SheetDescription>Add an asset to the fixed asset register.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Asset Code *</label>
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
              <label className="block text-sm font-semibold mb-2">Asset Name *</label>
              <Input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Excavator"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Category</label>
              <Input
                value={formState.category}
                onChange={(event) => setFormState((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Plant & Machinery"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Acquisition Date *</label>
              <Input
                type="date"
                value={formState.acquisitionDate}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, acquisitionDate: event.target.value }))
                }
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Cost *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.cost}
                  onChange={(event) => setFormState((prev) => ({ ...prev, cost: event.target.value }))}
                  className="text-right font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Salvage Value</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.salvageValue}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, salvageValue: event.target.value }))
                  }
                  className="text-right font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Useful Life (Months)</label>
                <Input
                  type="number"
                  min="1"
                  value={formState.usefulLifeMonths}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, usefulLifeMonths: event.target.value }))
                  }
                  className="text-right font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Depreciation Method</label>
                <Select
                  value={formState.depreciationMethod}
                  onValueChange={(value) =>
                    setFormState((prev) => ({ ...prev, depreciationMethod: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STRAIGHT_LINE">Straight Line</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending || isReserving || !reservedId}
              >
                Save Asset
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
