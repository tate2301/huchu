"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { PageActions } from "@/components/layout/page-chrome";
import { FormField, StatusDot } from "@/components/management/ui";
import { RecordCell, RecordTable, RecordTableName } from "@/components/records/record-table";
import { RowMenu } from "@/components/retail/row-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { PRICE_LIST_KINDS, PRICE_LIST_KIND_LABELS } from "@/lib/inventory/catalogue";
import type { PriceListKind } from "@prisma/client";
import { Plus, Trash2 } from "@/lib/icons";

type PriceListSummary = {
  id: string;
  name: string;
  kind: PriceListKind;
  isDefault: boolean;
  isActive: boolean;
  region: string | null;
  currency: string;
  _count: { entries: number };
};

type PriceEntry = {
  id: string;
  productId: string;
  minQuantity: number;
  unitPrice: number;
  product: { id: string; code: string; name: string; standardPrice: number };
};

type PriceListDetail = PriceListSummary & { entries: PriceEntry[] };

type CatalogueProduct = {
  id: string;
  code: string;
  name: string;
  standardPrice: number;
};

/**
 * Price lists.
 *
 * The model, the API and the resolver have existed since the catalogue
 * landed — a list holds a price per product, optionally from a minimum
 * quantity, and the highest minimum at or below what was ordered wins. Both
 * forms open in dialogs now, from the bar and from each row's menu, and the
 * paragraphs that explained them are gone.
 */
export function PriceListsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<PriceListSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [pricing, setPricing] = useState<PriceListSummary | null>(null);

  const listsQuery = useQuery({
    queryKey: ["price-lists"],
    queryFn: () => fetchJson<{ data: PriceListSummary[] }>("/api/v2/inventory/price-lists"),
  });

  const lists = useMemo(() => listsQuery.data?.data ?? [], [listsQuery.data]);

  // Retiring is what the API does with a DELETE: the list stays on file,
  // inactive, and the default list is refused.
  const retire = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/inventory/price-lists/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      toast({ title: "Price list retired", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "That price list was not retired",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const confirmRetire = (list: PriceListSummary) => {
    void dsConfirm({
      title: `Retire ${list.name}?`,
      description:
        "It stays on file as inactive, and anything that used it falls back to each product's standard price.",
      confirmLabel: "Retire price list",
      variant: "warning",
    }).then((confirmed) => {
      if (confirmed) retire.mutate(list.id);
    });
  };

  return (
    <>
      <PageActions>
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New price list
        </Button>
      </PageActions>

      {listsQuery.error ? (
        <Alert tone="danger" title="The price lists would not load">
          {getApiErrorMessage(listsQuery.error)}
        </Alert>
      ) : null}

      <RecordTable
        rows={lists}
        isLoading={listsQuery.isPending}
        emptyTitle="No price lists yet"
        columns={[
          {
            id: "list",
            label: "Price list",
            cell: (list) => (
              <button
                type="button"
                onClick={() => setPricing(list)}
                className="min-w-0 text-left hover:underline"
              >
                <RecordTableName
                  title={list.name}
                  subtitle={[
                    list.isDefault ? "Default" : null,
                    PRICE_LIST_KIND_LABELS[list.kind],
                    list.region,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              </button>
            ),
          },
          {
            id: "state",
            label: "Status",
            width: "8rem",
            cell: (list) => (list.isActive ? null : <StatusDot tone="neutral" label="Inactive" />),
          },
          {
            id: "currency",
            label: "Currency",
            width: "7rem",
            cell: (list) => <RecordCell kind="code" value={list.currency} />,
          },
          {
            id: "prices",
            label: "Prices",
            align: "end",
            width: "7rem",
            cell: (list) => <RecordCell kind="number" value={list._count.entries} />,
          },
          {
            id: "menu",
            label: "",
            menu: <span className="sr-only">More</span>,
            width: "3rem",
            align: "end",
            cell: (list) => (
              <RowMenu
                label={`More for ${list.name}`}
                items={[
                  { label: "Edit prices", onSelect: () => setPricing(list) },
                  { label: "Edit price list", onSelect: () => setEditing(list) },
                  {
                    label: "Retire price list",
                    onSelect: () => confirmRetire(list),
                    destructive: true,
                    disabled: retire.isPending || !list.isActive,
                  },
                ]}
              />
            ),
          },
        ]}
      />

      <PriceListDialog
        open={creating || editing !== null}
        list={editing}
        onOpenChange={(next) => {
          if (!next) {
            setCreating(false);
            setEditing(null);
          }
        }}
      />

      <PriceListEntriesDialog
        list={pricing}
        onOpenChange={(next) => {
          if (!next) setPricing(null);
        }}
      />
    </>
  );
}

function PriceListDialog({
  open,
  list,
  onOpenChange,
}: {
  open: boolean;
  list: PriceListSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEdit = Boolean(list);
  const [form, setForm] = useState({
    name: "",
    kind: "STANDARD" as PriceListKind,
    region: "",
    currency: "USD",
    isDefault: false,
    isActive: true,
  });
  const [errors, setErrors] = useState<string[]>([]);

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm({
        name: list?.name ?? "",
        kind: list?.kind ?? "STANDARD",
        region: list?.region ?? "",
        currency: list?.currency ?? "USD",
        isDefault: list?.isDefault ?? false,
        isActive: list?.isActive ?? true,
      });
      setErrors([]);
    }
  }

  const save = useMutation({
    mutationFn: () =>
      fetchJson(
        isEdit ? `/api/v2/inventory/price-lists/${list?.id}` : "/api/v2/inventory/price-lists",
        {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            kind: form.kind,
            // The API rejects a regional list with no region, so send null
            // rather than "" for every other kind.
            region: form.kind === "REGIONAL" ? form.region.trim() || null : null,
            currency: form.currency.trim() || "USD",
            isDefault: form.isDefault,
            isActive: form.isActive,
          }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      toast({ title: isEdit ? "Price list saved" : "Price list created", variant: "success" });
      onOpenChange(false);
    },
    onError: (error) =>
      setErrors([
        `${isEdit ? "That price list was not saved" : "That price list was not created"}: ${getApiErrorMessage(error)}`,
      ]),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={list ? list.name : "New price list"}
      size="sm"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        const problems: string[] = [];
        if (!form.name.trim()) problems.push("Give the price list a name.");
        if (form.kind === "REGIONAL" && !form.region.trim()) problems.push("Say which region it is for.");
        setErrors(problems);
        if (problems.length === 0) save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {isEdit ? "Save price list" : "Create price list"}
          </Button>
        </>
      }
    >
      <FormField label="Name">
        {(id) => (
          <Input
            id={id}
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Wholesale"
            autoFocus={!isEdit}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Type">
          {(id) => (
            <Select
              value={form.kind}
              onValueChange={(value) => setForm((prev) => ({ ...prev, kind: value as PriceListKind }))}
            >
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICE_LIST_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {PRICE_LIST_KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label="Currency">
          {(id) => (
            <Input
              id={id}
              value={form.currency}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))
              }
              maxLength={3}
              className="font-mono"
            />
          )}
        </FormField>
      </div>

      {form.kind === "REGIONAL" ? (
        <FormField label="Region">
          {(id) => (
            <Input
              id={id}
              value={form.region}
              onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))}
              placeholder="Matabeleland"
            />
          )}
        </FormField>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-[var(--text-strong)]">
        <Checkbox
          checked={form.isDefault}
          onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isDefault: checked === true }))}
        />
        The default list
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--text-strong)]">
        <Checkbox
          checked={form.isActive}
          onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked === true }))}
        />
        Active
      </label>
    </RecordDialog>
  );
}

/**
 * What each product costs on one list.
 *
 * Prices are saved as a set, not row by row, because the API replaces them
 * wholesale — a half-applied change would price things wrongly in a way
 * nobody notices until an invoice goes out.
 */
function PriceListEntriesDialog({
  list,
  onOpenChange,
}: {
  list: PriceListSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const listId = list?.id ?? null;
  const open = listId !== null;
  const [rows, setRows] = useState<Array<{ productId: string; minQuantity: string; unitPrice: string }>>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["price-list", listId],
    queryFn: () => fetchJson<PriceListDetail>(`/api/v2/inventory/price-lists/${listId}`),
    enabled: open,
  });

  const productsQuery = useQuery({
    queryKey: ["inventory-products", "picker"],
    queryFn: () =>
      fetchJson<{ data: CatalogueProduct[] }>("/api/v2/inventory/products?limit=500"),
    enabled: open,
  });
  const products = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data]);

  // Seed once per list, adjusting during render rather than in an effect.
  // Both sides are normalised to a string-or-null so the comparison cannot be
  // permanently unequal, which is what turns this pattern into a render loop.
  const loadedFor = listQuery.data && open ? listId : null;
  if (loadedFor !== seededFor) {
    setSeededFor(loadedFor);
    if (loadedFor && listQuery.data) {
      setRows(
        listQuery.data.entries.map((entry) => ({
          productId: entry.productId,
          minQuantity: String(entry.minQuantity),
          unitPrice: String(entry.unitPrice),
        })),
      );
      setErrors([]);
    }
  }

  const save = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/inventory/price-lists/${listId}`, {
        method: "PATCH",
        body: JSON.stringify({
          entries: rows
            .filter((row) => row.productId && row.unitPrice.trim())
            .map((row) => ({
              productId: row.productId,
              minQuantity: Number(row.minQuantity) || 1,
              unitPrice: Number(row.unitPrice),
            })),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      queryClient.invalidateQueries({ queryKey: ["price-list", listId] });
      toast({ title: "Prices saved", variant: "success" });
      onOpenChange(false);
    },
    onError: (error) => setErrors([`Those prices were not saved: ${getApiErrorMessage(error)}`]),
  });

  const patchRow = (index: number, next: Partial<(typeof rows)[number]>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...next } : row)));

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={list ? `Prices in ${list.name}` : "Prices"}
      size="lg"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || listQuery.isLoading}>
            Save prices
          </Button>
        </>
      }
    >
      {listQuery.isLoading ? (
        <Skeleton height={120} />
      ) : (
        <div className="space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No prices on this list yet</p>
          ) : null}

          {rows.map((row, index) => {
            const product = products.find((candidate) => candidate.id === row.productId);
            return (
              <div
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_6rem_6rem_auto] items-end gap-2"
              >
                <div className="space-y-1">
                  {index === 0 ? <span className="text-sm font-medium">Product</span> : null}
                  <Select
                    value={row.productId}
                    onValueChange={(value) => patchRow(index, { productId: value })}
                  >
                    <SelectTrigger aria-label="Product">
                      <SelectValue placeholder="Choose a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.code} · {candidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  {index === 0 ? <span className="text-sm font-medium">From quantity</span> : null}
                  <Input
                    aria-label="From quantity"
                    inputMode="decimal"
                    className="font-mono"
                    value={row.minQuantity}
                    onChange={(event) => patchRow(index, { minQuantity: event.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  {index === 0 ? <span className="text-sm font-medium">Price</span> : null}
                  <Input
                    aria-label="Price"
                    inputMode="decimal"
                    className="font-mono"
                    value={row.unitPrice}
                    onChange={(event) => patchRow(index, { unitPrice: event.target.value })}
                    placeholder={product ? String(product.standardPrice) : undefined}
                  />
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Remove this price"
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() =>
              setRows((prev) => [...prev, { productId: "", minQuantity: "1", unitPrice: "" }])
            }
          >
            <Plus className="h-4 w-4" />
            Add a price
          </Button>
        </div>
      )}
    </RecordDialog>
  );
}
