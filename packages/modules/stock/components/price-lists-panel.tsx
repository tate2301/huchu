"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  Skeleton,
} from "@corelithzw/react";

import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@corelithzw/ui/components/sheet";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { FormShell } from "@corelithzw/ui/shared/form-shell";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { PRICE_LIST_KINDS, PRICE_LIST_KIND_LABELS } from "../catalogue";
import type { PriceListKind } from "@corelithzw/db";
import { Plus, Trash2 } from "@corelithzw/ui/lib/icons";

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
 * landed — a list holds a price per item, optionally from a minimum quantity,
 * and the highest minimum at or below what was ordered wins. None of it had a
 * screen, so the whole feature was reachable only by writing to the API by
 * hand: you could not see which list was the default, let alone change what
 * anything costs on it.
 */
export function PriceListsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<PriceListSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [openListId, setOpenListId] = useState<string | null>(null);

  const listsQuery = useQuery({
    queryKey: ["price-lists"],
    queryFn: () => fetchJson<{ data: PriceListSummary[] }>("/api/v2/inventory/price-lists"),
  });

  const lists = useMemo(() => listsQuery.data?.data ?? [], [listsQuery.data]);

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/inventory/price-lists/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      toast({ title: "Price list deleted" });
    },
    onError: (error) =>
      toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-muted)]">
          What things cost, per list. Everything that sells reads the default list
          unless it was told to use another one.
        </p>
        <Button
          variant="primary"
          size="sm"
          startIcon={<Plus className="h-4 w-4" />}
          onClick={() => setCreating(true)}
        >
          New price list
        </Button>
      </div>

      {listsQuery.error ? (
        <Alert tone="danger" title="Unable to load price lists">
          {getApiErrorMessage(listsQuery.error)}
        </Alert>
      ) : null}

      {listsQuery.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      ) : lists.length === 0 ? (
        <EmptyState
          title="No price lists yet"
          body="Make one called Standard and mark it the default. Everything that sells will use it."
          action={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              Create the first list
            </Button>
          }
        />
      ) : (
        <ul className="space-y-1">
          {lists.map((list) => (
            <li key={list.id} className="flex items-center gap-3 px-3 py-3">
              <button
                type="button"
                onClick={() => setOpenListId(list.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-[var(--text-strong)]">
                    {list.name}
                  </span>
                  {list.isDefault ? (
                    <Badge tone="brand" size="sm">
                      Default
                    </Badge>
                  ) : null}
                  {!list.isActive ? (
                    <Badge tone="neutral" size="sm">
                      Inactive
                    </Badge>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-sm text-[var(--text-muted)]">
                  {[
                    PRICE_LIST_KIND_LABELS[list.kind],
                    list.region,
                    list.currency,
                    `${list._count.entries} priced item${list._count.entries === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>

              <Button size="sm" variant="secondary" onClick={() => setEditing(list)}>
                Rename
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${list.name}`}
                disabled={remove.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete "${list.name}"? Anything using it falls back to the item's standard price.`,
                    )
                  ) {
                    remove.mutate(list.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <PriceListSheet
        open={creating || editing !== null}
        list={editing}
        onOpenChange={(next) => {
          if (!next) {
            setCreating(false);
            setEditing(null);
          }
        }}
      />

      <PriceListEntriesSheet
        listId={openListId}
        onOpenChange={(next) => {
          if (!next) setOpenListId(null);
        }}
      />
    </div>
  );
}

function PriceListSheet({
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
      toast({ title: isEdit ? "Price list saved" : "Price list created" });
      onOpenChange(false);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="w-full overflow-y-auto p-6">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit price list" : "New price list"}</SheetTitle>
          <SheetDescription>
            A named set of prices. Wholesale, Trade, a region of its own — the
            default is what everything uses when nobody says otherwise.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <FormShell
            variant="bare"
            errors={errors}
            onSubmit={(event) => {
              event.preventDefault();
              if (!form.name.trim()) {
                setErrors(["Give the list a name."]);
                return;
              }
              save.mutate();
            }}
            actions={
              <>
                <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create list"}
                </Button>
              </>
            }
          >
            <div className="space-y-1.5">
              <Label htmlFor="price-list-name">Name *</Label>
              <Input
                id="price-list-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Wholesale"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select
                value={form.kind}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, kind: value as PriceListKind }))
                }
              >
                <SelectTrigger>
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
            </div>

            {form.kind === "REGIONAL" ? (
              <div className="space-y-1.5">
                <Label htmlFor="price-list-region">Region *</Label>
                <Input
                  id="price-list-region"
                  value={form.region}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, region: event.target.value }))
                  }
                  placeholder="Matabeleland"
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="price-list-currency">Currency</Label>
              <Input
                id="price-list-currency"
                value={form.currency}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))
                }
                maxLength={3}
                className="font-mono w-24"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isDefault}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, isDefault: checked === true }))
                }
              />
              Use this list when nobody asks for one
            </label>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, isActive: checked === true }))
                }
              />
              Active
            </label>
          </FormShell>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * What each item costs on one list.
 *
 * Prices are saved as a set, not row by row, because the API replaces them
 * wholesale — a half-applied change would price things wrongly in a way
 * nobody notices until an invoice goes out.
 */
function PriceListEntriesSheet({
  listId,
  onOpenChange,
}: {
  listId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
      toast({ title: "Prices saved" });
      onOpenChange(false);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const patchRow = (index: number, next: Partial<(typeof rows)[number]>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...next } : row)));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" className="w-full overflow-y-auto p-6">
        <SheetHeader>
          <SheetTitle>{listQuery.data?.name ?? "Prices"}</SheetTitle>
          <SheetDescription>
            One row per price. Give an item two rows with different minimum
            quantities and you have a volume break — the highest minimum at or
            below what was ordered is the one that applies.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <FormShell
            variant="bare"
            errors={errors}
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
            actions={
              <>
                <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save prices"}
                </Button>
              </>
            }
          >
            {listQuery.isLoading ? (
              <Skeleton height={120} />
            ) : (
              <div className="space-y-2">
                {rows.map((row, index) => {
                  const product = products.find((candidate) => candidate.id === row.productId);
                  return (
                    <div
                      key={index}
                      className="grid grid-cols-[minmax(0,1fr)_5rem_6rem_auto] items-end gap-2"
                    >
                      <div className="space-y-1">
                        {index === 0 ? <Label>Item</Label> : null}
                        <Select
                          value={row.productId}
                          onValueChange={(value) => patchRow(index, { productId: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pick an item" />
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
                        {index === 0 ? <Label>From qty</Label> : null}
                        <Input
                          inputMode="decimal"
                          className="font-mono"
                          value={row.minQuantity}
                          onChange={(event) =>
                            patchRow(index, { minQuantity: event.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        {index === 0 ? <Label>Price</Label> : null}
                        <Input
                          inputMode="decimal"
                          className="font-mono"
                          value={row.unitPrice}
                          onChange={(event) =>
                            patchRow(index, { unitPrice: event.target.value })
                          }
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
                  variant="secondary"
                  startIcon={<Plus className="h-4 w-4" />}
                  onClick={() =>
                    setRows((prev) => [...prev, { productId: "", minQuantity: "1", unitPrice: "" }])
                  }
                >
                  Add a price
                </Button>

                {rows.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    Nothing is priced on this list yet, so everything falls back to
                    its standard price.
                  </p>
                ) : null}
              </div>
            )}
          </FormShell>
        </div>
      </SheetContent>
    </Sheet>
  );
}
