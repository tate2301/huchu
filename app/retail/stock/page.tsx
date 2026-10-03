"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@corelithzw/react";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { ColumnFigure, ColumnList, ColumnName, ColumnText, StatusDot } from "@/components/management/ui";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import type { RetailProduct } from "@/components/retail/product-dialogs";
import { fetchSites } from "@/lib/api";
import { fetchJson } from "@/lib/api-client";
import { formatQuantity } from "@/lib/retail/words";

const LEVEL_OPTIONS = new Map([
  ["LOW", "Running low"],
  ["OUT", "Out of stock"],
  ["OK", "In stock"],
]);

const WIDTH = 960;

type Level = "OUT" | "LOW" | "OK";

function levelOf(product: RetailProduct): Level {
  const onHand = product.inventoryItem?.currentStock ?? 0;
  if (onHand <= 0) return "OUT";
  const reorder = product.inventoryItem?.reorderLevel ?? null;
  return reorder !== null && onHand <= reorder ? "LOW" : "OK";
}

const LEVEL_ORDER: Record<Level, number> = { OUT: 0, LOW: 1, OK: 2 };

/**
 * Stock › On hand — how much of each product the shop has.
 *
 * One table, one subject: every product with a stock line, out of stock and
 * running low first, then A to Z. The level is a filter, not a band above the
 * table; the branch is a filter when there is more than one. A product's
 * name opens its record, where its reorder level is edited and a case is
 * opened into singles. Counting is the one verb, in the app bar.
 */
export default function RetailStockPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<string>(FILTER_ANY);
  const [siteId, setSiteId] = useState<string>(FILTER_ANY);

  const sitesQuery = useQuery({ queryKey: ["retail-stock-sites"], queryFn: fetchSites });
  const sites = useMemo(
    () => (sitesQuery.data ?? []).filter((site: { isActive?: boolean }) => site.isActive !== false),
    [sitesQuery.data],
  );
  const siteOptions = useMemo(
    () => new Map(sites.map((site: { id: string; name: string }) => [site.id, site.name])),
    [sites],
  );

  const stockQuery = useQuery({
    queryKey: ["retail-catalog", "stock", siteId],
    queryFn: () => {
      const params = new URLSearchParams({ status: "all" });
      if (siteId !== FILTER_ANY) params.set("siteId", siteId);
      return fetchJson<{ data: RetailProduct[] }>(`/api/v2/retail/catalog?${params.toString()}`);
    },
  });
  const products = useMemo(() => stockQuery.data?.data ?? [], [stockQuery.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products
      .filter((product) => product.inventoryItem)
      .filter((product) => level === FILTER_ANY || levelOf(product) === level)
      .filter(
        (product) =>
          !needle ||
          [product.name, product.sku, product.barcode ?? ""].some((value) => value.toLowerCase().includes(needle)),
      )
      .sort(
        (left, right) =>
          LEVEL_ORDER[levelOf(left)] - LEVEL_ORDER[levelOf(right)] || left.name.localeCompare(right.name),
      );
  }, [products, level, search]);

  const filtered = level !== FILTER_ANY || siteId !== FILTER_ANY;

  return (
    <RecordListShell
      title="On hand"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by name, code or barcode"
      filters={
        <>
          <ViewToolbarFilter
            label="Level"
            value={level}
            anyLabel="Any level"
            options={LEVEL_OPTIONS}
            onChange={setLevel}
          />
          <ViewToolbarFilter
            label="Site"
            value={siteId}
            anyLabel="Every site"
            options={siteOptions}
            onChange={setSiteId}
          />
        </>
      }
      filterCount={(level === FILTER_ANY ? 0 : 1) + (siteId === FILTER_ANY ? 0 : 1)}
      count={stockQuery.isSuccess ? `${rows.length} of ${products.length}` : null}
      createLabel="Count stock"
      onCreate={() => router.push("/retail/stock/count?new=1")}
      error={stockQuery.error}
    >
      {stockQuery.isPending ? (
        <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : (
        <ColumnList
          label="On hand"
          maxWidth={WIDTH}
          empty={search.trim() || filtered ? "Nothing matches." : "No stock yet."}
          columns={[
            { id: "product", label: "Product" },
            { id: "category", label: "Category", hideBelow: "md" },
            { id: "level", label: "Level", hideBelow: "sm" },
            { id: "onHand", label: "On hand", align: "end" },
            { id: "reorder", label: "Reorder at", align: "end", hideBelow: "sm" },
          ]}
          rows={rows.map((product) => {
            const state = levelOf(product);
            const unit = product.inventoryItem?.unit;
            const reorder = product.inventoryItem?.reorderLevel ?? null;
            return {
              id: product.id,
              cells: {
                product: (
                  <ColumnName
                    name={product.name}
                    meta={[product.sku, siteId === FILTER_ANY && sites.length > 1 ? product.site?.name : null]
                      .filter(Boolean)
                      .join(" · ")}
                    href={`/retail/catalog/${product.id}`}
                  />
                ),
                category: product.category ? <ColumnText>{product.category}</ColumnText> : null,
                level:
                  state === "OUT" ? (
                    <StatusDot tone="danger" label="Out of stock" />
                  ) : state === "LOW" ? (
                    <StatusDot tone="warn" label="Running low" />
                  ) : null,
                onHand: (
                  <ColumnFigure tone={state === "OUT" ? "danger" : state === "LOW" ? "warn" : "default"}>
                    {formatQuantity(product.inventoryItem?.currentStock ?? 0, unit)}
                  </ColumnFigure>
                ),
                reorder: (
                  <ColumnFigure tone="muted">{reorder === null ? "—" : formatQuantity(reorder, unit)}</ColumnFigure>
                ),
              },
            };
          })}
        />
      )}
    </RecordListShell>
  );
}
