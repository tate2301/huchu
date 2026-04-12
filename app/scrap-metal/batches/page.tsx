"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { FieldHelp } from "@/components/shared/field-help";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
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
import { StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { SplitButton } from "@/components/ui/split-button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Pencil, Plus, Trash2 } from "@/lib/icons";
import { hasRole } from "@/lib/roles";
import { useReservedId } from "@/hooks/use-reserved-id";

type Batch = {
  id: string;
  batchNumber: string;
  category: string;
  status: string;
  totalWeight: number;
  collectionStartDate: string;
  collectionEndDate?: string | null;
  notes?: string | null;
  material?: { id: string; code: string; name: string; category: string } | null;
  _count: {
    items: number;
  };
  site: {
    id: string;
    name: string;
    code: string;
  };
};

type MaterialOption = {
  id: string;
  code: string;
  name: string;
  category: string;
};

type PurchaseOption = {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  category: string;
  weight: number;
  sellerName?: string;
  material?: { id: string; code: string; name: string; category: string } | null;
  employee: {
    id: string;
    name: string;
    employeeId: string;
  };
  site: {
    id: string;
    name: string;
    code: string;
  };
  batchItems?: Array<{ batchId: string }>;
};

type BatchForm = {
  siteId: string;
  materialId: string;
  category: string;
  status: string;
  collectionStartDate: string;
  collectionEndDate: string;
  notes: string;
};

const CATEGORY_OPTIONS = ["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"];
const STATUS_OPTIONS = ["COLLECTING", "READY", "SOLD"];

function getEmptyForm(): BatchForm {
  return {
    siteId: "",
    materialId: "__none",
    category: "MIXED",
    status: "COLLECTING",
    collectionStartDate: new Date().toISOString().slice(0, 16),
    collectionEndDate: "",
    notes: "",
  };
}

async function fetchBatches(): Promise<Batch[]> {
  const response = await fetchJson<{ data: Batch[] }>("/api/scrap-metal/batches?limit=200");
  return response.data;
}

export default function ScrapMetalBatchesPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Batch | null>(null);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [batchForItems, setBatchForItems] = useState<Batch | null>(null);
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<string[]>([]);
  const [form, setForm] = useState<BatchForm>(getEmptyForm);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canAccessExtendedLotViews = hasRole(role, ["SUPERADMIN", "MANAGER"]);
  const {
    reservedId: batchNumber,
    isReserving: reservingBatchNumber,
    error: reserveBatchNumberError,
  } = useReservedId({
    entity: "SCRAP_METAL_BATCH",
    enabled: formOpen && !editing && Boolean(form.siteId),
    siteId: form.siteId || undefined,
  });

  const batchesQuery = useQuery({
    queryKey: ["scrap-metal-batches"],
    queryFn: fetchBatches,
  });
  const sitesQuery = useQuery({
    queryKey: ["sites", "scrap-batches"],
    queryFn: fetchSites,
  });
  const materialsQuery = useQuery({
    queryKey: ["scrap-materials", "batch-form"],
    queryFn: () => fetchJson<{ data: MaterialOption[] }>("/api/scrap-metal/materials?active=true&limit=500"),
  });
  const purchasesQuery = useQuery({
    queryKey: ["scrap-unbatched-purchases", batchForItems?.id],
    queryFn: () => fetchJson<{ data: PurchaseOption[] }>("/api/scrap-metal/purchases?limit=500&unbatched=true"),
    enabled: Boolean(batchForItems),
  });

  const sites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const materials = useMemo(() => materialsQuery.data?.data ?? [], [materialsQuery.data?.data]);
  const siteOptions = useMemo<SearchableOption[]>(
    () =>
      sites.map((site) => ({
        value: site.id,
        label: site.name,
        meta: site.code,
      })),
    [sites],
  );
  const materialOptions = useMemo<SearchableOption[]>(
    () => [
      {
        value: "__none",
        label: "Category only",
        description: "Create a lot without tying it to a material record.",
      },
      ...materials.map((material) => ({
        value: material.id,
        label: material.name,
        description: material.category,
        meta: material.code,
      })),
    ],
    [materials],
  );
  const filteredBatches = useMemo(() => {
    const records = batchesQuery.data ?? [];
    if (statusFilter === "all") return records;
    return records.filter((batch) => batch.status === statusFilter);
  }, [batchesQuery.data, statusFilter]);

  const availablePurchases = useMemo(() => {
    if (!batchForItems) return [];
    return (purchasesQuery.data?.data ?? []).filter((purchase) => {
      if (purchase.site.id !== batchForItems.site.id) return false;
      if ((purchase.material?.id ?? "__none") === (batchForItems.material?.id ?? "__none")) return true;
      return purchase.category === batchForItems.category;
    });
  }, [batchForItems, purchasesQuery.data?.data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: BatchForm) => {
      const body = {
        batchNumber: batchNumber || undefined,
        siteId: payload.siteId,
        materialId: payload.materialId === "__none" ? undefined : payload.materialId,
        category: payload.category,
        status: payload.status,
        collectionStartDate: new Date(payload.collectionStartDate).toISOString(),
        collectionEndDate: payload.collectionEndDate ? new Date(payload.collectionEndDate).toISOString() : null,
        notes: payload.notes || undefined,
      };

      if (editing) {
        return fetchJson(`/api/scrap-metal/batches/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }

      return fetchJson("/api/scrap-metal/batches", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: editing ? "Lot updated" : "Lot created", variant: "success" });
      setFormOpen(false);
      setEditing(null);
      setForm(getEmptyForm());
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-batches"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-dashboard-v2"] });
    },
    onError: (error) => {
      toast({
        title: editing ? "Unable to update lot" : "Unable to create lot",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/scrap-metal/batches/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Lot removed", variant: "success" });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-batches"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to remove lot",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const addItemsMutation = useMutation({
    mutationFn: async (input: { batchId: string; purchaseIds: string[] }) =>
      fetchJson(`/api/scrap-metal/batches/${input.batchId}/items`, {
        method: "POST",
        body: JSON.stringify({ purchaseIds: input.purchaseIds }),
      }),
    onSuccess: () => {
      toast({ title: "Inbound tickets added to lot", variant: "success" });
      setBatchForItems(null);
      setSelectedPurchaseIds([]);
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-batches"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-unbatched-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-dashboard-v2"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to add inbound tickets",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<Batch>[]>(
    () => [
      {
        id: "batchNumber",
        header: "Lot #",
        cell: ({ row }) => <span className="font-mono font-semibold">{row.original.batchNumber}</span>,
        size: 120,
      },
      {
        id: "material",
        header: "Material",
        accessorFn: (row) => `${row.material?.name ?? row.category} ${row.site.code}`,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.material?.name ?? row.original.category}</div>
            <div className="text-xs text-muted-foreground">{row.original.material?.code ?? row.original.category}</div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusChip
            status={
              row.original.status === "SOLD"
                ? "passing"
                : row.original.status === "READY"
                  ? "in_review"
                  : "pending"
            }
            label={row.original.status}
          />
        ),
        size: 120,
      },
      {
        id: "totalWeight",
        header: "Total Weight (kg)",
        cell: ({ row }) => <NumericCell>{row.original.totalWeight.toFixed(2)}</NumericCell>,
        size: 140,
      },
      {
        id: "itemCount",
        header: "Items",
        cell: ({ row }) => <NumericCell>{row.original._count.items}</NumericCell>,
        size: 80,
      },
      {
        id: "window",
        header: "Window",
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="font-mono">{row.original.collectionStartDate.slice(0, 10)}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.collectionEndDate?.slice(0, 10) ?? "Open"}
            </div>
          </div>
        ),
      },
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => <Badge variant="outline">{row.original.site.code}</Badge>,
        size: 80,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {row.original.status === "COLLECTING" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setBatchForItems(row.original);
                  setSelectedPurchaseIds([]);
                }}
              >
                Add Inbound Tickets
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={() => {
                setEditing(row.original);
                setForm({
                  siteId: row.original.site.id,
                  materialId: row.original.material?.id ?? "__none",
                  category: row.original.material?.category ?? row.original.category,
                  status: row.original.status,
                  collectionStartDate: row.original.collectionStartDate.slice(0, 16),
                  collectionEndDate: row.original.collectionEndDate?.slice(0, 16) ?? "",
                  notes: row.original.notes ?? "",
                });
                setFormOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="destructive"
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        size: 180,
      },
    ],
    [],
  );

  return (
    <ScrapShell
      title="Lots"
      actions={
        <SplitButton
          size="sm"
          onClick={() => {
            setEditing(null);
            setForm(getEmptyForm());
            setFormOpen(true);
          }}
          menuContent={
            <>
              <DropdownMenuItem asChild>
                <Link href="/stores/inventory">Stock on hand</Link>
              </DropdownMenuItem>
              {canAccessExtendedLotViews ? (
                <DropdownMenuItem asChild>
                  <Link href="/scrap-metal/purchases/unassigned">Unassigned Purchases</Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/scrap-metal/sales">Outbound Tickets</Link>
              </DropdownMenuItem>
            </>
          }
        >
          <Plus className="h-4 w-4" />
          New Lot
        </SplitButton>
      }
    >
      {batchesQuery.error ? (
        <StatusState
          variant="error"
          title="Unable to load lots"
         
          action={
            <Button onClick={() => batchesQuery.refetch()} variant="outline" size="sm">
              Try Again
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="COLLECTING">Collecting</SelectItem>
                <SelectItem value="READY">Ready</SelectItem>
                <SelectItem value="SOLD">Sold</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {filteredBatches.length} of {(batchesQuery.data ?? []).length} lots
            </span>
          </div>

          <div className="hidden md:block">
            <DataTable
              data={filteredBatches}
              columns={columns}
              searchPlaceholder="Search lot, material, or status"
              searchSubmitLabel="Search"
              tableClassName="text-sm"
              pagination={{ enabled: true }}
              emptyState={batchesQuery.isLoading ? "Loading lots..." : "No lots yet"}
            />
          </div>

          <div className="space-y-3 md:hidden">
            {filteredBatches.map((batch) => (
              <article
                key={batch.id}
                className="rounded-2xl border border-[var(--edge-subtle)] bg-background p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{batch.material?.name ?? batch.category}</div>
                    <div className="font-mono text-xs text-muted-foreground">{batch.batchNumber}</div>
                  </div>
                  <StatusChip
                    status={
                      batch.status === "SOLD"
                        ? "passing"
                        : batch.status === "READY"
                          ? "in_review"
                          : "pending"
                    }
                    label={batch.status}
                  />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Site</div>
                    <div className="mt-1 font-semibold">{batch.site.name}</div>
                    <div className="text-xs text-muted-foreground">{batch.site.code}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Weight</div>
                    <div className="mt-1 font-semibold">{batch.totalWeight.toFixed(2)} kg</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Window</div>
                    <div className="mt-1 font-semibold">{batch.collectionStartDate.slice(0, 10)}</div>
                    <div className="text-xs text-muted-foreground">
                      {batch.collectionEndDate?.slice(0, 10) ?? "Open"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Inbound tickets</div>
                    <div className="mt-1 font-semibold">{batch._count.items}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {batch.status === "COLLECTING" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setBatchForItems(batch);
                        setSelectedPurchaseIds([]);
                      }}
                    >
                      Add Inbound Tickets
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(batch);
                      setForm({
                        siteId: batch.site.id,
                        materialId: batch.material?.id ?? "__none",
                        category: batch.material?.category ?? batch.category,
                        status: batch.status,
                        collectionStartDate: batch.collectionStartDate.slice(0, 16),
                        collectionEndDate: batch.collectionEndDate?.slice(0, 16) ?? "",
                        notes: batch.notes ?? "",
                      });
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => setDeleteTarget(batch)}>
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="full" tabletBehavior="fullscreen" className="max-h-[100dvh] sm:max-h-[92vh]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Lot" : "New Lot"}</DialogTitle>
          </DialogHeader>
          <form
            className="max-h-[calc(100dvh-10rem)] space-y-4 overflow-y-auto pb-20 sm:max-h-[calc(92vh-8rem)]"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Lot Number</label>
                <Input
                  value={editing?.batchNumber ?? batchNumber}
                  readOnly
                  aria-readonly="true"
                  placeholder={editing ? "Lot number" : reservingBatchNumber ? "Reserving..." : "Auto-generated"}
                />
                <FieldHelp
                  hint={
                    editing
                      ? "Lot number stays locked after creation."
                      : reserveBatchNumberError ?? "Lot number is generated automatically after site selection."
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Collection Start</label>
                <Input
                  type="datetime-local"
                  value={form.collectionStartDate}
                  onChange={(event) => setForm((current) => ({ ...current, collectionStartDate: event.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SearchableSelect
                label="Site *"
                value={form.siteId || undefined}
                options={siteOptions}
                placeholder={sitesQuery.isLoading ? "Loading sites..." : "Select site"}
                searchPlaceholder="Search sites..."
                onValueChange={(value) => setForm((current) => ({ ...current, siteId: value }))}
                onAddOption={() => router.push("/management/master-data/operations/sites")}
                addLabel="Add new site"
              />
              <SearchableSelect
                label="Material"
                value={form.materialId}
                options={materialOptions}
                placeholder={materialsQuery.isLoading ? "Loading materials..." : "Select material"}
                searchPlaceholder="Search materials..."
                onValueChange={(value) => {
                  const material = materials.find((entry) => entry.id === value);
                  setForm((current) => ({
                    ...current,
                    materialId: value,
                    category: material?.category ?? current.category,
                  }));
                }}
                onAddOption={() => router.push("/management/master-data/operations/scrap-materials")}
                addLabel="Add new material"
              />
              <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Input
              type="datetime-local"
              value={form.collectionEndDate}
              onChange={(event) => setForm((current) => ({ ...current, collectionEndDate: event.target.value }))}
              placeholder="Close date"
            />

            <Textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Lot notes"
            />

            <DialogFooter className="sticky bottom-0 z-10 -mx-1 border-t bg-background/95 px-1 pt-3 supports-[backdrop-filter]:bg-background/85">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  saveMutation.isPending ||
                  (!editing && (!batchNumber || reservingBatchNumber)) ||
                  !form.siteId
                }
              >
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Create Lot"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(batchForItems)} onOpenChange={(open) => !open && setBatchForItems(null)}>
        <DialogContent size="full" tabletBehavior="fullscreen" className="max-h-[100dvh] sm:max-h-[92vh]">
          <DialogHeader>
            <DialogTitle>Add Inbound Tickets to Lot</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {batchForItems ? `Assign intake into ${batchForItems.batchNumber}.` : "Assign inbound tickets to lot."}
          </div>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {availablePurchases.length} matching unassigned inbound tickets
            </div>
            <div className="max-h-[calc(100dvh-20rem)] space-y-2 overflow-y-auto rounded-xl bg-[var(--surface-muted)] p-3 sm:max-h-[420px]">
              {availablePurchases.map((purchase) => {
                const checked = selectedPurchaseIds.includes(purchase.id);
                return (
                  <label
                    key={purchase.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg bg-background px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setSelectedPurchaseIds((current) =>
                          event.target.checked
                            ? [...current, purchase.id]
                            : current.filter((id) => id !== purchase.id),
                        )
                      }
                      className="mt-1 h-4 w-4 rounded border-[var(--table-divider)] accent-[var(--action-primary-bg)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {purchase.purchaseNumber} - {purchase.material?.name ?? purchase.category}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {purchase.employee.name} - {purchase.sellerName || "Walk-in seller"}
                          </p>
                        </div>
                        <NumericCell>{purchase.weight.toFixed(2)} kg</NumericCell>
                      </div>
                    </div>
                  </label>
                );
              })}
              {purchasesQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading inbound tickets...</div> : null}
              {!purchasesQuery.isLoading && availablePurchases.length === 0 ? (
                <div className="text-sm text-muted-foreground">No matching unassigned inbound tickets found.</div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBatchForItems(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addItemsMutation.isPending || !batchForItems || selectedPurchaseIds.length === 0}
              onClick={() =>
                batchForItems &&
                addItemsMutation.mutate({ batchId: batchForItems.id, purchaseIds: selectedPurchaseIds })
              }
            >
              {addItemsMutation.isPending ? "Adding..." : `Add ${selectedPurchaseIds.length || ""} Inbound Tickets`.trim()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Remove Lot</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {deleteTarget ? `Remove ${deleteTarget.batchNumber}?` : "Remove this lot?"}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrapShell>
  );
}
