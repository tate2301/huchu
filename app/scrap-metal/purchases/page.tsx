"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { fetchEmployees, fetchSites } from "@/lib/api";
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
import { Pencil, Plus, Trash2 } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

type Purchase = {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  category: string;
  weight: number;
  pricePerKg: number;
  totalAmount: number;
  currency: string;
  status: string;
  sellerName?: string;
  sellerPhone?: string;
  notes?: string | null;
  sellerProfile?: {
    id: string;
    fullName: string;
    phone: string;
    nationalId: string;
  } | null;
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
};

type MaterialOption = {
  id: string;
  code: string;
  name: string;
  category: string;
};

type PriceRecord = {
  id: string;
  materialId?: string | null;
  category: string;
  effectiveDate: string;
  pricePerKg: number;
  currency: string;
};

type SellerProfileOption = {
  id: string;
  fullName: string;
  phone: string;
  nationalId: string;
  isActive: boolean;
};

type PurchaseForm = {
  purchaseDate: string;
  siteId: string;
  employeeId: string;
  sellerProfileId: string;
  materialId: string;
  category: string;
  weight: string;
  pricePerKg: string;
  currency: string;
  overrideReason: string;
  notes: string;
};

const CATEGORY_OPTIONS = ["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"];

function getEmptyForm(): PurchaseForm {
  return {
    purchaseDate: new Date().toISOString().slice(0, 16),
    siteId: "",
    employeeId: "",
    sellerProfileId: "__none",
    materialId: "__none",
    category: "MIXED",
    weight: "",
    pricePerKg: "",
    currency: "USD",
    overrideReason: "",
    notes: "",
  };
}

async function fetchPurchases(): Promise<Purchase[]> {
  const response = await fetchJson<{ data: Purchase[] }>("/api/scrap-metal/purchases?limit=200");
  return response.data;
}

function findSuggestedPrice(form: PurchaseForm, prices: PriceRecord[]) {
  const purchaseDate = new Date(form.purchaseDate);
  if (Number.isNaN(purchaseDate.getTime())) return null;

  const eligible = prices
    .filter((row) => row.category === form.category && new Date(row.effectiveDate) <= purchaseDate)
    .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());

  const materialSpecific =
    form.materialId !== "__none"
      ? eligible.find((row) => row.materialId === form.materialId)
      : null;

  return materialSpecific ?? eligible.find((row) => !row.materialId) ?? null;
}

function applySuggestedPrice(nextForm: PurchaseForm, prices: PriceRecord[], priceTouched: boolean) {
  if (priceTouched) return nextForm;
  const suggestion = findSuggestedPrice(nextForm, prices);
  if (!suggestion) return nextForm;
  return {
    ...nextForm,
    pricePerKg: nextForm.pricePerKg || String(suggestion.pricePerKg),
    currency: nextForm.currency || suggestion.currency,
  };
}

export default function ScrapMetalPurchasesPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [form, setForm] = useState<PurchaseForm>(getEmptyForm);
  const [priceTouched, setPriceTouched] = useState(false);
  const {
    reservedId: purchaseNumber,
    isReserving: reservingPurchaseNumber,
    error: reservePurchaseNumberError,
  } = useReservedId({
    entity: "SCRAP_METAL_PURCHASE",
    enabled: formOpen && !editing && Boolean(form.siteId),
    siteId: form.siteId || undefined,
  });

  const purchasesQuery = useQuery({
    queryKey: ["scrap-metal-purchases"],
    queryFn: fetchPurchases,
  });
  const sitesQuery = useQuery({
    queryKey: ["sites", "scrap-purchases"],
    queryFn: fetchSites,
  });
  const employeesQuery = useQuery({
    queryKey: ["employees", "scrap-purchases"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });
  const materialsQuery = useQuery({
    queryKey: ["scrap-materials", "purchase-form"],
    queryFn: () => fetchJson<{ data: MaterialOption[] }>("/api/scrap-metal/materials?active=true&limit=500"),
  });
  const sellerProfilesQuery = useQuery({
    queryKey: ["scrap-seller-profiles", "purchase-form"],
    queryFn: () => fetchJson<{ data: SellerProfileOption[] }>("/api/scrap-metal/sellers?active=true&limit=500"),
  });
  const pricesQuery = useQuery({
    queryKey: ["scrap-prices", "purchase-form"],
    queryFn: () => fetchJson<{ data: PriceRecord[] }>("/api/scrap-metal/pricing?limit=500"),
  });

  const materials = useMemo(() => materialsQuery.data?.data ?? [], [materialsQuery.data?.data]);
  const sellerProfiles = useMemo(() => sellerProfilesQuery.data?.data ?? [], [sellerProfilesQuery.data?.data]);
  const sites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const employees = useMemo(() => employeesQuery.data?.data ?? [], [employeesQuery.data?.data]);
  const purchases = purchasesQuery.data ?? [];
  const siteOptions = useMemo<SearchableOption[]>(
    () =>
      sites.map((site) => ({
        value: site.id,
        label: site.name,
        meta: site.code,
      })),
    [sites],
  );
  const employeeOptions = useMemo<SearchableOption[]>(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
        meta: employee.employeeId,
      })),
    [employees],
  );
  const sellerOptions = useMemo<SearchableOption[]>(
    () =>
      sellerProfiles.map((sellerProfile) => ({
        value: sellerProfile.id,
        label: sellerProfile.fullName,
        description: sellerProfile.phone,
        meta: sellerProfile.nationalId,
      })),
    [sellerProfiles],
  );
  const materialOptions = useMemo<SearchableOption[]>(
    () => [
      {
        value: "__none",
        label: "Category only",
        description: "Use the selected category without a material profile.",
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
  const selectedSellerProfile =
    sellerProfiles.find((sellerProfile) => sellerProfile.id === form.sellerProfileId) ?? null;
  const suggestedPrice = useMemo(
    () => findSuggestedPrice(form, pricesQuery.data?.data ?? []),
    [form, pricesQuery.data?.data],
  );

  const saveMutation = useMutation({
    mutationFn: async (payload: PurchaseForm) => {
      const hasOverride =
        suggestedPrice && Number(payload.pricePerKg || 0) !== Number(suggestedPrice.pricePerKg);
      if (hasOverride && !payload.overrideReason.trim()) {
        throw new Error("Provide an override reason when the transaction price differs from the board rate.");
      }

      const noteParts = [payload.notes.trim()];
      if (hasOverride) {
        noteParts.push(`Price override: ${payload.overrideReason.trim()}`);
      }

      const body = {
        purchaseNumber: purchaseNumber || undefined,
        purchaseDate: new Date(payload.purchaseDate).toISOString(),
        siteId: payload.siteId,
        employeeId: payload.employeeId,
        sellerProfileId: payload.sellerProfileId,
        materialId: payload.materialId === "__none" ? undefined : payload.materialId,
        category: payload.category,
        weight: Number(payload.weight),
        pricePerKg: Number(payload.pricePerKg),
        currency: payload.currency,
        notes: noteParts.filter(Boolean).join("\n") || undefined,
      };

      if (editing) {
        return fetchJson(`/api/scrap-metal/purchases/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }

      return fetchJson("/api/scrap-metal/purchases", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: editing ? "Purchase updated" : "Purchase recorded", variant: "success" });
      setFormOpen(false);
      setEditing(null);
      setPriceTouched(false);
      setForm(getEmptyForm());
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-dashboard-v2"] });
    },
    onError: (error) => {
      toast({
        title: editing ? "Unable to update purchase" : "Unable to record purchase",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/scrap-metal/purchases/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Purchase removed", variant: "success" });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-dashboard-v2"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to remove purchase",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<Purchase>[]>(
    () => [
      {
        id: "purchaseNumber",
        header: "Purchase #",
        cell: ({ row }) => <span className="font-mono font-semibold">{row.original.purchaseNumber}</span>,
        size: 120,
      },
      {
        id: "purchaseDate",
        header: "Date",
        cell: ({ row }) => <NumericCell align="left">{row.original.purchaseDate.slice(0, 10)}</NumericCell>,
        size: 100,
      },
      {
        id: "material",
        header: "Material",
        accessorFn: (row) => `${row.material?.name ?? row.category} ${row.employee.name}`,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.material?.name ?? row.original.category}</div>
            <div className="text-xs text-muted-foreground">{row.original.material?.code ?? row.original.category}</div>
          </div>
        ),
      },
      {
        id: "employee",
        header: "Operator",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.employee.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{row.original.employee.employeeId}</div>
          </div>
        ),
        size: 180,
      },
      {
        id: "sellerName",
        header: "Seller",
        accessorKey: "sellerName",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.sellerName || "-"}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.sellerProfile?.nationalId ?? row.original.sellerPhone ?? "No profile"}
            </div>
          </div>
        ),
        size: 150,
      },
      {
        id: "weight",
        header: "Weight (kg)",
        cell: ({ row }) => <NumericCell>{row.original.weight.toFixed(2)}</NumericCell>,
        size: 100,
      },
      {
        id: "pricePerKg",
        header: "Price/kg",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.pricePerKg.toFixed(2)}
          </NumericCell>
        ),
        size: 100,
      },
      {
        id: "totalAmount",
        header: "Total",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.totalAmount.toFixed(2)}
          </NumericCell>
        ),
        size: 110,
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
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={() => {
                setEditing(row.original);
                setPriceTouched(true);
                setForm({
                  purchaseDate: row.original.purchaseDate.slice(0, 16),
                  siteId: row.original.site.id,
                  employeeId: row.original.employee.id,
                  sellerProfileId: row.original.sellerProfile?.id ?? "__none",
                  materialId: row.original.material?.id ?? "__none",
                  category: row.original.material?.category ?? row.original.category,
                  weight: String(row.original.weight),
                  pricePerKg: String(row.original.pricePerKg),
                  currency: row.original.currency,
                  overrideReason: "",
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
    <ScrapShell
      title="Purchases"
      description="Record intake, lock the transaction price, and assign each buy to an operator."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setPriceTouched(false);
              setForm(getEmptyForm());
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New Purchase
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/management/master-data/operations/scrap-materials">Materials</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/management/master-data/operations/scrap-sellers">Seller Profiles</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/stores/inventory">Stock on Hand</Link>
          </Button>
        </div>
      }
    >
      {purchasesQuery.error ? (
        <StatusState
          variant="error"
          title="Unable to load purchases"
          description={getApiErrorMessage(purchasesQuery.error)}
          action={
            <Button onClick={() => purchasesQuery.refetch()} variant="outline" size="sm">
              Try Again
            </Button>
          }
        />
      ) : (
        <DataTable
          data={purchases}
          columns={columns}
          searchPlaceholder="Search purchase, operator, seller, or material"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={purchasesQuery.isLoading ? "Loading purchases..." : "No purchases recorded yet"}
        />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Purchase" : "New Purchase"}</DialogTitle>
            <DialogDescription>Capture intake first, then let the yard decide how to batch it.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Purchase Number</label>
                <Input
                  value={editing?.purchaseNumber ?? purchaseNumber}
                  readOnly
                  aria-readonly="true"
                  placeholder={editing ? "Purchase number" : reservingPurchaseNumber ? "Reserving..." : "Auto-generated"}
                />
                <FieldHelp
                  hint={
                    editing
                      ? "Purchase number stays locked after creation."
                      : reservePurchaseNumberError ?? "Purchase number is generated automatically after site selection."
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Purchase Date</label>
                <Input
                  type="datetime-local"
                  value={form.purchaseDate}
                  onChange={(event) =>
                    setForm((current) =>
                      applySuggestedPrice(
                        { ...current, purchaseDate: event.target.value },
                        pricesQuery.data?.data ?? [],
                        priceTouched,
                      ),
                    )
                  }
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
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
                label="Operator *"
                value={form.employeeId || undefined}
                options={employeeOptions}
                placeholder={employeesQuery.isLoading ? "Loading operators..." : "Select operator"}
                searchPlaceholder="Search operators..."
                onValueChange={(value) => setForm((current) => ({ ...current, employeeId: value }))}
                onAddOption={() => router.push("/human-resources")}
                addLabel="Add new operator"
              />
              <SearchableSelect
                label="Seller Profile *"
                value={form.sellerProfileId === "__none" ? undefined : form.sellerProfileId}
                options={sellerOptions}
                placeholder={sellerProfilesQuery.isLoading ? "Loading seller profiles..." : "Select seller profile"}
                searchPlaceholder="Search sellers..."
                onValueChange={(value) => setForm((current) => ({ ...current, sellerProfileId: value }))}
                onAddOption={() => router.push("/management/master-data/operations/scrap-sellers")}
                addLabel="Add new seller"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SearchableSelect
                label="Material"
                value={form.materialId}
                options={materialOptions}
                placeholder={materialsQuery.isLoading ? "Loading materials..." : "Select material"}
                searchPlaceholder="Search materials..."
                onValueChange={(value) => {
                  const material = materials.find((entry) => entry.id === value);
                  setPriceTouched(false);
                  setForm((current) =>
                    applySuggestedPrice(
                      {
                        ...current,
                        materialId: value,
                        category: material?.category ?? current.category,
                        pricePerKg: "",
                      },
                      pricesQuery.data?.data ?? [],
                      false,
                    ),
                  );
                }}
                onAddOption={() => router.push("/management/master-data/operations/scrap-materials")}
                addLabel="Add new material"
              />
              <Select
                value={form.category}
                onValueChange={(value) => {
                  setPriceTouched(false);
                  setForm((current) =>
                    applySuggestedPrice(
                      { ...current, category: value, pricePerKg: "" },
                      pricesQuery.data?.data ?? [],
                      false,
                    ),
                  );
                }}
              >
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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input value={selectedSellerProfile?.phone ?? ""} readOnly placeholder="Seller phone" />
              <Input value={selectedSellerProfile?.nationalId ?? ""} readOnly placeholder="Seller national ID" />
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.weight}
                onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))}
                placeholder="Weight (kg)"
                required
              />
              <div className="space-y-1">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.pricePerKg}
                  onChange={(event) => {
                    setPriceTouched(true);
                    setForm((current) => ({ ...current, pricePerKg: event.target.value }));
                  }}
                  placeholder="Price per kg"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {suggestedPrice
                    ? `Board rate ${suggestedPrice.currency} ${suggestedPrice.pricePerKg.toFixed(2)}`
                    : "No board rate found for this selection"}
                </p>
              </div>
              <Input
                value={form.currency}
                onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                placeholder="Currency"
                required
              />
              <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Locked total</div>
                <div className="font-mono font-semibold">
                  {form.currency || "USD"}{" "}
                  {((Number(form.weight) || 0) * (Number(form.pricePerKg) || 0)).toFixed(2)}
                </div>
              </div>
            </div>

            {suggestedPrice && Number(form.pricePerKg || 0) !== Number(suggestedPrice.pricePerKg) ? (
              <Input
                value={form.overrideReason}
                onChange={(event) => setForm((current) => ({ ...current, overrideReason: event.target.value }))}
                placeholder="Override reason"
                required
              />
            ) : null}

            <Textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Notes"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  saveMutation.isPending ||
                  (!editing && (!purchaseNumber || reservingPurchaseNumber)) ||
                  !form.siteId ||
                  !form.employeeId ||
                  form.sellerProfileId === "__none" ||
                  !form.weight ||
                  !form.pricePerKg
                }
              >
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Record Purchase"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Remove Purchase</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `Remove ${deleteTarget.purchaseNumber}?` : "Remove this purchase?"}
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
