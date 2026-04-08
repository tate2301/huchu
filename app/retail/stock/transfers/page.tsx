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
import { ArrowRightLeft, Scale } from "@/lib/icons";

type InventoryItemRow = {
  id: string;
  itemCode: string;
  name: string;
  unit: string;
  currentStock: number;
  location: { name: string } | null;
};

type StockLocation = {
  id: string;
  code: string;
  name: string;
};

type StockMovement = {
  id: string;
  referenceId: string;
  movementType: string;
  quantity: number;
  unit: string;
  createdAt: string;
  item: {
    name: string;
    itemCode: string;
    location: { name: string } | null;
  };
  toLocation: { name: string } | null;
};

export default function RetailStockTransfersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState("");
  const [itemId, setItemId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  const sitesQuery = useQuery({ queryKey: ["retail-stock-transfer-sites"], queryFn: fetchSites });
  const activeSiteId = siteId || sitesQuery.data?.[0]?.id || "";

  const itemsQuery = useQuery({
    queryKey: ["retail-stock-transfer-items", activeSiteId],
    enabled: Boolean(activeSiteId),
    queryFn: () =>
      fetchJson<{ data: InventoryItemRow[] }>(
        `/api/inventory/items?siteId=${encodeURIComponent(activeSiteId)}&limit=200`,
      ),
  });

  const locationsQuery = useQuery({
    queryKey: ["retail-stock-transfer-locations", activeSiteId],
    enabled: Boolean(activeSiteId),
    queryFn: () =>
      fetchJson<{ data: StockLocation[] }>(
        `/api/stock-locations?siteId=${encodeURIComponent(activeSiteId)}&active=true&limit=200`,
      ),
  });

  const transfersQuery = useQuery({
    queryKey: ["retail-stock-transfer-movements", activeSiteId],
    enabled: Boolean(activeSiteId),
    queryFn: () =>
      fetchJson<{ data: StockMovement[] }>(
        `/api/inventory/movements?siteId=${encodeURIComponent(activeSiteId)}&movementType=TRANSFER&limit=80`,
      ),
  });

  const selectedItem = (itemsQuery.data?.data ?? []).find((item) => item.id === itemId);
  const transferQty = Number(quantity || "0");

  const submitTransferMutation = useMutation({
    mutationFn: () => {
      if (!selectedItem) throw new Error("Pick an inventory item first");
      return fetchJson("/api/inventory/movements", {
        method: "POST",
        body: JSON.stringify({
          itemId: selectedItem.id,
          movementType: "TRANSFER",
          toLocationId,
          quantity: transferQty,
          unit: selectedItem.unit,
          notes: notes.trim() || `Retail transfer of ${selectedItem.name}`,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Stock transfer posted", variant: "success" });
      setQuantity("");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["retail-stock-transfer-movements"] });
      queryClient.invalidateQueries({ queryKey: ["retail-stock-transfer-items"] });
      queryClient.invalidateQueries({ queryKey: ["retail-stock-overview"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to post stock transfer",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<StockMovement>[]>(
    () => [
      {
        id: "reference",
        header: "Reference",
        cell: ({ row }) => (
          <div>
            <div className="font-mono text-xs">{row.original.referenceId}</div>
            <div className="text-xs text-[var(--text-muted)]">
              {new Date(row.original.createdAt).toLocaleString()}
            </div>
          </div>
        ),
      },
      {
        id: "item",
        header: "Item",
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-[var(--text-strong)]">{row.original.item.name}</div>
            <div className="font-mono text-xs text-[var(--text-muted)]">{row.original.item.itemCode}</div>
          </div>
        ),
      },
      {
        id: "move",
        header: "Move",
        cell: ({ row }) => (
          <NumericCell align="left">
            {row.original.item.location?.name ?? "Source"} {"->"}{" "}
            {row.original.toLocation?.name ?? "Destination"}
          </NumericCell>
        ),
      },
      {
        id: "quantity",
        header: "Qty",
        cell: ({ row }) => (
          <NumericCell>{`${Math.abs(row.original.quantity).toFixed(2)} ${row.original.unit}`}</NumericCell>
        ),
      },
    ],
    [],
  );

  return (
    <RetailShell
      title="Stock Transfers"
      description="Move stock between locations without leaving the Retail workflow."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/stock/count">
              <Scale className="h-4 w-4" />
              Stock count
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
                    {item.name} ({item.itemCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>To location</Label>
            <Select value={toLocationId} onValueChange={setToLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Destination location" />
              </SelectTrigger>
              <SelectContent>
                {(locationsQuery.data?.data ?? []).map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name} ({location.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" placeholder="0.00" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Transfer reason" />
          </div>
        </div>
        <div className="mt-3">
          <Button
            onClick={() => submitTransferMutation.mutate()}
            disabled={
              !selectedItem ||
              !toLocationId ||
              !Number.isFinite(transferQty) ||
              transferQty <= 0 ||
              transferQty > selectedItem.currentStock ||
              submitTransferMutation.isPending
            }
          >
            Post transfer
          </Button>
        </div>
      </div>

      <DataTable
        data={transfersQuery.data?.data ?? []}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search transfer history"
        emptyState={transfersQuery.isLoading ? "Loading transfers..." : "No transfers yet"}
        toolbar={<span className="text-xs text-[var(--text-muted)]">Recent retail stock transfers</span>}
      />
    </RetailShell>
  );
}
