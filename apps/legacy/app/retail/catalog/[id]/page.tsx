"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton, StatCard } from "@corelithzw/react";

import { RetailShell } from "@/components/retail/retail-shell";
import { retailMoney } from "@/components/retail/sale-detail";
import { Button } from "@corelithzw/ui/components/button";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { Coins, TableRows } from "@corelithzw/ui/lib/icons";

/**
 * One line on the range, and where its price comes from.
 *
 * R-4.3. The catalogue list opens an item in an edit dialog, which shows the
 * fields you can change. It does not show the thing a shopkeeper asks about a
 * price, which is **why it is that number** — the shelf list it resolved off,
 * when that entry last moved, and whether it fell back to `standardPrice`
 * because the list has no row.
 *
 * S-3 put `priceSource`, `priceListName` and `pricedAt` on every listing for
 * exactly this, and until now nothing rendered them. A till charging $1.20 when
 * the pricing screen says $1.35 is answered here in one look.
 */

type ListingDetail = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  description: string | null;
  barcode: string | null;
  imageUrl: string | null;
  ageRestricted: boolean;
  status: string;
  unitPrice: number;
  compareAtPrice: number | null;
  taxPercent: number;
  taxInclusive: boolean;
  currency: string;
  priceListId: string | null;
  priceSource: string;
  pricedAt: string | null;
  category: string | null;
  inventoryItem: {
    id: string;
    itemCode: string;
    name: string;
    currentStock: number;
    unit: string;
  } | null;
  site: { id: string; name: string; code: string } | null;
};

/** What the resolver did, in words a shopkeeper can act on. */
function priceSourceLabel(source: string) {
  if (source === "PRICE_LIST") return "The shelf price list";
  if (source === "STANDARD") return "The item's fallback price";
  if (source === "LISTING") return "The listing's own columns";
  return source;
}

export default function RetailCatalogItemPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id ?? "";

  const query = useQuery({
    queryKey: ["retail-catalog-item", productId],
    enabled: Boolean(productId),
    queryFn: () => fetchJson<ListingDetail>(`/api/v2/retail/catalog/${productId}`),
  });

  const item = query.data;

  return (
    <RetailShell
      area="range"
      title={item?.name ?? "Catalogue item"}
      description={
        item
          ? `${item.sku} · ${item.status} · ${item.site?.name ?? "Unknown branch"}`
          : "One line on the range, its price, and the stock behind it."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/catalog">
              <TableRows className="h-4 w-4" />
              The range
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/merchandising/pricing">
              <Coins className="h-4 w-4" />
              Pricing
            </Link>
          </Button>
        </div>
      }
    >
      {query.isPending ? (
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Fetching the catalogue item…</span>
          <Skeleton height={104} />
          <Skeleton height={240} />
        </div>
      ) : query.isError ? (
        <Alert tone="danger" title="That item would not open">
          {getApiErrorMessage(query.error)}
        </Alert>
      ) : !item ? (
        <Alert tone="warn" title="No item with that reference">
          The link may be from another shop, or the line may since have been
          archived off the range.
        </Alert>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <StatCard
              label="Shelf price"
              value={retailMoney(item.unitPrice)}
              footer={item.taxInclusive ? "VAT included" : "VAT added at the till"}
            />
            <StatCard
              label="On hand"
              value={
                item.inventoryItem
                  ? `${item.inventoryItem.currentStock} ${item.inventoryItem.unit}`
                  : "Not stocked"
              }
              tone={(item.inventoryItem?.currentStock ?? 0) > 0 ? "success" : "warn"}
            />
            <StatCard label="Tax rate" value={`${item.taxPercent.toFixed(2)}%`} />
            <StatCard
              label="Was price"
              value={item.compareAtPrice === null ? "—" : retailMoney(item.compareAtPrice)}
              footer={item.compareAtPrice === null ? "Nothing struck through" : "Shown struck through"}
            />
          </div>

          {/*
            The answer to "why is the till charging that". `STANDARD` here means
            the shelf list has no entry for this product and the resolver fell
            back — which is not an error, but it is the state a price edit
            silently lands in when it writes the product and not the list.
          */}
          <Alert
            tone={item.priceSource === "PRICE_LIST" ? "info" : "warn"}
            title={`Priced from: ${priceSourceLabel(item.priceSource)}`}
          >
            {item.priceSource === "PRICE_LIST"
              ? `Resolved off the shelf list${
                  item.pricedAt ? ` · last changed ${new Date(item.pricedAt).toLocaleString()}` : ""
                }.`
              : "The shelf price list has no entry for this line, so the till is charging the item's fallback price. Set a price on the pricing screen to change that."}
          </Alert>

          {item.ageRestricted ? (
            <Alert tone="warn" title="Age restricted">
              The counter is told to check identification before this is rung up.
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
            <div>
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt=""
                  width={200}
                  height={200}
                  className="rounded-lg border border-[var(--border-subtle)] object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-center">
                  <span className="t-body-sm t-muted">
                    No shelf photo. The till draws a placeholder for this line.
                  </span>
                </div>
              )}
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="t-body-sm t-muted">SKU</dt>
                <dd className="font-mono text-sm">{item.sku}</dd>
              </div>
              <div>
                <dt className="t-body-sm t-muted">Barcode</dt>
                <dd className="font-mono text-sm">{item.barcode ?? "Not scanned"}</dd>
              </div>
              <div>
                <dt className="t-body-sm t-muted">Category</dt>
                <dd className="text-sm">{item.category ?? "Uncategorised"}</dd>
              </div>
              <div>
                <dt className="t-body-sm t-muted">Stock line</dt>
                <dd className="font-mono text-sm">{item.inventoryItem?.itemCode ?? "—"}</dd>
              </div>
              {item.description ? (
                <div className="sm:col-span-2">
                  <dt className="t-body-sm t-muted">Description</dt>
                  <dd className="text-sm">{item.description}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      )}
    </RetailShell>
  );
}
