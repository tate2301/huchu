"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { RetailShell } from "@/components/retail/retail-shell";
import { FieldHelp } from "@/components/shared/field-help";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchInventoryItems, fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { History, Plus, ReceiptLong } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

type Receipt = {
  id: string;
  receiptNo: string;
  siteId: string;
  supplierName: string;
  createdAt: string;
  notes: string | null;
  totalValue: number;
  totalQuantity: number;
  site: { id: string; name: string; code: string } | null;
};

type PurchaseOrder = {
  id: string;
  poNo: string;
  supplierName: string;
  siteId: string;
  lines: Array<{ inventoryItemId: string | null; itemName: string; quantity: number; unitCost: number }>;
};

type ReceiptLineForm = {
  inventoryItemId: string;
  quantity: string;
  unitCost: string;
};

type ReceiptForm = {
  siteId: string;
  purchaseOrderId: string;
  supplierName: string;
  notes: string;
  lines: ReceiptLineForm[];
};

function emptyForm(siteId = ""): ReceiptForm {
  return {
    siteId,
    purchaseOrderId: "",
    supplierName: "",
    notes: "",
    lines: [{ inventoryItemId: "", quantity: "1", unitCost: "" }],
  };
}

export default function RetailReceiptsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const sitesQuery = useQuery({ queryKey: ["retail-receipt-sites"], queryFn: fetchSites });
  const inventoryQuery = useQuery({
    queryKey: ["retail-receipt-inventory"],
    queryFn: () => fetchInventoryItems({ limit: 500 }),
  });
  const ordersQuery = useQuery({
    queryKey: ["retail-open-orders-for-receipts"],
    queryFn: () => fetchJson<{ data: PurchaseOrder[] }>("/api/v2/retail/purchasing/orders"),
  });
  const receiptsQuery = useQuery({
    queryKey: ["retail-receipts"],
    queryFn: () => fetchJson<{ data: Receipt[] }>("/api/v2/retail/purchasing/receipts"),
  });
  const [form, setForm] = useState<ReceiptForm>(() => emptyForm(""));

  const {
    reservedId: receiptNo,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "RETAIL_GOODS_RECEIPT",
    enabled: dialogOpen && Boolean(form.siteId),
    siteId: form.siteId || undefined,
  });

  const sites = sitesQuery.data ?? [];
  const inventoryItems = inventoryQuery.data?.data ?? [];
  const orders = ordersQuery.data?.data ?? [];
  const siteOptions = useMemo<SearchableOption[]>(
    () => sites.map((site) => ({ value: site.id, label: site.name, meta: site.code })),
    [sites],
  );
  const inventoryOptions = useMemo<SearchableOption[]>(
    () =>
      inventoryItems.map((item) => ({
        value: item.id,
        label: item.name,
        description: `${item.currentStock.toFixed(2)} ${item.unit}`,
        meta: item.itemCode,
      })),
    [inventoryItems],
  );
  const orderOptions = useMemo<SearchableOption[]>(
    () =>
      orders.map((order) => ({
        value: order.id,
        label: order.poNo,
        description: order.supplierName,
      })),
    [orders],
  );

  const saveMutation = useMutation({
    mutationFn: async (payload: ReceiptForm) =>
      fetchJson("/api/v2/retail/purchasing/receipts", {
        method: "POST",
        body: JSON.stringify({
          receiptNo: receiptNo || undefined,
          purchaseOrderId: payload.purchaseOrderId || undefined,
          siteId: payload.siteId,
          supplierName: payload.supplierName,
          notes: payload.notes.trim() || undefined,
          lines: payload.lines.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            quantity: Number(line.quantity),
            unitCost: Number(line.unitCost),
          })),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Receipt posted", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["retail-purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
      setDialogOpen(false);
      setForm(emptyForm(sites[0]?.id ?? ""));
    },
    onError: (error) => {
      toast({
        title: "Unable to post receipt",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<Receipt>[]>(
    () => [
      {
        id: "receiptNo",
        header: "Receipt #",
        cell: ({ row }) => (
          <div>
            <div className="font-mono font-semibold">{row.original.receiptNo}</div>
            <div className="text-xs text-[var(--text-muted)]">{row.original.site?.name ?? "No site"}</div>
          </div>
        ),
      },
      { id: "supplier", header: "Supplier", cell: ({ row }) => row.original.supplierName },
      {
        id: "createdAt",
        header: "Posted",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </NumericCell>
        ),
      },
      {
        id: "qty",
        header: "Qty",
        cell: ({ row }) => <NumericCell>{row.original.totalQuantity.toFixed(2)}</NumericCell>,
      },
      {
        id: "value",
        header: "Value",
        cell: ({ row }) => <NumericCell>{row.original.totalValue.toFixed(2)}</NumericCell>,
      },
    ],
    [],
  );

  return (
    <RetailShell
      title="Receipts"
      description="Receive stock into Stores without leaving retail operations."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              setForm(emptyForm(sites[0]?.id ?? ""));
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New receipt
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/purchasing/orders">
              <ReceiptLong className="h-4 w-4" />
              Purchase Orders
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/stores/movements">
              <History className="h-4 w-4" />
              Stock Movements
            </Link>
          </Button>
        </div>
      }
    >
      <DataTable
        data={receiptsQuery.data?.data ?? []}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search receipts"
        emptyState={receiptsQuery.isLoading ? "Loading receipts..." : "No receipts yet"}
        toolbar={<span className="text-xs text-[var(--text-muted)]">Posted retail receipts</span>}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New receipt</DialogTitle>
            <DialogDescription>Post received stock straight into shared inventory.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Receipt number</label>
                <Input value={receiptNo} readOnly disabled={isReserving} />
                <FieldHelp error={reserveError ?? undefined} hint={reserveError ? undefined : "Generated automatically."} />
              </div>
              <SearchableSelect
                label="Site"
                value={form.siteId}
                options={siteOptions}
                placeholder="Select site"
                onValueChange={(value) => setForm((current) => ({ ...current, siteId: value }))}
              />
              <SearchableSelect
                label="Purchase order"
                value={form.purchaseOrderId}
                options={orderOptions}
                placeholder="Optional PO"
                onValueChange={(value) => {
                  const order = orders.find((entry) => entry.id === value);
                  setForm({
                    siteId: order?.siteId ?? form.siteId,
                    purchaseOrderId: value,
                    supplierName: order?.supplierName ?? "",
                    notes: "",
                    lines:
                      order?.lines.map((line) => ({
                        inventoryItemId: line.inventoryItemId ?? "",
                        quantity: String(Math.max(line.quantity, 1)),
                        unitCost: String(line.unitCost),
                      })) ?? form.lines,
                  });
                }}
              />
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Supplier</label>
                <Input value={form.supplierName} onChange={(event) => setForm((current) => ({ ...current, supplierName: event.target.value }))} />
              </div>
            </div>

            <div className="space-y-3">
              {form.lines.map((line, index) => (
                <div key={index} className="rounded-2xl bg-[var(--surface-muted)] p-3">
                  <div className="grid gap-4 md:grid-cols-[1.2fr_140px_140px_auto]">
                    <SearchableSelect
                      label="Stock item"
                      value={line.inventoryItemId}
                      options={inventoryOptions}
                      placeholder="Select stock item"
                      onValueChange={(value) => setForm((current) => ({ ...current, lines: current.lines.map((entry, entryIndex) => entryIndex === index ? { ...entry, inventoryItemId: value } : entry) }))}
                      onAddOption={() => window.location.assign("/stores/inventory")}
                      addLabel="Add new stock item"
                    />
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold">Qty</label>
                      <Input value={line.quantity} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, lines: current.lines.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantity: event.target.value } : entry) }))} />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold">Unit cost</label>
                      <Input value={line.unitCost} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, lines: current.lines.map((entry, entryIndex) => entryIndex === index ? { ...entry, unitCost: event.target.value } : entry) }))} />
                    </div>
                    <div className="flex items-end">
                      <Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((_, entryIndex) => entryIndex !== index) }))} disabled={form.lines.length === 1}>
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, { inventoryItemId: "", quantity: "1", unitCost: "" }] }))}>
                Add line
              </Button>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold">Notes</label>
              <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending || !form.siteId || !form.supplierName}>Post receipt</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}
