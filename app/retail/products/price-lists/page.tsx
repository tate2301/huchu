"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton } from "@corelithzw/react";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnRowAction,
} from "@/components/management/ui";
import { retailMoney } from "@/components/retail/sale-detail";
import { fetchJson } from "@/lib/api-client";
import { formatRetailDate } from "@/lib/retail/words";

/** A product on the range, as `GET /api/v2/retail/catalog` lists it (PRD-05 replaces this page). */
type PricedProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  unitPrice: number;
  taxPercent: number;
  pricedAt: string | null;
};

const WIDTH = 960;

/**
 * Prices — what every product sells for, and the one place to change it.
 *
 * A read-only `ColumnList` under the toolbar: the product's name (to its
 * record) and code, when its price last changed, the price and the VAT. The
 * page's one verb, Change price, sits at the end of each row and opens Edit a
 * product over the list.
 */
export default function RetailPricesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState("");

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
                price: <ColumnFigure>{retailMoney(product.unitPrice)}</ColumnFigure>,
                vat: <ColumnFigure tone="muted">{`${product.taxPercent}%`}</ColumnFigure>,
                act: (
                  <ColumnRowAction>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => router.push(`${pathname}?sheet=product-edit&id=${product.id}`)}
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
    </>
  );
}
