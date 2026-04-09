"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { BarChart3, Package, ReceiptLong } from "@/lib/icons";

type CatalogItem = {
  id: string;
  catalogCode: string;
  name: string;
  unitPrice: number;
  compareAtPrice: number | null;
  taxPercent: number;
  status: string;
};

export default function RetailPricingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, { unitPrice: string; compareAtPrice: string; taxPercent: string }>>({});

  const catalogQuery = useQuery({
    queryKey: ["retail-pricing-catalog"],
    queryFn: () => fetchJson<{ data: CatalogItem[] }>("/api/v2/retail/catalog"),
  });

  const updateMutation = useMutation({
    mutationFn: async (item: CatalogItem) => {
      const draft = drafts[item.id];
      return fetchJson(`/api/v2/retail/catalog/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          unitPrice: Number(draft?.unitPrice ?? item.unitPrice),
          compareAtPrice: draft?.compareAtPrice ? Number(draft.compareAtPrice) : null,
          taxPercent: Number(draft?.taxPercent ?? item.taxPercent),
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Pricing updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-pricing-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to update pricing",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<CatalogItem>[]>(
    () => [
      {
        id: "item",
        header: "Item",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="font-mono text-xs text-[var(--text-muted)]">{row.original.catalogCode}</div>
          </div>
        ),
      },
      {
        id: "unitPrice",
        header: "Sell price",
        cell: ({ row }) => (
          <Input
            value={drafts[row.original.id]?.unitPrice ?? String(row.original.unitPrice)}
            inputMode="decimal"
            className="h-8"
            onChange={(event) =>
              setDrafts((current) => ({
                ...current,
                [row.original.id]: {
                  unitPrice: event.target.value,
                  compareAtPrice: current[row.original.id]?.compareAtPrice ?? (row.original.compareAtPrice ? String(row.original.compareAtPrice) : ""),
                  taxPercent: current[row.original.id]?.taxPercent ?? String(row.original.taxPercent),
                },
              }))
            }
          />
        ),
      },
      {
        id: "compareAtPrice",
        header: "Compare at",
        cell: ({ row }) => (
          <Input
            value={drafts[row.original.id]?.compareAtPrice ?? (row.original.compareAtPrice ? String(row.original.compareAtPrice) : "")}
            inputMode="decimal"
            className="h-8"
            onChange={(event) =>
              setDrafts((current) => ({
                ...current,
                [row.original.id]: {
                  unitPrice: current[row.original.id]?.unitPrice ?? String(row.original.unitPrice),
                  compareAtPrice: event.target.value,
                  taxPercent: current[row.original.id]?.taxPercent ?? String(row.original.taxPercent),
                },
              }))
            }
          />
        ),
      },
      {
        id: "tax",
        header: "Tax %",
        cell: ({ row }) => (
          <Input
            value={drafts[row.original.id]?.taxPercent ?? String(row.original.taxPercent)}
            inputMode="decimal"
            className="h-8"
            onChange={(event) =>
              setDrafts((current) => ({
                ...current,
                [row.original.id]: {
                  unitPrice: current[row.original.id]?.unitPrice ?? String(row.original.unitPrice),
                  compareAtPrice: current[row.original.id]?.compareAtPrice ?? (row.original.compareAtPrice ? String(row.original.compareAtPrice) : ""),
                  taxPercent: event.target.value,
                },
              }))
            }
          />
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => row.original.status,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => updateMutation.mutate(row.original)}>
              Save
            </Button>
          </div>
        ),
      },
    ],
    [drafts, updateMutation],
  );

  return (
    <RetailShell
      title="Pricing"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/catalog">
              <Package className="h-4 w-4" />
              Catalog
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/merchandising/promotions">
              <ReceiptLong className="h-4 w-4" />
              Promotions
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/reports">
              <BarChart3 className="h-4 w-4" />
              Reports
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Active items</div>
          <div className="mt-2 font-mono text-xl font-semibold">{catalogQuery.data?.data.length ?? 0}</div>
        </div>
        <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Average sell price</div>
          <div className="mt-2 font-mono text-xl font-semibold">
            {(
              (catalogQuery.data?.data.reduce((total, item) => total + item.unitPrice, 0) ?? 0) /
              Math.max(catalogQuery.data?.data.length ?? 1, 1)
            ).toFixed(2)}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Compare-at coverage</div>
          <div className="mt-2 font-mono text-xl font-semibold">
            {catalogQuery.data?.data.filter((item) => item.compareAtPrice && item.compareAtPrice > item.unitPrice).length ?? 0}
          </div>
        </div>
      </div>
      <DataTable
        data={catalogQuery.data?.data ?? []}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search pricing"
        emptyState={catalogQuery.isLoading ? "Loading pricing..." : "No retail items yet"}
        toolbar={<span className="text-xs text-[var(--text-muted)]">Live shelf pricing</span>}
      />
    </RetailShell>
  );
}
