"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { StatusDot } from "@/components/management/ui";
import { RecordList } from "@/components/records/record-list";
import { RecordCell, RecordTable, RecordTableName } from "@/components/records/record-table";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import {
  ChangePriceDialog,
  ProductDialog,
  useInvalidateProducts,
  type RetailProduct,
} from "@/components/retail/product-dialogs";
import { RowMenu } from "@/components/retail/row-menu";
import { retailMoney } from "@/components/retail/sale-detail";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formatQuantity, productStatusLabel } from "@/lib/retail/words";

const STATUS_OPTIONS = new Map([
  ["ACTIVE", "On sale"],
  ["INACTIVE", "Off sale"],
]);

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
 * Drawn as the CRM's lists are: the name in the app bar with the one verb
 * beside it, a toolbar of search and a status filter with the count, and the
 * records flush under it. The three tiles that sat on top (sellable lines,
 * active, out of stock) governed nothing on the page and are gone (D3); a
 * product that is out of stock says so in its own row.
 */
export default function RetailProductsPage() {
  const { toast } = useToast();
  const invalidate = useInvalidateProducts();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(FILTER_ANY);
  const [editing, setEditing] = useState<RetailProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [pricing, setPricing] = useState<RetailProduct | null>(null);

  const productsQuery = useQuery({
    queryKey: ["retail-catalog"],
    queryFn: () => fetchJson<{ data: RetailProduct[] }>("/api/v2/retail/catalog"),
  });
  const products = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((product) => {
      if (status !== FILTER_ANY && product.status !== status) return false;
      if (!needle) return true;
      return [product.name, product.sku, product.barcode ?? ""].some((value) =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [products, search, status]);

  const remove = useMutation({
    mutationFn: (product: RetailProduct) =>
      fetchJson(`/api/v2/retail/catalog/${product.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Product removed", variant: "success" });
      invalidate();
    },
    onError: (error) =>
      toast({
        title: "That product was not removed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const confirmRemove = (product: RetailProduct) => {
    void dsConfirm({
      title: `Remove ${product.name}?`,
      description:
        "It stops appearing on the till. Its stock stays on hand, and past sales keep its name.",
      confirmLabel: "Remove the product",
      variant: "warning",
    }).then((confirmed) => {
      if (confirmed) remove.mutate(product);
    });
  };

  const onHand = (product: RetailProduct) =>
    product.inventoryItem
      ? formatQuantity(product.inventoryItem.currentStock, product.inventoryItem.unit)
      : null;

  const emptyTitle = search.trim()
    ? "No products match that search"
    : status !== FILTER_ANY
      ? "No products match this filter"
      : "No products yet";

  return (
    <>
      <RecordListShell
        title="Products"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, code or barcode"
        filters={
          <ViewToolbarFilter
            label="Status"
            value={status}
            anyLabel="Any status"
            options={STATUS_OPTIONS}
            onChange={setStatus}
          />
        }
        filterCount={status === FILTER_ANY ? 0 : 1}
        count={productsQuery.isSuccess ? `${rows.length} of ${products.length}` : null}
        createLabel="New product"
        onCreate={() => setCreating(true)}
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
              cell: (product) => (
                <RecordTableName
                  title={product.name}
                  subtitle={[product.sku, product.barcode].filter(Boolean).join(" · ")}
                />
              ),
            },
            {
              id: "state",
              label: "Status",
              width: "8rem",
              cell: (product) => {
                const off = productStatusLabel(product.status);
                if (off) return <StatusDot tone="neutral" label={off} />;
                if ((product.inventoryItem?.currentStock ?? 0) <= 0)
                  return <StatusDot tone="warn" label="Out of stock" />;
                return null;
              },
            },
            {
              id: "onHand",
              label: "On hand",
              align: "end",
              width: "9rem",
              cell: (product) => <RecordCell kind="number" value={onHand(product) ?? "No stock line"} />,
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
                  items={[
                    { label: "Edit product", onSelect: () => setEditing(product) },
                    { label: "Change price", onSelect: () => setPricing(product) },
                    { label: "Remove product", onSelect: () => confirmRemove(product), destructive: true },
                  ]}
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
                status: productStatusLabel(product.status) ? (
                  <StatusDot tone="neutral" label="Off sale" />
                ) : null,
                facts: [
                  { label: "Price", value: retailMoney(product.unitPrice), kind: "money", primary: true },
                  { label: "On hand", value: onHand(product) ?? "No stock line", kind: "number" },
                ],
              }))}
              isLoading={productsQuery.isPending}
              emptyTitle={emptyTitle}
            />
          }
        />
      </RecordListShell>

      <ProductDialog
        open={creating || Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        product={editing}
        defaultVat={commonVat(products)}
      />
      <ChangePriceDialog product={pricing} onOpenChange={(open) => !open && setPricing(null)} />
    </>
  );
}
