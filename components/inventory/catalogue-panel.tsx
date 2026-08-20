"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@corelithzw/react";

import { PageActions } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  PRODUCT_KINDS,
  PRODUCT_KIND_LABELS,
  UNIT_LABELS,
  isStockable,
} from "@/lib/inventory/catalogue";
import { Plus } from "@/lib/icons";

import { ProductSheet, type ProductRecord } from "./product-sheet";

type CatalogueResponse = {
  data: ProductRecord[];
  priceList: { id: string; name: string } | null;
};

const KIND_FILTERS = [
  { value: "ALL", label: "All" },
  ...PRODUCT_KINDS.map((kind) => ({ value: kind, label: PRODUCT_KIND_LABELS[kind] })),
];

/**
 * The shared catalogue.
 *
 * Lives in Stock & Inventory and is reached from every module that sells — the
 * CRM quotes from it, Retail lists from it, a workshop bills from it. Showing
 * stock beside price is the point: it is the same screen whether you are
 * pricing a service that is never held anywhere or a pump sitting in a yard.
 */
export function CataloguePanel({
  /**
   * Put "New item" in the top app bar instead of above the table.
   *
   * On its own page in Stock & Inventory that is where a primary action goes,
   * the same as "New person" on the people list. The panel is also embedded in
   * CRM settings, where the bar belongs to that page — so this is opt-in, and
   * the button stays in the body by default.
   */
  actionInBar = false,
}: {
  actionInBar?: boolean;
} = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("ALL");
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["inventory-products", search, kind],
    queryFn: () =>
      fetchJson<CatalogueResponse>(
        `/api/v2/inventory/products?includeInactive=1&withStock=1${
          search ? `&q=${encodeURIComponent(search)}` : ""
        }${kind !== "ALL" ? `&kind=${kind}` : ""}`,
      ),
  });

  const products = data?.data ?? [];
  const priceList = data?.priceList ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["inventory-products"] });

  const archive = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/inventory/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Archived", description: "Past quotes and receipts still show it." });
      refresh();
    },
    onError: (err) => toast({ title: getApiErrorMessage(err), variant: "destructive" }),
  });

  const newItem = (
    <Button
      variant="primary"
      size="sm"
      startIcon={<Plus className="size-4" />}
      onClick={() => setCreating(true)}
    >
      New item
    </Button>
  );

  return (
    <div className="space-y-4">
      {actionInBar ? <PageActions>{newItem}</PageActions> : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">What the business sells</h2>
          <p className="text-sm text-[var(--text-muted)]">
            One catalogue for every module. Services carry no stock and never
            will; goods show what is on hand across every site.
            {priceList ? ` Prices shown from the ${priceList.name} list.` : null}
          </p>
        </div>
        {actionInBar ? null : newItem}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or code"
          className="w-full sm:w-72"
        />
        <SegmentedControl
          options={KIND_FILTERS}
          value={kind}
          onValueChange={setKind}
          aria-label="Filter by kind"
        />
      </div>

      {error ? (
        <Alert tone="danger" title="Couldn't load the catalogue">
          {getApiErrorMessage(error)}
        </Alert>
      ) : null}

      {isLoading ? (
        <Skeleton height={220} />
      ) : products.length === 0 ? (
        <EmptyState
          title="Nothing in the catalogue yet"
          body="Add what you sell once and every module can quote, ring up or bill it."
          action={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              Add the first item
            </Button>
          }
        />
      ) : (
        <Card flush>
          <div className="scroll-rail overflow-x-auto">
            <Table density="compact">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Code</TableHeaderCell>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Kind</TableHeaderCell>
                  <TableHeaderCell className="text-right">Price</TableHeaderCell>
                  <TableHeaderCell className="text-right">Margin</TableHeaderCell>
                  <TableHeaderCell className="text-right">On hand</TableHeaderCell>
                  <TableHeaderCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {products.map((product) => {
                  const margin =
                    product.costPrice === null || product.costPrice === undefined
                      ? null
                      : product.line.unitPrice - product.costPrice;

                  return (
                    <TableRow key={product.id} className={product.isActive ? "" : "opacity-60"}>
                      <TableCell className="font-mono">{product.code}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => setEditing(product)}
                        >
                          {product.name}
                        </button>
                        {product.line.priceSource !== "STANDARD" ? (
                          <Badge tone="brand" size="sm" className="ml-2">
                            list price
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge tone="neutral" size="sm">
                          {PRODUCT_KIND_LABELS[product.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {product.line.unitPrice.toFixed(2)}
                        <span className="ml-1 text-[var(--text-muted)]">
                          /{UNIT_LABELS[product.unit]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {margin === null ? "—" : margin.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {/* A service has no stock record at all — that is not
                            the same as none left, and must not read as zero. */}
                        {!isStockable(product.kind) ? (
                          <span className="text-[var(--text-muted)]">n/a</span>
                        ) : product.stock ? (
                          product.stock.onHand
                        ) : (
                          <span className="text-[var(--text-muted)]">not linked</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => archive.mutate(product.id)}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Badge tone="neutral" size="sm">
                            Archived
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <ProductSheet
        open={creating || Boolean(editing)}
        product={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={refresh}
      />
    </div>
  );
}
