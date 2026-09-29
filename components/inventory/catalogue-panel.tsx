"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, Input, SegmentedControl, Skeleton } from "@corelithzw/react";

import { PageActions } from "@/components/layout/page-chrome";
import { ColumnFigure, ColumnList, ColumnName, ColumnText, StatusDot } from "@/components/management/ui";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  PRODUCT_KINDS,
  PRODUCT_KIND_LABELS,
  UNIT_LABELS,
  isStockable,
} from "@/lib/inventory/catalogue";
import { Plus } from "@/lib/icons";

import { CatalogueProductDialog, type ProductRecord } from "./product-sheet";

type CatalogueResponse = {
  data: ProductRecord[];
  priceList: { id: string; name: string } | null;
};

/** A register's measure: wide enough for its figures, not the whole window. */
const WIDTH = 960;

const KIND_FILTERS = [
  { value: "ALL", label: "Any type" },
  ...PRODUCT_KINDS.map((kind) => ({ value: kind, label: PRODUCT_KIND_LABELS[kind] })),
];

/**
 * The shared catalogue.
 *
 * Lives in Stock & Inventory and is reached from every module that sells — the
 * CRM quotes from it, Retail lists from it, a workshop bills from it. Showing
 * stock beside price is the point: it is the same screen whether you are
 * pricing a service that is never held anywhere or a pump sitting in a yard.
 *
 * No heading of its own. Both places that mount this draw the name directly
 * above it — "Catalogue" in the CRM setup band, the app bar in Stock — and a
 * second copy inside the panel spent the first screen of a laptop saying the
 * same thing twice before a single product appeared.
 *
 * Drawn as a `ColumnList`: the code and name, then price, margin and stock
 * against the right edge. A catalogue product has no record page, so its name
 * opens its form; archiving it is in that form's footer.
 */
export function CataloguePanel({
  /**
   * Put "New catalogue product" in the top app bar instead of above the table.
   *
   * On its own page in Stock that is where a primary action goes, the same as
   * "New person" on the people list. In CRM setup the page band owns it
   * instead, and passes `createOpen` to drive the dialog from there.
   */
  actionInBar = false,
  createOpen,
  onCreateOpenChange,
}: {
  actionInBar?: boolean;
  /** Controlled by the CRM setup band. Left out, the panel owns the state. */
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
} = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("ALL");
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [ownCreating, setOwnCreating] = useState(false);

  // Controlled where a band drives it, uncontrolled where the panel is alone.
  const creating = createOpen ?? ownCreating;
  const setCreating = onCreateOpenChange ?? setOwnCreating;

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
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory-products"] });
    queryClient.invalidateQueries({ queryKey: ["crm-setup-counts"] });
  };

  const archive = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/inventory/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Catalogue product archived", variant: "success" });
      refresh();
    },
    onError: (err) =>
      toast({
        title: "That catalogue product was not archived",
        description: getApiErrorMessage(err),
        variant: "destructive",
      }),
  });

  const confirmArchive = (product: ProductRecord) => {
    void dsConfirm({
      title: `Archive ${product.name}?`,
      description:
        "It stops being offered on new quotes, sales and job cards. Past ones still name it.",
      confirmLabel: "Archive catalogue product",
      variant: "warning",
    }).then((confirmed) => {
      if (!confirmed) return;
      setEditing(null);
      archive.mutate(product.id);
    });
  };

  const newItem = (
    <Button
      variant="primary"
      size="sm"
      startIcon={<Plus className="size-4" />}
      onClick={() => setCreating(true)}
    >
      New catalogue product
    </Button>
  );

  const filtered = Boolean(search) || kind !== "ALL";
  const empty = search
    ? "No catalogue product matches that search."
    : kind !== "ALL"
      ? "No catalogue product matches this filter."
      : "No catalogue products yet.";

  return (
    <div className="min-w-0">
      {actionInBar ? <PageActions>{newItem}</PageActions> : null}

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or code"
          className="w-full sm:w-64"
        />
        <SegmentedControl
          options={KIND_FILTERS}
          value={kind}
          onValueChange={setKind}
          size="sm"
          aria-label="Type"
        />
        {actionInBar ? null : <div className="w-full sm:ml-auto sm:w-auto">{newItem}</div>}
      </div>

      {error ? (
        <Alert tone="danger" title="The catalogue would not load">
          {getApiErrorMessage(error)}
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : (
        <div className="space-y-3">
          <ColumnList
            label="Catalogue products"
            maxWidth={WIDTH}
            empty={empty}
            columns={[
              { id: "product", label: "Product" },
              { id: "status", label: "Status", hideBelow: "sm" },
              { id: "unit", label: "Unit", hideBelow: "md" },
              // Which list the prices come from, when it is not the standard.
              { id: "price", label: priceList ? `${priceList.name} price` : "Price", align: "end" },
              { id: "margin", label: "Margin", align: "end", hideBelow: "sm" },
              { id: "onHand", label: "On hand", align: "end", hideBelow: "sm" },
            ]}
            rows={products.map((product) => {
              const margin =
                product.costPrice === null || product.costPrice === undefined
                  ? null
                  : product.line.unitPrice - product.costPrice;
              return {
                id: product.id,
                cells: {
                  // No record page: the name opens the product's form.
                  product: (
                    <button
                      type="button"
                      onClick={() => setEditing(product)}
                      className="min-w-0 max-w-full text-left hover:underline"
                    >
                      <ColumnName
                        code={product.code}
                        name={product.name}
                        meta={[
                          PRODUCT_KIND_LABELS[product.kind],
                          product.line.priceSource !== "STANDARD" ? "List price" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    </button>
                  ),
                  status: product.isActive ? null : <StatusDot tone="neutral" label="Archived" />,
                  unit: <ColumnText>{UNIT_LABELS[product.unit]}</ColumnText>,
                  price: <ColumnFigure>{product.line.unitPrice.toFixed(2)}</ColumnFigure>,
                  // A margin nobody has costed is not a margin of zero.
                  margin:
                    margin === null ? (
                      <ColumnFigure tone="muted">—</ColumnFigure>
                    ) : (
                      <ColumnFigure tone={margin < 0 ? "danger" : "default"}>
                        {margin.toFixed(2)}
                      </ColumnFigure>
                    ),
                  // A service has no stock record at all — that is not the same
                  // as none left, and must not read as zero.
                  onHand: !isStockable(product.kind) ? (
                    <ColumnFigure tone="muted">Not stocked</ColumnFigure>
                  ) : product.stock ? (
                    <ColumnFigure>{product.stock.onHand}</ColumnFigure>
                  ) : (
                    <ColumnFigure tone="muted">Not linked</ColumnFigure>
                  ),
                },
              };
            })}
          />
          {products.length === 0 && !filtered ? newItem : null}
        </div>
      )}

      <CatalogueProductDialog
        open={creating || Boolean(editing)}
        product={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={refresh}
        footerStart={
          editing?.isActive ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={archive.isPending}
              onClick={() => confirmArchive(editing)}
            >
              Archive catalogue product
            </Button>
          ) : null
        }
      />
    </div>
  );
}
