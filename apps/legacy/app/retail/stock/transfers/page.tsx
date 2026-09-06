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
import { fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { ArrowRightLeft, Scale } from "@corelithzw/ui/lib/icons";

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
      return fetchJson("/api/v2/retail/stock/transfers", {
        method: "POST",
        body: JSON.stringify({
          siteId: activeSiteId,
          itemId: selectedItem.id,
          toLocationId,
          quantity: transferQty,
          notes: notes.trim() || undefined,
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
      {itemsQuery.isError || locationsQuery.isError || transfersQuery.isError ? (
        <Alert tone="danger" title="Transfer data would not load">
          {getApiErrorMessage(
            itemsQuery.error ?? locationsQuery.error ?? transfersQuery.error,
          )}
        </Alert>
      ) : null}

      <Card title="Move stock" subtitle="Shift a line from one location in the branch to another.">
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
        {selectedItem && transferQty > selectedItem.currentStock ? (
          <Alert className="mt-4" tone="warn" title="More than the branch is holding">
            {selectedItem.name} has {selectedItem.currentStock.toFixed(2)} {selectedItem.unit} on
            hand. Reduce the quantity before posting.
          </Alert>
        ) : null}
        <div className="mt-4">
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
      </Card>

      {transfersQuery.isPending ? (
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Fetching transfer history…</span>
          <Skeleton height={360} />
        </div>
      ) : transfersQuery.isError ? (
        /*
          R-4.4. An error is not an empty list.

          This table used to fold loading into `emptyState` and have no error
          branch at all. `data ?? []` on a failed query is an empty array, so a
          500 rendered as "No orders" — a statement about the shop's business,
          made because the server fell over. The three states are separate now,
          and only the third says anything about the data.
        */
        <Alert tone="danger" title="The transfer history would not load">
          {getApiErrorMessage(transfersQuery.error)}
        </Alert>
      ) : (transfersQuery.data?.data ?? []).length === 0 ? (
        <EmptyState
          title="Nothing has been moved yet"
          body="A transfer moves a stock line from one location to another at the same branch — the storeroom to the shop floor, say. Post the first one above."
        />
      ) : (
        <DataTable
          data={transfersQuery.data?.data ?? []}
          columns={columns}
          features={{ sorting: true, globalFilter: true, pagination: true }}
          pagination={{ enabled: true, server: false }}
          searchPlaceholder="Search transfer history"
          toolbar={<span className="t-body-sm t-muted">Recent stock transfers</span>}
        />
      )}
    </RetailShell>
  );
}
