"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, EmptyState, Skeleton, StatCard } from "@corelithzw/react";
import { RetailShell } from "@corelithzw/module-sell/components/retail-shell";
import { Button } from "@corelithzw/ui/components/button";
import { DataTable } from "@corelithzw/ui/components/data-table";
import { Input } from "@corelithzw/ui/components/input";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { BarChart3, Package, ReceiptLong } from "@corelithzw/ui/lib/icons";

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

  const actions = (
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
  );

  if (catalogQuery.isPending) {
    return (
      <RetailShell title="Pricing" actions={actions}>
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Reading shelf prices…</span>
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
          </div>
          <Skeleton height={360} />
        </div>
      </RetailShell>
    );
  }

  if (catalogQuery.isError) {
    return (
      <RetailShell title="Pricing" actions={actions}>
        <Alert tone="danger" title="Shelf prices would not load">
          {getApiErrorMessage(catalogQuery.error)}
        </Alert>
      </RetailShell>
    );
  }

  const items = catalogQuery.data.data;
  const averagePrice = items.length
    ? items.reduce((total, item) => total + item.unitPrice, 0) / items.length
    : 0;
  const compareAtCount = items.filter(
    (item) => item.compareAtPrice && item.compareAtPrice > item.unitPrice,
  ).length;

  return (
    <RetailShell title="Pricing" actions={actions}>
      {items.length === 0 ? (
        <EmptyState
          title="Nothing is priced yet"
          body="Add an item to the catalogue and its shelf price becomes editable here, line by line."
          action={
            <Button asChild size="sm">
              <Link href="/retail/catalog">Open the catalogue</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Priced lines" value={String(items.length)} footer="On the shelf today" />
            <StatCard
              label="Average shelf price"
              value={averagePrice.toFixed(2)}
              footer="Across every line"
            />
            <StatCard
              label="Showing a was-price"
              value={String(compareAtCount)}
              footer="Compare-at above the sell price"
            />
          </div>
          <DataTable
            data={items}
            columns={columns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search pricing"
            emptyState="No lines match that search."
            toolbar={<span className="t-body-sm t-muted">Live shelf pricing</span>}
          />
        </>
      )}
    </RetailShell>
  );
}
