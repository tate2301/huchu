"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton } from "@corelithzw/react";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { ColumnFigure, ColumnList, ColumnName, ColumnText, StatusDot } from "@/components/management/ui";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { useRetailCategories } from "@/components/retail/category-field";
import { ProductDialog, type RetailProduct } from "@/components/retail/product-dialogs";
import { retailMoney } from "@/components/retail/sale-detail";
import { fetchJson } from "@/lib/api-client";
import { formatQuantity, productStatusLabel } from "@/lib/retail/words";

const STATUS_OPTIONS = new Map([
  ["ACTIVE", "On sale"],
  ["INACTIVE", "Off sale"],
]);

/** A register's measure: wide enough for its figures, not the whole window. */
const WIDTH = 960;

/** The rate most of the range carries — what a new product starts at. */
function commonVat(products: RetailProduct[]): number {
  const counts = new Map<number, number>();
  for (const product of products) counts.set(product.taxPercent, (counts.get(product.taxPercent) ?? 0) + 1);
  let best = 15;
  let seen = 0;
  for (const [rate, count] of counts) {
    if (count > seen) {
      best = rate;
      seen = count;
    }
  }
  return best;
}

/**
 * Products — what the till sells.
 *
 * Drawn as the management surface's registers and the CRM's money pages are:
 * the name in the app bar with the one verb beside it, a toolbar of search and
 * a status filter with the count, and a `ColumnList` under it — the name and
 * one line, then the figures against the right edge. A product that is out of
 * stock says so in its own row; what you can do to a product is on its record.
 */
export default function RetailProductsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(FILTER_ANY);
  const [category, setCategory] = useState<string>(FILTER_ANY);
  const [creating, setCreating] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["retail-catalog"],
    queryFn: () => fetchJson<{ data: RetailProduct[] }>("/api/v2/retail/catalog"),
  });
  const products = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data]);
  const categories = useRetailCategories();
  const categoryOptions = useMemo(
    () => new Map((categories.data?.data ?? []).map((row) => [row.id, row.name])),
    [categories.data],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((product) => {
      if (status !== FILTER_ANY && product.status !== status) return false;
      if (category !== FILTER_ANY && product.categoryId !== category) return false;
      if (!needle) return true;
      return [product.name, product.sku, product.barcode ?? ""].some((value) =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [products, search, status, category]);

  const onHand = (product: RetailProduct) =>
    product.inventoryItem
      ? formatQuantity(product.inventoryItem.currentStock, product.inventoryItem.unit)
      : null;

  const filtering = status !== FILTER_ANY || category !== FILTER_ANY;
  const narrowed = Boolean(search.trim()) || filtering;
  const empty = search.trim()
    ? "No product matches that search."
    : filtering
      ? "No product matches this filter."
      : "No products yet.";

  return (
    <>
      <RecordListShell
        title="Products"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, code or barcode"
        filters={
          <>
            <ViewToolbarFilter
              label="Status"
              value={status}
              anyLabel="Any status"
              options={STATUS_OPTIONS}
              onChange={setStatus}
            />
            <ViewToolbarFilter
              label="Category"
              value={category}
              anyLabel="Any category"
              options={categoryOptions}
              onChange={setCategory}
            />
          </>
        }
        filterCount={(status === FILTER_ANY ? 0 : 1) + (category === FILTER_ANY ? 0 : 1)}
        count={productsQuery.isSuccess ? `${rows.length} of ${products.length}` : null}
        createLabel="New product"
        onCreate={() => setCreating(true)}
        error={productsQuery.error}
      >
        {productsQuery.isPending ? (
          <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : (
          <div className="space-y-3">
            {/* The code and barcode ride under the name; the columns are the
                ones scanned down. A product's state is a dot and a word, and
                only when it is not simply on sale (rule 5). Its verbs are on
                its record, not in a menu on every row. */}
            <ColumnList
              label="Products"
              maxWidth={WIDTH}
              empty={empty}
              columns={[
                { id: "product", label: "Product" },
                { id: "category", label: "Category", hideBelow: "md" },
                { id: "status", label: "Status", hideBelow: "sm" },
                { id: "onHand", label: "On hand", align: "end", hideBelow: "sm" },
                { id: "price", label: "Price", align: "end" },
                { id: "vat", label: "VAT", align: "end", hideBelow: "md" },
              ]}
              rows={rows.map((product) => {
                const off = productStatusLabel(product.status);
                const out = (product.inventoryItem?.currentStock ?? 0) <= 0;
                const stock = onHand(product);
                const reorder = product.inventoryItem?.reorderLevel ?? null;
                const low = !out && reorder !== null && (product.inventoryItem?.currentStock ?? 0) <= reorder;
                return {
                  id: product.id,
                  cells: {
                    product: (
                      <ColumnName
                        name={product.name}
                        meta={[product.sku, product.barcode].filter(Boolean).join(" · ")}
                        href={`/retail/products/${product.id}`}
                      />
                    ),
                    category: product.category ? <ColumnText>{product.category}</ColumnText> : null,
                    status: off ? (
                      <StatusDot tone="neutral" label={off} />
                    ) : out ? (
                      <StatusDot tone="warn" label="Out of stock" />
                    ) : low ? (
                      <StatusDot tone="warn" label="Running low" />
                    ) : null,
                    onHand: (
                      <ColumnFigure tone={stock ? (out ? "warn" : "default") : "muted"}>
                        {stock ?? "No stock line"}
                      </ColumnFigure>
                    ),
                    price: <ColumnFigure>{retailMoney(product.unitPrice)}</ColumnFigure>,
                    vat: <ColumnFigure tone="muted">{`${product.taxPercent}%`}</ColumnFigure>,
                  },
                };
              })}
            />
            {rows.length === 0 && !narrowed ? (
              <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                New product
              </Button>
            ) : null}
          </div>
        )}
      </RecordListShell>

      <ProductDialog
        open={creating}
        onOpenChange={setCreating}
        product={null}
        defaultVat={commonVat(products)}
      />
    </>
  );
}
