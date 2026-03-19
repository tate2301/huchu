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
import { LocalShipping, Package, Pencil, Plus, Trash2 } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

type PurchaseOrderLine = {
  inventoryItemId: string | null;
  itemName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
};

type PurchaseOrder = {
  id: string;
  poNo: string;
  siteId: string;
  supplierName: string;
  status: string;
  expectedDate: string | null;
  notes: string | null;
  lines: PurchaseOrderLine[];
  totalValue: number;
  totalQuantity: number;
  receivedQuantity: number;
  site: { id: string; name: string; code: string } | null;
};

type OrderLineForm = {
  inventoryItemId: string;
  itemName: string;
  quantity: string;
  unitCost: string;
};

type OrderForm = {
  siteId: string;
  supplierName: string;
  expectedDate: string;
  status: string;
  notes: string;
  lines: OrderLineForm[];
};

function emptyForm(siteId = ""): OrderForm {
  return {
    siteId,
    supplierName: "",
    expectedDate: "",
    status: "DRAFT",
    notes: "",
    lines: [{ inventoryItemId: "", itemName: "", quantity: "1", unitCost: "" }],
  };
}

export default function RetailPurchaseOrdersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const sitesQuery = useQuery({ queryKey: ["retail-sites"], queryFn: fetchSites });
  const inventoryQuery = useQuery({
    queryKey: ["retail-order-inventory"],
    queryFn: () => fetchInventoryItems({ limit: 500 }),
  });
  const ordersQuery = useQuery({
    queryKey: ["retail-purchase-orders"],
    queryFn: () => fetchJson<{ data: PurchaseOrder[] }>("/api/v2/retail/purchasing/orders"),
  });
  const [form, setForm] = useState<OrderForm>(() => emptyForm(""));

  const {
    reservedId: poNo,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "RETAIL_PURCHASE_ORDER",
    enabled: dialogOpen && !editing && Boolean(form.siteId),
    siteId: form.siteId || undefined,
  });

  const inventoryItems = inventoryQuery.data?.data ?? [];
  const sites = sitesQuery.data ?? [];
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

  const saveMutation = useMutation({
    mutationFn: async (payload: OrderForm) => {
      const body = {
        poNo: editing ? undefined : poNo || undefined,
        siteId: payload.siteId,
        supplierName: payload.supplierName,
        expectedDate: payload.expectedDate ? new Date(payload.expectedDate).toISOString() : undefined,
        status: payload.status,
        notes: payload.notes.trim() || undefined,
        lines: payload.lines.map((line) => ({
          inventoryItemId: line.inventoryItemId || undefined,
          itemName: line.itemName.trim() || undefined,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
        })),
      };

      if (editing) {
        return fetchJson(`/api/v2/retail/purchasing/orders/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }

      return fetchJson("/api/v2/retail/purchasing/orders", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: editing ? "Purchase order updated" : "Purchase order created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-purchase-orders"] });
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm(sites[0]?.id ?? ""));
    },
    onError: (error) => {
      toast({
        title: editing ? "Unable to update purchase order" : "Unable to create purchase order",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/retail/purchasing/orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Purchase order removed", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-purchase-orders"] });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast({
        title: "Unable to remove purchase order",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<PurchaseOrder>[]>(
    () => [
      {
        id: "poNo",
        header: "PO #",
        cell: ({ row }) => (
          <div>
            <div className="font-mono font-semibold">{row.original.poNo}</div>
            <div className="text-xs text-[var(--text-muted)]">{row.original.site?.name ?? "No site"}</div>
          </div>
        ),
      },
      {
        id: "supplierName",
        header: "Supplier",
        cell: ({ row }) => row.original.supplierName,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => row.original.status,
      },
      {
        id: "expectedDate",
        header: "Expected",
        cell: ({ row }) => (
          <NumericCell align="left">
            {row.original.expectedDate ? new Date(row.original.expectedDate).toLocaleDateString() : "-"}
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
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(row.original);
                setForm({
                  siteId: row.original.siteId,
                  supplierName: row.original.supplierName,
                  expectedDate: row.original.expectedDate ? row.original.expectedDate.slice(0, 10) : "",
                  status: row.original.status,
                  notes: row.original.notes ?? "",
                  lines: row.original.lines.map((line) => ({
                    inventoryItemId: line.inventoryItemId ?? "",
                    itemName: line.itemName,
                    quantity: String(line.quantity),
                    unitCost: String(line.unitCost),
                  })),
                });
                setDialogOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeleteTarget(row.original)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <RetailShell
      title="Purchasing"
      description="Raise POs and feed receiving into shared stock."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setForm(emptyForm(sites[0]?.id ?? ""));
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New PO
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/purchasing/receipts">
              <LocalShipping className="h-4 w-4" />
              Post Receipt
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/stores/inventory">
              <Package className="h-4 w-4" />
              Stock on Hand
            </Link>
          </Button>
        </div>
      }
    >
      <DataTable
        data={ordersQuery.data?.data ?? []}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search purchase orders"
        emptyState={ordersQuery.isLoading ? "Loading purchase orders..." : "No purchase orders yet"}
        toolbar={<span className="text-xs text-[var(--text-muted)]">Open purchasing workload</span>}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit purchase order" : "New purchase order"}</DialogTitle>
            <DialogDescription>Use shared stock items so receiving posts cleanly into Stores.</DialogDescription>
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
                <label className="block text-sm font-semibold">PO number</label>
                <Input value={editing ? editing.poNo : poNo} readOnly disabled={isReserving && !editing} />
                <FieldHelp error={reserveError ?? undefined} hint={reserveError ? undefined : "Generated automatically."} />
              </div>
              <SearchableSelect
                label="Site"
                value={form.siteId}
                options={siteOptions}
                placeholder="Select site"
                onValueChange={(value) => setForm((current) => ({ ...current, siteId: value }))}
              />
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Supplier</label>
                <Input value={form.supplierName} onChange={(event) => setForm((current) => ({ ...current, supplierName: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Expected date</label>
                <Input type="date" value={form.expectedDate} onChange={(event) => setForm((current) => ({ ...current, expectedDate: event.target.value }))} />
              </div>
            </div>

            <div className="space-y-3">
              {form.lines.map((line, index) => (
                <div key={index} className="rounded-2xl bg-[var(--surface-muted)] p-3">
                  <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_120px_120px_auto]">
                    <SearchableSelect
                      label="Stock item"
                      value={line.inventoryItemId}
                      options={inventoryOptions}
                      placeholder="Select stock item"
                      onValueChange={(value) => {
                        const inventoryItem = inventoryItems.find((item) => item.id === value);
                        setForm((current) => ({
                          ...current,
                          lines: current.lines.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  inventoryItemId: value,
                                  itemName: entry.itemName || inventoryItem?.name || "",
                                }
                              : entry,
                          ),
                        }));
                      }}
                      onAddOption={() => window.location.assign("/stores/inventory")}
                      addLabel="Add new stock item"
                    />
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold">Item name</label>
                      <Input value={line.itemName} onChange={(event) => setForm((current) => ({ ...current, lines: current.lines.map((entry, entryIndex) => entryIndex === index ? { ...entry, itemName: event.target.value } : entry) }))} />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold">Qty</label>
                      <Input value={line.quantity} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, lines: current.lines.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantity: event.target.value } : entry) }))} />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold">Unit cost</label>
                      <Input value={line.unitCost} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, lines: current.lines.map((entry, entryIndex) => entryIndex === index ? { ...entry, unitCost: event.target.value } : entry) }))} />
                    </div>
                    <div className="flex items-end">
                      <Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((_, entryIndex) => entryIndex !== index) || current.lines }))} disabled={form.lines.length === 1}>
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, { inventoryItemId: "", itemName: "", quantity: "1", unitCost: "" }] }))}>
                Add line
              </Button>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold">Notes</label>
              <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending || !form.siteId || !form.supplierName}>Save PO</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove purchase order</DialogTitle>
            <DialogDescription>{deleteTarget?.poNo}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}
