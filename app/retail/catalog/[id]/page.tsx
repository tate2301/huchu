"use client";

import Image from "next/image";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import {
  FactList,
  HeaderAction,
  RecordHeader,
  SectionAction,
  SectionHeading,
  StatusBadge,
} from "@/components/management/ui";
import {
  ChangePriceDialog,
  ProductDialog,
  useInvalidateProducts,
  type RetailProduct,
} from "@/components/retail/product-dialogs";
import { RetailShell } from "@/components/retail/retail-shell";
import { SellingRulesDialog, type SellingRules } from "@/components/retail/selling-rules-dialog";
import { retailMoney } from "@/components/retail/sale-detail";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Coins, Pencil, TableRows } from "@/lib/icons";
import { enumLabel, formatQuantity, formatRetailDate } from "@/lib/retail/words";

type ProductDetail = RetailProduct & Omit<SellingRules, "id" | "name"> & {
  productId: string;
  openableCase: { productId: string; name: string; unitsPerCase: number } | null;
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
 * One product: what it sells for and what is on hand. Drawn as a management
 * record: the header with the product's one verb (Change price) and the rare
 * ones behind its "…" (Edit, Remove), a badge only when the product is not
 * simply on sale, then section headings over 44px fact rows.
 *
 * The page still answers "why is the till charging that": the price's source
 * and when it last changed are facts in the list, not an alert over it.
 */
export default function RetailProductPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id ?? "";
  const [editing, setEditing] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [rules, setRules] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const invalidate = useInvalidateProducts();

  const query = useQuery({
    queryKey: ["retail-catalog-item", productId],
    enabled: Boolean(productId),
    queryFn: () => fetchJson<ProductDetail>(`/api/v2/retail/catalog/${productId}`),
  });

  const product = query.data;
  const editable = product ? ({ ...product, inventoryItemId: product.inventoryItem?.id ?? "" } as RetailProduct) : null;

  const remove = useMutation({
    mutationFn: () => fetchJson(`/api/v2/retail/catalog/${productId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Product removed", variant: "success" });
      invalidate();
      router.push("/retail/catalog");
    },
    onError: (error) =>
      toast({
        title: "That product was not removed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const confirmRemove = () => {
    if (!product) return;
    void dsConfirm({
      title: `Remove ${product.name}?`,
      description: "It stops appearing on the till. Its stock stays on hand, and past sales keep its name.",
      confirmLabel: "Remove the product",
      variant: "danger",
    }).then((confirmed) => {
      if (confirmed) remove.mutate();
    });
  };

  const exception = !product
    ? null
    : product.status !== "ACTIVE"
      ? { tone: "neutral" as const, label: "Off sale" }
      : (product.inventoryItem?.currentStock ?? 0) <= 0
        ? { tone: "warn" as const, label: "Out of stock" }
        : null;

  return (
    <RetailShell title="Products">
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
        <div className="space-y-6" style={{ maxWidth: WIDTH + 232 }}>
          <RecordHeader
            icon={TableRows}
            title={product.name}
            badge={
              exception ? (
                <StatusBadge tone={exception.tone} context="header">
                  {exception.label}
                </StatusBadge>
              ) : null
            }
            action={
              <HeaderAction icon={Coins} onClick={() => setPricing(true)}>
                Change price
              </HeaderAction>
            }
            overflow={
              <>
                <DropdownMenuItem onSelect={() => setEditing(true)}>Edit product</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={confirmRemove}
                  className="text-[var(--tone-danger-strong)]"
                >
                  Remove product
                </DropdownMenuItem>
              </>
            }
          />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,560px)_200px]">
          <div>
            <SectionHeading maxWidth={WIDTH} className="mt-0">Price</SectionHeading>
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

            <SectionHeading
              maxWidth={WIDTH}
              action={
                <SectionAction icon={Pencil} onClick={() => setRules(true)}>
                  Change
                </SectionAction>
              }
            >
              Selling rules
            </SectionHeading>
            <FactList
              maxWidth={WIDTH}
              items={[
                { label: "Check ID", value: product.ageRestricted ? "Yes, 18+" : "No" },
                {
                  label: "Deposit",
                  value: product.returnable && product.depositAmount !== null ? retailMoney(product.depositAmount) : "None",
                  mono: product.returnable,
                  tone: product.returnable ? "default" : "muted",
                },
                {
                  label: "Most off",
                  value: product.maxDiscountPercent === null ? "No limit" : `${product.maxDiscountPercent}%`,
                  mono: product.maxDiscountPercent !== null,
                  tone: product.maxDiscountPercent === null ? "muted" : "default",
                },
                ...(product.caseOf
                  ? [{ label: "A case of", value: `${product.caseOf.unitsPerCase} × ${product.caseOf.name}` }]
                  : product.openableCase
                    ? [{ label: "Comes in", value: `${product.openableCase.name}, ${product.openableCase.unitsPerCase} a case` }]
                    : []),
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
        </div>
      )}

      <ProductDialog open={editing} onOpenChange={setEditing} product={editable} />
      <ChangePriceDialog product={pricing ? editable : null} onOpenChange={(open) => !open && setPricing(false)} />
      <SellingRulesDialog product={rules && product ? product : null} onOpenChange={(open) => !open && setRules(false)} />
    </RetailShell>
  );
}
