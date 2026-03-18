"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MasterDataShell } from "@/components/management/master-data/master-data-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
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
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Pencil, Plus, Trash2 } from "@/lib/icons";

type MaterialRecord = {
  id: string;
  code: string;
  name: string;
  category: string;
  defaultPricePerKg: number;
  currency: string;
  isActive: boolean;
  notes?: string | null;
  _count: {
    prices: number;
    purchases: number;
    batches: number;
    sales: number;
  };
};

type MaterialForm = {
  code: string;
  name: string;
  category: string;
  defaultPricePerKg: string;
  currency: string;
  isActive: "true" | "false";
  notes: string;
};

const emptyForm: MaterialForm = {
  code: "",
  name: "",
  category: "MIXED",
  defaultPricePerKg: "",
  currency: "USD",
  isActive: "true",
  notes: "",
};

async function fetchMaterials(search?: string) {
  const query = new URLSearchParams();
  query.set("limit", "500");
  if (search) query.set("search", search);
  return fetchJson<{ data: MaterialRecord[] }>(`/api/scrap-metal/materials?${query.toString()}`);
}

export default function ScrapMaterialsMasterDataPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MaterialRecord | null>(null);
  const [editing, setEditing] = useState<MaterialRecord | null>(null);
  const [form, setForm] = useState<MaterialForm>(emptyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["management", "master-data", "scrap-materials", queryState.search],
    queryFn: () => fetchMaterials(queryState.search),
  });

  const materials = data?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async (payload: MaterialForm) => {
      const body = {
        code: payload.code,
        name: payload.name,
        category: payload.category,
        defaultPricePerKg: Number(payload.defaultPricePerKg),
        currency: payload.currency,
        isActive: payload.isActive === "true",
        notes: payload.notes || undefined,
      };

      if (editing) {
        return fetchJson(`/api/scrap-metal/materials/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }

      return fetchJson("/api/scrap-metal/materials", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: editing ? "Material updated" : "Material created", variant: "success" });
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "scrap-materials"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-materials"] });
    },
    onError: (mutationError) => {
      toast({
        title: "Unable to save material",
        description: getApiErrorMessage(mutationError),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => fetchJson(`/api/scrap-metal/materials/${id}`, { method: "DELETE" }),
    onSuccess: (result) => {
      toast({
        title: "Material updated",
        description:
          typeof result === "object" && result && "archived" in result
            ? "Material had activity, so it was archived instead of deleted."
            : "Material removed.",
        variant: "success",
      });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "scrap-materials"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-materials"] });
    },
    onError: (mutationError) => {
      toast({
        title: "Unable to remove material",
        description: getApiErrorMessage(mutationError),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<MaterialRecord>[]>(
    () => [
      {
        id: "material",
        header: "Material",
        accessorFn: (row) => `${row.code} ${row.name}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{row.original.code}</div>
          </div>
        ),
      },
      {
        id: "category",
        header: "Category",
        cell: ({ row }) => <Badge variant="secondary">{row.original.category}</Badge>,
        size: 120,
      },
      {
        id: "price",
        header: "Default Price/kg",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.defaultPricePerKg.toFixed(2)}
          </NumericCell>
        ),
        size: 130,
      },
      {
        id: "activity",
        header: "Activity",
        cell: ({ row }) => (
          <div className="text-xs text-muted-foreground">
            <div>Prices {row.original._count.prices}</div>
            <div>Purchases {row.original._count.purchases}</div>
            <div>Sales {row.original._count.sales}</div>
          </div>
        ),
        size: 140,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "outline"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
        size: 100,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={() => {
                setEditing(row.original);
                setForm({
                  code: row.original.code,
                  name: row.original.name,
                  category: row.original.category,
                  defaultPricePerKg: String(row.original.defaultPricePerKg),
                  currency: row.original.currency,
                  isActive: row.original.isActive ? "true" : "false",
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
        size: 96,
      },
    ],
    [],
  );

  return (
    <MasterDataShell
      activeTab="scrap-materials"
      title="Scrap Materials"
      description="Recyclable material definitions and default pricing anchors."
      actions={
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setForm(emptyForm);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New Material
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load materials</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={materials}
        columns={columns}
        queryState={queryState}
        onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search code, material, or notes"
        tableClassName="text-sm"
        emptyState={isLoading ? "Loading materials..." : "No materials configured yet"}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Material" : "New Material"}</DialogTitle>
            <DialogDescription>Keep the material catalog clean and operational.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="Code" required />
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Material name" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Select value={form.category} onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"].map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.defaultPricePerKg}
                onChange={(event) => setForm((prev) => ({ ...prev, defaultPricePerKg: event.target.value }))}
                placeholder="Default price/kg"
                required
              />
              <Input
                value={form.currency}
                onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
                placeholder="Currency"
                required
              />
            </div>
            <Select value={form.isActive} onValueChange={(value) => setForm((prev) => ({ ...prev, isActive: value as "true" | "false" }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Textarea rows={4} value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Create Material"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Remove Material</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Remove ${deleteTarget.name}? Active materials with history will be archived instead.`
                : "Remove this material?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending || !deleteTarget} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MasterDataShell>
  );
}
