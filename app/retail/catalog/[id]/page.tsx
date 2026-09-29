"use client";

import Image from "next/image";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import { FactList, SectionHeading, StatusBadge } from "@/components/management/ui";
import {
  ChangePriceDialog,
  ProductDialog,
  type RetailProduct,
} from "@/components/retail/product-dialogs";
import { RetailShell } from "@/components/retail/retail-shell";
import { retailMoney } from "@/components/retail/sale-detail";
import { Button } from "@/components/ui/button";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Coins, Pencil } from "@/lib/icons";
import { enumLabel, formatQuantity, formatRetailDate } from "@/lib/retail/words";

type ProductDetail = RetailProduct & {
  productId: string;
  ageRestricted: boolean;
  taxInclusive: boolean;
  priceSource: string;
  pricedAt: string | null;
  category: string | null;
};

/** Where the till's price comes from, in words a shopkeeper can act on. */
function priceSourceLabel(source: string) {
  if (source === "PRICE_LIST") return "The shop's price list";
  if (source === "STANDARD") return "The product's own price";
  return "The product's own price";
}

const WIDTH = 560;

/**
 * One product: what it sells for, what is on hand, and the two verbs that
 * change it. Drawn as a management record — a section heading over 44px fact
 * rows — rather than four tiles and a paragraph.
 *
 * The page still answers "why is the till charging that": the price's source
 * and when it last changed are facts in the list, not an alert over it.
 */
export default function RetailProductPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id ?? "";
  const [editing, setEditing] = useState(false);
  const [pricing, setPricing] = useState(false);

  const query = useQuery({
    queryKey: ["retail-catalog-item", productId],
    enabled: Boolean(productId),
    queryFn: () => fetchJson<ProductDetail>(`/api/v2/retail/catalog/${productId}`),
  });

  const product = query.data;
  const editable = product ? ({ ...product, inventoryItemId: product.inventoryItem?.id ?? "" } as RetailProduct) : null;

  return (
    <RetailShell
      title={product?.name ?? "Product"}
      actions={
        product ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPricing(true)}>
              <Coins className="h-4 w-4" />
              Change price
            </Button>
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              Edit product
            </Button>
          </div>
        ) : null
      }
    >
      {query.isPending ? (
        <div aria-busy="true" aria-live="polite" className="space-y-3" style={{ maxWidth: WIDTH }}>
          <span className="sr-only">Loading the product</span>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : query.isError ? (
        <Alert tone="danger" title="The product would not load">
          {getApiErrorMessage(query.error)}
        </Alert>
      ) : !product ? (
        <p className="text-sm text-[var(--text-muted)]">There is no product at this address.</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,560px)_200px]">
          <div>
            <div className="flex flex-wrap gap-2">
              {product.status !== "ACTIVE" ? (
                <StatusBadge tone="neutral" context="header">
                  Off sale
                </StatusBadge>
              ) : null}
              {(product.inventoryItem?.currentStock ?? 0) <= 0 ? (
                <StatusBadge tone="warn">Out of stock</StatusBadge>
              ) : null}
              {product.ageRestricted ? <StatusBadge tone="warn">Check ID</StatusBadge> : null}
            </div>

            <SectionHeading maxWidth={WIDTH}>Price</SectionHeading>
            <FactList
              maxWidth={WIDTH}
              items={[
                { label: "Price", value: retailMoney(product.unitPrice), mono: true },
                {
                  label: "Was",
                  value: product.compareAtPrice ? retailMoney(product.compareAtPrice) : "No old price",
                  mono: Boolean(product.compareAtPrice),
                  tone: product.compareAtPrice ? "default" : "muted",
                },
                {
                  label: "VAT",
                  value: `${product.taxPercent}% ${product.taxInclusive ? "included" : "added at the till"}`,
                },
                { label: "Priced from", value: priceSourceLabel(product.priceSource) },
                {
                  label: "Changed",
                  value: formatRetailDate(product.pricedAt) || "Never",
                  mono: Boolean(product.pricedAt),
                },
              ]}
            />

            <SectionHeading maxWidth={WIDTH}>Stock</SectionHeading>
            <FactList
              maxWidth={WIDTH}
              items={[
                {
                  label: "On hand",
                  value: product.inventoryItem
                    ? formatQuantity(product.inventoryItem.currentStock, product.inventoryItem.unit)
                    : "No stock line",
                  mono: Boolean(product.inventoryItem),
                  tone: (product.inventoryItem?.currentStock ?? 0) > 0 ? "default" : "warn",
                },
                { label: "Site", value: product.site?.name ?? "No site" },
              ]}
            />

            <SectionHeading maxWidth={WIDTH}>Details</SectionHeading>
            <FactList
              maxWidth={WIDTH}
              items={[
                { label: "Code", value: product.sku, mono: true },
                {
                  label: "Barcode",
                  value: product.barcode ?? "Not on file",
                  mono: Boolean(product.barcode),
                  tone: product.barcode ? "default" : "muted",
                },
                { label: "Category", value: product.category ? enumLabel(product.category) : "None" },
                ...(product.description ? [{ label: "Description", value: product.description }] : []),
              ]}
            />
          </div>

          <div>
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                width={200}
                height={200}
                className="rounded-lg border border-[var(--border-subtle)] object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-center text-sm text-[var(--text-muted)]">
                No photo
              </div>
            )}
          </div>
        </div>
      )}

      <ProductDialog open={editing} onOpenChange={setEditing} product={editable} />
      <ChangePriceDialog product={pricing ? editable : null} onOpenChange={(open) => !open && setPricing(false)} />
    </RetailShell>
  );
}
