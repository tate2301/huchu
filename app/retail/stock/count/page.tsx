"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowRightLeft, LocalShipping } from "@/lib/icons";

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
      description="Capture physical counts and post variance adjustments inside Retail."
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
      <div className="rounded-2xl bg-[var(--surface-muted)] p-3">
        <div className="grid gap-2 md:grid-cols-2">
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
          <div className="mt-3 rounded-xl bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-muted)]">
            Current {selectedItem.currentStock.toFixed(2)} {selectedItem.unit}, variance <span className="font-mono">{variance.toFixed(2)}</span>
          </div>
        ) : null}
        <div className="mt-3">
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
      </div>

      <DataTable
        data={itemsQuery.data?.data ?? []}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search inventory items"
        emptyState={itemsQuery.isLoading ? "Loading inventory..." : "No inventory items found"}
        toolbar={<span className="text-xs text-[var(--text-muted)]">Retail stock count candidate items</span>}
      />
    </RetailShell>
  );
}
