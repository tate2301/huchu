"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, EmptyState, Skeleton, StatCard } from "@corelithzw/react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableOption } from "@/components/ui/searchable-select";
import { RetailShell } from "@/components/retail/retail-shell";
import { CatalogImageField } from "@/components/retail/catalog-image-field";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { fetchInventoryItems, fetchSites, fetchStockLocations, type InventoryItem } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChevronDown, Grid3x3, Pencil, Plus, ReceiptLong, Trash2, Wallet } from "@/lib/icons";

type CatalogItem = {
  id: string;
  inventoryItemId: string;
  siteId: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  taxPercent: number;
  imageUrl: string | null;
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
  /** The uploaded shelf photo's URL, or an empty string for none. */
  imageUrl: string;
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
    imageUrl: "",
    status: "ACTIVE",
  };
}

export default function RetailCatalogPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addAnother, setAddAnother] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState<CatalogForm>(emptyForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /*
    Held while a shelf photo is on its way up. The preview appears the moment
    a file is picked and the upload runs behind it, so without this a
    shopkeeper who picks a photo and saves straight away stores an item with
    no photo and no warning — the form still had an empty `imageUrl`.
  */
  const [imageUploading, setImageUploading] = useState(false);

  // Quick-create stock item sub-dialog
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickForm, setQuickForm] = useState({
    name: "", category: "CONSUMABLES", unit: "pcs", siteId: "", locationId: "", unitCost: "",
  });

  const catalogQuery = useQuery({
    queryKey: ["retail-catalog"],
    queryFn: () => fetchJson<{ data: CatalogItem[] }>("/api/v2/retail/catalog"),
  });
  const inventoryQuery = useQuery({
    queryKey: ["retail-catalog-inventory-items"],
    queryFn: () => fetchInventoryItems({ limit: 500 }),
  });
  const sitesQuery = useQuery({ queryKey: ["retail-catalog-sites"], queryFn: fetchSites });
  const locationsQuery = useQuery({
    queryKey: ["retail-catalog-locations", quickForm.siteId],
    queryFn: () => fetchStockLocations({ siteId: quickForm.siteId, active: true, limit: 100 }),
    enabled: Boolean(quickForm.siteId),
  });

  const inventoryItems = useMemo(() => inventoryQuery.data?.data ?? [], [inventoryQuery.data]);
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
  const priceIsInvalid = form.unitPrice !== "" && (isNaN(Number(form.unitPrice)) || Number(form.unitPrice) <= 0);
  const saveMutation = useMutation({
    mutationFn: async (payload: CatalogForm) => {
      const body = {
        inventoryItemId: payload.inventoryItemId,
        name: payload.name.trim() || undefined,
        sku: payload.sku.trim() || undefined,
        barcode: payload.barcode.trim() || undefined,
        description: payload.description.trim() || undefined,
        unitPrice: Number(payload.unitPrice || 0),
        compareAtPrice: payload.compareAtPrice ? Number(payload.compareAtPrice) : undefined,
        taxPercent: Number(payload.taxPercent || 0),
        // Null clears the photo; the API leaves it alone when undefined.
        imageUrl: payload.imageUrl.trim() || null,
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
      if (addAnother && !editing) {
        setForm(emptyForm());
        setAdvancedOpen(false);
      } else {
        setDialogOpen(false);
        setEditing(null);
        setForm(emptyForm());
        setAdvancedOpen(false);
      }
      setAddAnother(false);
    },
    onError: (error) => {
      toast({
        title: editing ? "Unable to update item" : "Unable to create item",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const quickCreateMutation = useMutation({
    mutationFn: (payload: typeof quickForm) =>
      fetchJson<{ id: string; name: string; unit: string; unitCost: number | null; siteId: string }>("/api/inventory/items", {
        method: "POST",
        body: JSON.stringify({
          name: payload.name.trim(),
          category: payload.category,
          unit: payload.unit.trim(),
          siteId: payload.siteId,
          locationId: payload.locationId,
          unitCost: payload.unitCost ? Number(payload.unitCost) : undefined,
        }),
      }),
    onSuccess: (created) => {
      toast({ title: "Stock item created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-catalog-inventory-items"] });
      setQuickCreateOpen(false);
      setQuickForm({ name: "", category: "CONSUMABLES", unit: "pcs", siteId: "", locationId: "", unitCost: "" });
      setForm((current) => ({
        ...current,
        inventoryItemId: created.id,
        name: current.name || created.name,
        unitPrice: current.unitPrice === "" && created.unitCost != null ? String(created.unitCost) : current.unitPrice,
      }));
    },
    onError: (error) => {
      toast({ title: "Unable to create stock item", description: getApiErrorMessage(error), variant: "destructive" });
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
        id: "item",
        header: "Item",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="font-mono text-xs text-[var(--text-muted)]">{row.original.sku}</div>
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
              aria-label={`Edit ${row.original.name}`}
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
                  imageUrl: row.original.imageUrl ?? "",
                  status: row.original.status,
                });
                setDialogOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Remove ${row.original.name}`}
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const newItemButton = (
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
  );

  const actions = (
    <div className="flex flex-wrap gap-2">
      {newItemButton}
      <Button asChild size="sm" variant="outline">
        <Link href="/retail/merchandising/pricing">
          <Wallet className="h-4 w-4" />
          Pricing
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1">
            <Grid3x3 className="h-4 w-4" />
            <span className="hidden sm:inline">More</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href="/retail/merchandising/promotions" className="flex items-center gap-2">
              <ReceiptLong className="h-4 w-4" /> Promotions
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/retail/purchasing/orders" className="flex items-center gap-2">
              <ReceiptLong className="h-4 w-4" /> Purchase orders
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const catalogItems = catalogQuery.data?.data ?? [];
  const activeItems = catalogItems.filter((item) => item.status === "ACTIVE").length;
  const outOfStock = catalogItems.filter(
    (item) => (item.inventoryItem?.currentStock ?? 0) <= 0,
  ).length;

  return (
    <RetailShell title="Catalog" actions={actions}>
      {catalogQuery.isPending ? (
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Fetching the catalogue…</span>
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
          </div>
          <Skeleton height={360} />
        </div>
      ) : catalogQuery.isError ? (
        <Alert tone="danger" title="The catalogue would not load">
          {getApiErrorMessage(catalogQuery.error)}
        </Alert>
      ) : catalogItems.length === 0 ? (
        <EmptyState
          title="Nothing is on the shelf yet"
          body="A catalogue item links a stock line to a shelf price, which is what the till sells. Add the first one to start trading."
          action={newItemButton}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Sellable lines" value={String(catalogItems.length)} footer="In the catalogue" />
            <StatCard
              label="Active"
              value={String(activeItems)}
              footer="Rung up by the till today"
            />
            <StatCard
              label="Out of stock"
              value={String(outOfStock)}
              tone={outOfStock > 0 ? "warn" : "success"}
              footer="Priced but nothing on hand"
            />
          </div>
          <DataTable
            data={catalogItems}
            columns={columns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search catalog"
            emptyState="No catalogue lines match that search."
            toolbar={<span className="t-body-sm t-muted">Sellable retail items</span>}
          />
        </>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setForm(emptyForm());
            setAdvancedOpen(false);
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
                  unitPrice: current.unitPrice === "" && (item as InventoryItem | undefined)?.unitCost != null ? String((item as InventoryItem).unitCost) : current.unitPrice,
                }));
              }}
              onAddOption={() => {
                const firstSite = sitesQuery.data?.[0];
                setQuickForm((q) => ({ ...q, siteId: firstSite?.id ?? "", locationId: "" }));
                setQuickCreateOpen(true);
              }}
              addLabel="Quick-create stock item"
            />

            <div className="space-y-2">
              <label className="block text-sm font-semibold">Sell price</label>
              <Input value={form.unitPrice} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, unitPrice: event.target.value }))} />
              {priceIsInvalid ? (
                <p className="t-body-sm text-[color:var(--tone-danger-strong)]">
                  Price must be greater than 0
                </p>
              ) : null}
            </div>

            {/*
              Above the fold, not under "Advanced options".

              A shelf photo is the single most visible attribute an item has —
              it is what a cashier navigates the till grid by. Filing it behind
              a collapsed toggle would mean the range stays a wall of grey
              boxes because nobody found the control.
            */}
            <CatalogImageField
              value={form.imageUrl}
              onChange={(next) => setForm((current) => ({ ...current, imageUrl: next }))}
              productId={editing?.id}
              onUploadingChange={setImageUploading}
            />

            <button
              type="button"
              onClick={() => setAdvancedOpen((prev) => !prev)}
              className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
            >
              <ChevronDown className={`h-4 w-4 transition-transform${advancedOpen ? " rotate-180" : ""}`} />
              Advanced options
            </button>

            {advancedOpen ? (
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
                {editing ? (
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
                ) : null}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold">Compare at</label>
                  <Input value={form.compareAtPrice} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, compareAtPrice: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold">Tax percent</label>
                  <Input value={form.taxPercent} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, taxPercent: event.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-semibold">Notes</label>
                  <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
                </div>
              </div>
            ) : null}

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              {!editing ? (
                <Button
                  type="submit"
                  variant="outline"
                  disabled={saveMutation.isPending || imageUploading || !form.inventoryItemId || !form.unitPrice || Number(form.unitPrice) <= 0}
                  onClick={() => setAddAnother(true)}
                >
                  Save and add another
                </Button>
              ) : null}
              <Button
                type="submit"
                disabled={saveMutation.isPending || imageUploading || !form.inventoryItemId || !form.unitPrice || Number(form.unitPrice) <= 0}
                onClick={() => setAddAnother(false)}
              >
                {editing ? "Save changes" : "Create item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick-create stock item */}
      <Dialog open={quickCreateOpen} onOpenChange={(open) => { setQuickCreateOpen(open); if (!open) setQuickForm({ name: "", category: "CONSUMABLES", unit: "pcs", siteId: "", locationId: "", unitCost: "" }); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Quick-create stock item</DialogTitle>
            <DialogDescription>Create a new stock item and add it to the catalog in one step.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!quickForm.name.trim() || !quickForm.siteId || !quickForm.locationId) return;
              quickCreateMutation.mutate(quickForm);
            }}
          >
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Item name</label>
              <Input
                value={quickForm.name}
                onChange={(e) => setQuickForm((q) => ({ ...q, name: e.target.value }))}
                placeholder="e.g. Bottled water 500ml"
                autoFocus
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Category</label>
                <Select value={quickForm.category} onValueChange={(v) => setQuickForm((q) => ({ ...q, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONSUMABLES">Consumables</SelectItem>
                    <SelectItem value="SPARES">Spares</SelectItem>
                    <SelectItem value="PPE">PPE</SelectItem>
                    <SelectItem value="FUEL">Fuel</SelectItem>
                    <SelectItem value="REAGENTS">Reagents</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Unit</label>
                <Input
                  value={quickForm.unit}
                  onChange={(e) => setQuickForm((q) => ({ ...q, unit: e.target.value }))}
                  placeholder="pcs, kg, L …"
                  list="unit-presets"
                />
                <datalist id="unit-presets">
                  {["pcs", "kg", "L", "g", "mL", "box", "pair", "roll", "bag"].map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Site</label>
                <Select
                  value={quickForm.siteId}
                  onValueChange={(v) => setQuickForm((q) => ({ ...q, siteId: v, locationId: "" }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>
                    {(sitesQuery.data ?? []).map((site: { id: string; name: string }) => (
                      <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Location</label>
                <Select
                  value={quickForm.locationId}
                  onValueChange={(v) => setQuickForm((q) => ({ ...q, locationId: v }))}
                  disabled={!quickForm.siteId}
                >
                  <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>
                    {(locationsQuery.data?.data ?? []).map((loc: { id: string; name: string }) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="block text-sm font-semibold">Unit cost (optional)</label>
                <Input
                  value={quickForm.unitCost}
                  inputMode="decimal"
                  onChange={(e) => setQuickForm((q) => ({ ...q, unitCost: e.target.value }))}
                  placeholder="0.00 — will pre-fill sell price"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setQuickCreateOpen(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={quickCreateMutation.isPending || !quickForm.name.trim() || !quickForm.siteId || !quickForm.locationId}
              >
                {quickCreateMutation.isPending ? "Creating…" : "Create and select"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {deleteTarget?.name ?? "catalogue item"}</DialogTitle>
            <DialogDescription>
              {deleteTarget?.sku} stops appearing on the till. The stock line behind it is
              left alone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Remove {deleteTarget?.sku ?? ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}
