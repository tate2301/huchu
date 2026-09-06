"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, EmptyState, Input, SegmentedControl, Skeleton } from "@corelithzw/react";

import { ReportTable, amt, badge, node, num, txt } from "@corelithzw/ui/components/report-table";
import { SetupPanel } from "@/components/crm/settings/setup-chrome";
import { PageActions } from "@corelithzw/ui/layout/page-chrome";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  PRODUCT_KINDS,
  PRODUCT_KIND_LABELS,
  UNIT_LABELS,
  isStockable,
} from "@/lib/inventory/catalogue";
import { Package, Plus } from "@corelithzw/ui/lib/icons";

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
 *
 * No heading of its own. Both places that mount this draw the name directly
 * above it — "Catalogue" in the CRM setup band, the page band in Stock &
 * Inventory — and a second copy inside the panel spent the first screen of a
 * laptop saying the same thing twice before a single item appeared.
 */
export function CataloguePanel({
  /**
   * Put "New item" in the top app bar instead of above the table.
   *
   * On its own page in Stock & Inventory that is where a primary action goes,
   * the same as "New person" on the people list. In CRM setup the page band
   * owns it instead, and passes `createOpen` to drive the sheet from there.
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
                list price
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
          ? txt("n/a", { align: "right", tone: "dim" })
          : product.stock
            ? num(String(product.stock.onHand))
            : txt("not linked", { align: "right", tone: "dim" }),
        node(
          product.isActive ? (
            <Button variant="ghost" size="sm" onClick={() => archive.mutate(product.id)}>
              Archive
            </Button>
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
          aria-label="Filter by kind"
        />
        {/* One catalogue, not one per module. Worth saying here because the
            consequence — editing a price changes what Retail rings up — is not
            visible from a page that looks like it belongs to the CRM. */}
        <span className="ml-auto hidden items-center gap-2 rounded-[var(--radius-md)] border border-[var(--brand-100)] bg-[var(--brand-soft)] px-2.5 py-1.5 lg:flex">
          <Package aria-hidden="true" className="size-3.5 shrink-0 text-[var(--brand)]" />
          <span className="text-sm text-[var(--brand-strong)]">
            One catalogue, shared with <b className="font-semibold">Stock &amp; Inventory</b> and{" "}
            <b className="font-semibold">Retail</b>
          </span>
        </span>
        {actionInBar ? null : <div className="w-full sm:w-auto">{newItem}</div>}
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
        <SetupPanel
          title="Items"
          hint={
            priceList
              ? `prices from the ${priceList.name} list`
              : "price and margin drive every quote in the module"
          }
          flush
        >
          <div className="scroll-rail overflow-x-auto">
            <ReportTable
              label="Catalogue items"
              className="min-w-[52rem]"
              tracks="110px minmax(0,1fr) 110px 130px 100px 90px 110px 100px"
              columns={[
                { label: "Code" },
                { label: "Name" },
                { label: "Kind" },
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
