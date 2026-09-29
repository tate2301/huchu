"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, EmptyState, Input, SegmentedControl, Skeleton } from "@corelithzw/react";

import { ReportTable, amt, badge, node, num, txt } from "@/components/accounting/report-table";
import { SetupPanel } from "@/components/crm/settings/setup-chrome";
import { PageActions } from "@/components/layout/page-chrome";
import { RowMenu } from "@/components/retail/row-menu";
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
 * same thing twice before a single product appeared. The banner that said the
 * catalogue is shared went the same way: a row's verbs live behind its menu,
 * and the form opens in a dialog.
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
      if (confirmed) archive.mutate(product.id);
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

  const rows = products.map((product) => {
    const margin =
      product.costPrice === null || product.costPrice === undefined
        ? null
        : product.line.unitPrice - product.costPrice;

    return {
      id: product.id,
      cells: [
        txt(product.code, { mono: true, tone: "subtle" }),
        node(
          <span className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(product)}
              className="min-w-0 truncate text-left text-sm font-semibold text-[var(--text-strong)] hover:underline"
            >
              {product.name}
            </button>
            {product.line.priceSource !== "STANDARD" ? (
              <span className="acct-badge shrink-0" data-tone="info">
                List price
              </span>
            ) : null}
          </span>,
        ),
        badge(PRODUCT_KIND_LABELS[product.kind], "mute"),
        txt(UNIT_LABELS[product.unit], { tone: "subtle" }),
        amt(product.line.unitPrice.toFixed(2)),
        // A margin nobody has costed is not a margin of zero.
        margin === null
          ? txt("—", { align: "right", tone: "dim" })
          : num(margin.toFixed(2), { tone: margin < 0 ? "bad" : "strong", bold: true }),
        // A service has no stock record at all — that is not the same as none
        // left, and must not read as zero.
        !isStockable(product.kind)
          ? txt("Not stocked", { align: "right", tone: "dim" })
          : product.stock
            ? num(String(product.stock.onHand))
            : txt("Not linked", { align: "right", tone: "dim" }),
        node(
          product.isActive ? (
            <RowMenu
              label={`More for ${product.name}`}
              items={[
                { label: "Edit catalogue product", onSelect: () => setEditing(product) },
                {
                  label: "Archive catalogue product",
                  onSelect: () => confirmArchive(product),
                  destructive: true,
                  disabled: archive.isPending,
                },
              ]}
            />
          ) : (
            <span className="acct-badge" data-tone="mute">
              Archived
            </span>
          ),
          { align: "right" },
        ),
      ],
    };
  });

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
        <Skeleton height={220} />
      ) : products.length === 0 ? (
        <EmptyState
          title={
            search
              ? "No catalogue products match that search"
              : kind !== "ALL"
                ? "No catalogue products match this filter"
                : "No catalogue products yet"
          }
        />
      ) : (
        <SetupPanel
          title={priceList ? `Priced from ${priceList.name}` : "Products"}
          count={products.length}
          flush
        >
          <div className="scroll-rail overflow-x-auto">
            <ReportTable
              label="Catalogue products"
              className="min-w-[52rem]"
              tracks="110px minmax(0,1fr) 110px 130px 100px 90px 110px 100px"
              columns={[
                { label: "Code" },
                { label: "Product" },
                { label: "Type" },
                { label: "Unit" },
                { label: "Price", align: "right" },
                { label: "Margin", align: "right" },
                { label: "On hand", align: "right" },
                { label: "", align: "right" },
              ]}
              rows={rows}
            />
          </div>
        </SetupPanel>
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
      />
    </div>
  );
}
