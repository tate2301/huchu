"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchInventoryItems } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Pencil, Plus, Trash2 } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

type CatalogItem = {
  id: string;
  catalogCode: string;
  inventoryItemId: string;
  siteId: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  taxPercent: number;
  status: string;
  inventoryItem: {
    id: string;
    itemCode: string;
    name: string;
    currentStock: number;
    unit: string;
  } | null;
  site: {
    id: string;
    name: string;
    code: string;
  } | null;
};

type CatalogForm = {
  inventoryItemId: string;
  name: string;
  sku: string;
  barcode: string;
  description: string;
  unitPrice: string;
  compareAtPrice: string;
  taxPercent: string;
  status: string;
};

function emptyForm(): CatalogForm {
  return {
    inventoryItemId: "",
    name: "",
    sku: "",
    barcode: "",
    description: "",
    unitPrice: "",
    compareAtPrice: "",
    taxPercent: "0",
    status: "ACTIVE",
  };
}

export default function RetailCatalogPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState<CatalogForm>(emptyForm);

  const catalogQuery = useQuery({
    queryKey: ["retail-catalog"],
    queryFn: () => fetchJson<{ data: CatalogItem[] }>("/api/v2/retail/catalog"),
  });
  const inventoryQuery = useQuery({
    queryKey: ["retail-catalog-inventory-items"],
    queryFn: () => fetchInventoryItems({ limit: 500 }),
  });

  const inventoryItems = inventoryQuery.data?.data ?? [];
  const inventoryOptions = useMemo<SearchableOption[]>(
    () =>
      inventoryItems.map((item) => ({
        value: item.id,
        label: item.name,
        description: `${item.currentStock.toFixed(2)} ${item.unit} on hand`,
        meta: item.itemCode,
      })),
    [inventoryItems],
  );
  const selectedInventory = inventoryItems.find((item) => item.id === form.inventoryItemId);
  const {
    reservedId: catalogCode,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "RETAIL_CATALOG_ITEM",
    enabled: dialogOpen && !editing && Boolean(selectedInventory?.siteId),
    siteId: selectedInventory?.siteId,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: CatalogForm) => {
      const body = {
        catalogCode: editing ? undefined : catalogCode || undefined,
        inventoryItemId: payload.inventoryItemId,
        name: payload.name.trim() || undefined,
        sku: payload.sku.trim() || undefined,
        barcode: payload.barcode.trim() || undefined,
        description: payload.description.trim() || undefined,
        unitPrice: Number(payload.unitPrice || 0),
        compareAtPrice: payload.compareAtPrice ? Number(payload.compareAtPrice) : undefined,
        taxPercent: Number(payload.taxPercent || 0),
        status: payload.status,
      };

      if (editing) {
        return fetchJson(`/api/v2/retail/catalog/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }

      return fetchJson("/api/v2/retail/catalog", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: editing ? "Catalog item updated" : "Catalog item created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-catalog"] });
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm());
    },
    onError: (error) => {
      toast({
        title: editing ? "Unable to update item" : "Unable to create item",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/retail/catalog/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Catalog item removed", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-catalog"] });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast({
        title: "Unable to remove item",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<CatalogItem>[]>(
    () => [
      {
        id: "catalogCode",
        header: "Item",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="font-mono text-xs text-[var(--text-muted)]">{row.original.catalogCode}</div>
          </div>
        ),
      },
      {
        id: "sku",
        header: "SKU",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku}</span>,
      },
      {
        id: "stock",
        header: "Stock",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.inventoryItem
              ? `${row.original.inventoryItem.currentStock.toFixed(2)} ${row.original.inventoryItem.unit}`
              : "-"}
          </NumericCell>
        ),
      },
      {
        id: "price",
        header: "Sell price",
        cell: ({ row }) => <NumericCell>{row.original.unitPrice.toFixed(2)}</NumericCell>,
      },
      {
        id: "tax",
        header: "Tax %",
        cell: ({ row }) => <NumericCell>{row.original.taxPercent.toFixed(2)}</NumericCell>,
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
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(row.original);
                setForm({
                  inventoryItemId: row.original.inventoryItemId,
                  name: row.original.name,
                  sku: row.original.sku,
                  barcode: row.original.barcode ?? "",
                  description: row.original.description ?? "",
                  unitPrice: String(row.original.unitPrice),
                  compareAtPrice: row.original.compareAtPrice ? String(row.original.compareAtPrice) : "",
                  taxPercent: String(row.original.taxPercent),
                  status: row.original.status,
                });
                setDialogOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget(row.original)}>
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
      title="Catalog"
      description="Create retail items on top of shared Stores inventory records."
      actions={
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setForm(emptyForm());
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New item
        </Button>
      }
    >
      <DataTable
        data={catalogQuery.data?.data ?? []}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search catalog"
        emptyState={catalogQuery.isLoading ? "Loading catalog..." : "No catalog items yet"}
        toolbar={<span className="text-xs text-[var(--text-muted)]">Sellable retail items</span>}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setForm(emptyForm());
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit catalog item" : "New catalog item"}</DialogTitle>
            <DialogDescription>Link a sellable retail item to shared stock.</DialogDescription>
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
                <label className="block text-sm font-semibold">Catalog code</label>
                <Input value={editing ? editing.catalogCode : catalogCode} readOnly disabled={isReserving && !editing} />
                <FieldHelp error={reserveError ?? undefined} hint={reserveError ? undefined : "Generated automatically."} />
              </div>
              <SearchableSelect
                label="Stock item"
                value={form.inventoryItemId}
                options={inventoryOptions}
                placeholder="Select stock item"
                onValueChange={(value) => {
                  const item = inventoryItems.find((entry) => entry.id === value);
                  setForm((current) => ({
                    ...current,
                    inventoryItemId: value,
                    name: current.name || item?.name || "",
                  }));
                }}
                onAddOption={() => router.push("/stores/inventory")}
                addLabel="Add new stock item"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Display name</label>
                <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">SKU</label>
                <Input value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))} placeholder="Generated from code when blank" />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Barcode</label>
                <Input value={form.barcode} onChange={(event) => setForm((current) => ({ ...current, barcode: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Status</label>
                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Sell price</label>
                <Input value={form.unitPrice} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, unitPrice: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Compare at</label>
                <Input value={form.compareAtPrice} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, compareAtPrice: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Tax percent</label>
                <Input value={form.taxPercent} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, taxPercent: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Notes</label>
              <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending || !form.inventoryItemId}>
                {editing ? "Save changes" : "Create item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove catalog item</DialogTitle>
            <DialogDescription>{deleteTarget?.name}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}
