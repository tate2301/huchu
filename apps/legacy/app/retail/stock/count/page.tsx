"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Card, EmptyState, Skeleton } from "@corelithzw/react";
import { RetailShell } from "@corelithzw/module-sell/components/retail-shell";
import { Button } from "@corelithzw/ui/components/button";
import { DataTable } from "@corelithzw/ui/components/data-table";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@corelithzw/ui/components/select";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchSites } from "@corelithzw/platform/client/sites";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { ArrowRightLeft, LocalShipping } from "@corelithzw/ui/lib/icons";

type InventoryItemRow = {
  id: string;
  itemCode: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number | null;
};

function itemLabel(item: InventoryItemRow | undefined) {
  if (!item) return "";
  return `${item.name} (${item.itemCode})`;
}

export default function RetailStockCountPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState("");
  const [itemId, setItemId] = useState("");
  const [countedStock, setCountedStock] = useState("");
  const [notes, setNotes] = useState("");

  const sitesQuery = useQuery({ queryKey: ["retail-stock-count-sites"], queryFn: fetchSites });
  const activeSiteId = siteId || sitesQuery.data?.[0]?.id || "";
  const itemsQuery = useQuery({
    queryKey: ["retail-stock-count-items", activeSiteId],
    enabled: Boolean(activeSiteId),
    queryFn: () =>
      fetchJson<{ data: InventoryItemRow[] }>(
        `/api/inventory/items?siteId=${encodeURIComponent(activeSiteId)}&limit=200`,
      ),
  });

  const selectedItem = (itemsQuery.data?.data ?? []).find((item) => item.id === itemId);
  const countedValue = Number(countedStock || "0");
  const variance = selectedItem ? Number((countedValue - selectedItem.currentStock).toFixed(2)) : 0;

  const submitCountMutation = useMutation({
    mutationFn: () => {
      if (!selectedItem) throw new Error("Pick an inventory item first");
      return fetchJson("/api/v2/retail/stock/count", {
        method: "POST",
        body: JSON.stringify({
          siteId: activeSiteId,
          itemId: selectedItem.id,
          countedStock: countedValue,
          notes: notes.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Stock count posted", variant: "success" });
      setCountedStock("");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["retail-stock-count-items"] });
      queryClient.invalidateQueries({ queryKey: ["retail-stock-overview"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to post stock count",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<InventoryItemRow>[]>(
    () => [
      {
        id: "item",
        header: "Item",
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-[var(--text-strong)]">{row.original.name}</div>
            <div className="font-mono text-xs text-[var(--text-muted)]">{row.original.itemCode}</div>
          </div>
        ),
      },
      {
        id: "currentStock",
        header: "On hand",
        cell: ({ row }) => <NumericCell>{`${row.original.currentStock.toFixed(2)} ${row.original.unit}`}</NumericCell>,
      },
      {
        id: "minStock",
        header: "Min",
        cell: ({ row }) => (
          <NumericCell>{`${(row.original.minStock ?? 0).toFixed(2)} ${row.original.unit}`}</NumericCell>
        ),
      },
    ],
    [],
  );

  return (
    <RetailShell
      title="Stock Count"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/stock/transfers">
              <LocalShipping className="h-4 w-4" />
              Stock transfers
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/stock">
              <ArrowRightLeft className="h-4 w-4" />
              Back to stock
            </Link>
          </Button>
        </div>
      }
    >
      {itemsQuery.isError ? (
        <Alert tone="danger" title="Stock lines would not load">
          {getApiErrorMessage(itemsQuery.error)}
        </Alert>
      ) : null}

      <Card title="Count a line" subtitle="Post the difference between the shelf and the system.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Site</Label>
            <Select value={activeSiteId} onValueChange={setSiteId}>
              <SelectTrigger>
                <SelectValue placeholder="Select site" />
              </SelectTrigger>
              <SelectContent>
                {(sitesQuery.data ?? []).map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Item</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger>
                <SelectValue placeholder="Select item" />
              </SelectTrigger>
              <SelectContent>
                {(itemsQuery.data?.data ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {itemLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Counted stock</Label>
            <Input value={countedStock} onChange={(event) => setCountedStock(event.target.value)} inputMode="decimal" placeholder="0.00" />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Reason / context" />
          </div>
        </div>
        {selectedItem ? (
          <Alert
            className="mt-4"
            tone={variance === 0 ? "info" : "warn"}
            title={
              variance === 0
                ? "The count matches the system"
                : `The count is ${variance > 0 ? "over" : "under"} by ${Math.abs(variance).toFixed(2)} ${selectedItem.unit}`
            }
          >
            System holds {selectedItem.currentStock.toFixed(2)} {selectedItem.unit}. Posting writes
            the difference as a stock adjustment.
          </Alert>
        ) : null}
        <div className="mt-4">
          <Button
            onClick={() => submitCountMutation.mutate()}
            disabled={
              !selectedItem ||
              !Number.isFinite(countedValue) ||
              variance === 0 ||
              submitCountMutation.isPending
            }
          >
            Post count adjustment
          </Button>
        </div>
      </Card>

      {itemsQuery.isPending ? (
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Fetching stock lines…</span>
          <Skeleton height={360} />
        </div>
      ) : itemsQuery.isError ? (
        /*
          R-4.4. An error is not an empty list.

          This table used to fold loading into `emptyState` and have no error
          branch at all. `data ?? []` on a failed query is an empty array, so a
          500 rendered as "No orders" — a statement about the shop's business,
          made because the server fell over. The three states are separate now,
          and only the third says anything about the data.
        */
        <Alert tone="danger" title="The stock lines would not load">
          {getApiErrorMessage(itemsQuery.error)}
        </Alert>
      ) : (itemsQuery.data?.data ?? []).length === 0 ? (
        <EmptyState
          title="Nothing to count at this branch"
          body="A count checks what is on the shelf against what the system thinks. Add a stock line under Stores & Inventory first, or pick another branch."
        />
      ) : (
        <DataTable
          data={itemsQuery.data?.data ?? []}
          columns={columns}
          features={{ sorting: true, globalFilter: true, pagination: true }}
          pagination={{ enabled: true, server: false }}
          searchPlaceholder="Search inventory items"
          toolbar={<span className="t-body-sm t-muted">Lines you can count</span>}
        />
      )}
    </RetailShell>
  );
}
