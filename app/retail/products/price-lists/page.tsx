"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton } from "@corelithzw/react";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnRowAction,
} from "@/components/management/ui";
import { ChangePriceDialog, type RetailProduct } from "@/components/retail/product-dialogs";
import { retailMoney } from "@/components/retail/sale-detail";
import { fetchJson } from "@/lib/api-client";
import { formatRetailDate } from "@/lib/retail/words";

type PricedProduct = RetailProduct & { pricedAt: string | null };

const WIDTH = 960;

/**
 * Prices — what every product sells for, and the one place to change it.
 *
 * A read-only `ColumnList` under the toolbar: the product's name (to its
 * record) and code, when its price last changed, the was-price, the price and
 * the VAT. The page's one verb, Change price, sits at the end of each row and
 * opens the same dialog the product's record does.
 */
export default function RetailPricesPage() {
  const [search, setSearch] = useState("");
  const [pricing, setPricing] = useState<RetailProduct | null>(null);

  const productsQuery = useQuery({
    queryKey: ["retail-pricing-catalog"],
    queryFn: () => fetchJson<{ data: PricedProduct[] }>("/api/v2/retail/catalog"),
  });
  const products = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) =>
      [product.name, product.sku, product.barcode ?? ""].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [products, search]);

  const empty = search.trim() ? "No product matches that search." : "No products yet.";

  return (
    <>
      <RecordListShell
        title="Prices"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, code or barcode"
        searchNoun="products"
        count={productsQuery.isSuccess ? `${rows.length} of ${products.length}` : null}
        error={productsQuery.error}
      >
        {productsQuery.isPending ? (
          <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : (
          <ColumnList
            label="Prices"
            maxWidth={WIDTH}
            empty={empty}
            columns={[
              { id: "product", label: "Product" },
              { id: "changed", label: "Changed", hideBelow: "md" },
              { id: "was", label: "Was", align: "end", hideBelow: "sm" },
              { id: "price", label: "Price", align: "end" },
              { id: "vat", label: "VAT", align: "end", hideBelow: "md" },
              { id: "act", label: "" },
            ]}
            rows={rows.map((product) => ({
              id: product.id,
              cells: {
                product: (
                  <ColumnName
                    name={product.name}
                    meta={product.sku}
                    href={`/retail/products/${product.id}`}
                  />
                ),
                changed: (
                  <ColumnFigure tone="muted">{formatRetailDate(product.pricedAt) || "Never"}</ColumnFigure>
                ),
                was: product.compareAtPrice ? (
                  <ColumnFigure tone="muted">
                    <span className="line-through">{retailMoney(product.compareAtPrice)}</span>
                  </ColumnFigure>
                ) : null,
                price: <ColumnFigure>{retailMoney(product.unitPrice)}</ColumnFigure>,
                vat: <ColumnFigure tone="muted">{`${product.taxPercent}%`}</ColumnFigure>,
                act: (
                  <ColumnRowAction>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setPricing(product)}
                    >
                      Change price
                    </Button>
                  </ColumnRowAction>
                ),
              },
            }))}
          />
        )}
      </RecordListShell>

      <ChangePriceDialog product={pricing} onOpenChange={(open) => !open && setPricing(null)} />
    </>
  );
}
