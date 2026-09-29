"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { RecordList } from "@/components/records/record-list";
import { RecordCell, RecordTable, RecordTableName } from "@/components/records/record-table";
import { ChangePriceDialog, type RetailProduct } from "@/components/retail/product-dialogs";
import { RowMenu } from "@/components/retail/row-menu";
import { retailMoney } from "@/components/retail/sale-detail";
import { fetchJson } from "@/lib/api-client";
import { formatRetailDate } from "@/lib/retail/words";

type PricedProduct = RetailProduct & { pricedAt: string | null };

/**
 * Prices — what every product sells for, and the one place to change it.
 *
 * This page was a table of inputs: three text boxes and a Save on every row,
 * with nothing to say which rows had been typed in and not saved. A price is
 * changed in a dialog now, from the row's menu, and the list only reads.
 * The tiles over it (priced lines, average shelf price, showing a was-price)
 * are gone with the rest of retail's working-page tiles (D3).
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

  const emptyTitle = search.trim() ? "No products match that search" : "No products yet";

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
        <RecordTable
          rows={rows}
          isLoading={productsQuery.isPending}
          emptyTitle={emptyTitle}
          rowHref={(product) => `/retail/catalog/${product.id}`}
          columns={[
            {
              id: "product",
              label: "Product",
              cell: (product) => <RecordTableName title={product.name} subtitle={product.sku} />,
            },
            {
              id: "changed",
              label: "Changed",
              width: "9rem",
              cell: (product) => (
                <RecordCell kind="date" value={formatRetailDate(product.pricedAt) || "Never"} />
              ),
            },
            {
              id: "was",
              label: "Was",
              align: "end",
              width: "7rem",
              cell: (product) => (
                <RecordCell
                  kind="money"
                  className="font-normal text-[var(--text-muted)] line-through"
                  value={product.compareAtPrice ? retailMoney(product.compareAtPrice) : null}
                />
              ),
            },
            {
              id: "price",
              label: "Price",
              align: "end",
              width: "8rem",
              cell: (product) => <RecordCell kind="money" value={retailMoney(product.unitPrice)} />,
            },
            {
              id: "vat",
              label: "VAT",
              align: "end",
              width: "5rem",
              cell: (product) => <RecordCell kind="number" value={`${product.taxPercent}%`} />,
            },
            {
              id: "menu",
              label: "",
              width: "3rem",
              align: "end",
              cell: (product) => (
                <RowMenu
                  label={`More for ${product.name}`}
                  items={[{ label: "Change price", onSelect: () => setPricing(product) }]}
                />
              ),
            },
          ]}
          mobile={
            <RecordList
              rows={rows.map((product) => ({
                id: product.id,
                href: `/retail/catalog/${product.id}`,
                title: product.name,
                subtitle: product.sku,
                facts: [
                  { label: "Price", value: retailMoney(product.unitPrice), kind: "money", primary: true },
                  { label: "VAT", value: `${product.taxPercent}%`, kind: "number" },
                ],
                actions: (
                  <RowMenu
                    label={`More for ${product.name}`}
                    items={[{ label: "Change price", onSelect: () => setPricing(product) }]}
                  />
                ),
              }))}
              isLoading={productsQuery.isPending}
              emptyTitle={emptyTitle}
            />
          }
        />
      </RecordListShell>

      <ChangePriceDialog product={pricing} onOpenChange={(open) => !open && setPricing(null)} />
    </>
  );
}
