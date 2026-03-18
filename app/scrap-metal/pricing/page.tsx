"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Pencil, Plus, Trash2 } from "@/lib/icons";

type PriceRecord = {
  id: string;
  category: string;
  effectiveDate: string;
  pricePerKg: number;
  currency: string;
  note?: string | null;
  material?: { id: string; code: string; name: string; category: string } | null;
};

type MaterialOption = { id: string; code: string; name: string; category: string };

type PriceForm = {
  materialId: string;
  category: string;
  effectiveDate: string;
  pricePerKg: string;
  currency: string;
  note: string;
};

const emptyForm: PriceForm = {
  materialId: "__none",
  category: "MIXED",
  effectiveDate: new Date().toISOString().slice(0, 10),
  pricePerKg: "",
  currency: "USD",
  note: "",
};

export default function ScrapMetalPricingPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PriceRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PriceRecord | null>(null);
  const [form, setForm] = useState<PriceForm>(emptyForm);

  const pricesQuery = useQuery({
    queryKey: ["scrap-pricing"],
    queryFn: () => fetchJson<{ data: PriceRecord[] }>("/api/scrap-metal/pricing?limit=500"),
  });
  const materialsQuery = useQuery({
    queryKey: ["scrap-materials-for-pricing"],
    queryFn: () => fetchJson<{ data: MaterialOption[] }>("/api/scrap-metal/materials?active=true&limit=500"),
    enabled: formOpen,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: PriceForm) => {
      const body = {
        materialId: payload.materialId === "__none" ? undefined : payload.materialId,
        category: payload.category,
        effectiveDate: `${payload.effectiveDate}T00:00:00.000Z`,
        pricePerKg: Number(payload.pricePerKg),
        currency: payload.currency,
        note: payload.note || undefined,
      };

      if (editing) {
        return fetchJson(`/api/scrap-metal/pricing/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }

      return fetchJson("/api/scrap-metal/pricing", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: editing ? "Price updated" : "Price created", variant: "success" });
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["scrap-pricing"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to save price",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/scrap-metal/pricing/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Price removed", variant: "success" });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["scrap-pricing"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to remove price",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<PriceRecord>[]>(
    () => [
      {
        id: "material",
        header: "Material scope",
        accessorFn: (row) => row.material?.name ?? row.category,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.material?.name ?? "Category default"}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.material?.code ?? row.original.category}
            </div>
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
        id: "effectiveDate",
        header: "Effective",
        cell: ({ row }) => <NumericCell align="left">{row.original.effectiveDate.slice(0, 10)}</NumericCell>,
        size: 120,
      },
      {
        id: "pricePerKg",
        header: "Price/kg",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.pricePerKg.toFixed(2)}
          </NumericCell>
        ),
        size: 120,
      },
      {
        id: "note",
        header: "Note",
        accessorFn: (row) => row.note ?? "",
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
                  materialId: row.original.material?.id ?? "__none",
                  category: row.original.category,
                  effectiveDate: row.original.effectiveDate.slice(0, 10),
                  pricePerKg: String(row.original.pricePerKg),
                  currency: row.original.currency,
                  note: row.original.note ?? "",
                });
                setFormOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon-sm" variant="destructive" onClick={() => setDeleteTarget(row.original)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        size: 96,
      },
    ],
    [],
  );

  const prices = pricesQuery.data?.data ?? [];
  const materials = useMemo(() => materialsQuery.data?.data ?? [], [materialsQuery.data?.data]);
  const materialOptions = useMemo<SearchableOption[]>(
    () => [
      {
        value: "__none",
        label: "Category default",
        description: "Apply the board rate to the whole category.",
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

  return (
    <ScrapShell
      title="Price Board"
      description="Manage category defaults, material-specific price overrides, and effective-date history."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setForm(emptyForm);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New Price
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/management/master-data/operations/scrap-materials">Materials</Link>
          </Button>
        </div>
      }
    >
      {pricesQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load prices</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pricesQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={prices}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search material, category, or note"
        tableClassName="text-sm"
        emptyState={pricesQuery.isLoading ? "Loading prices..." : "No prices configured yet"}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Price" : "New Price"}</DialogTitle>
            <DialogDescription>Use material scope when one recyclable needs a specific rate.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <SearchableSelect
              label="Material Scope"
              value={form.materialId}
              options={materialOptions}
              placeholder={materialsQuery.isLoading ? "Loading materials..." : "Select material scope"}
              searchPlaceholder="Search materials..."
              onValueChange={(value) => {
                const selected = materials.find((material) => material.id === value);
                setForm((prev) => ({
                  ...prev,
                  materialId: value,
                  category: selected?.category ?? prev.category,
                }));
              }}
              onAddOption={() => router.push("/management/master-data/operations/scrap-materials")}
              addLabel="Add new material"
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                value={form.category}
                onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"].map(
                    (category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={form.effectiveDate}
                onChange={(event) => setForm((prev) => ({ ...prev, effectiveDate: event.target.value }))}
                required
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.pricePerKg}
                onChange={(event) => setForm((prev) => ({ ...prev, pricePerKg: event.target.value }))}
                placeholder="Price per kg"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                value={form.currency}
                onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
                placeholder="Currency"
                required
              />
              <Input
                value={form.note}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="Note"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Create Price"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Remove Price</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `Remove the ${deleteTarget.category} price effective ${deleteTarget.effectiveDate.slice(0, 10)}?` : "Remove this price?"}
            </DialogDescription>
          </DialogHeader>
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
