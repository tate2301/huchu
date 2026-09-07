"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Alert, EmptyState, KpiGrid, RowCard, Skeleton, StatHero } from "@corelithzw/react";

import { ClientDate } from "@corelithzw/ui/components/client-date";
import { fetchInventoryItems, fetchStockMovements } from "../api-client";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { ChevronRight } from "@corelithzw/ui/lib/icons";

/**
 * The stock overview, on the dashboard recipe: one brand-tinted hero carrying
 * the number the module exists to report, three neutral metrics under it, and
 * then the drill targets — each a row that goes somewhere real.
 *
 * What it replaced was a wall of tinted tiles with no hierarchy, so nothing on
 * it was more important than anything else.
 */

function money(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function StockOverview({ siteId }: { siteId?: string }) {
  const itemsQuery = useQuery({
    queryKey: ["inventory-items", siteId ?? "all", "overview"],
    queryFn: () => fetchInventoryItems({ siteId, limit: 500 }),
  });

  const movementsQuery = useQuery({
    queryKey: ["stock-movements", siteId ?? "all", "overview"],
    queryFn: () => fetchStockMovements({ siteId, limit: 10 }),
  });

  const items = useMemo(() => itemsQuery.data?.data ?? [], [itemsQuery.data]);
  const movements = useMemo(() => movementsQuery.data?.data ?? [], [movementsQuery.data]);

  const summary = useMemo(() => {
    let value = 0;
    let priced = 0;
    let low = 0;
    let out = 0;
    for (const item of items) {
      if (item.unitCost !== null && item.unitCost !== undefined) {
        value += item.currentStock * item.unitCost;
        priced += 1;
      }
      if (item.currentStock <= 0) out += 1;
      else if (item.minStock !== null && item.minStock !== undefined && item.currentStock <= item.minStock) {
        low += 1;
      }
    }
    return {
      value,
      low,
      out,
      total: items.length,
      // Whether the headline can be trusted. Reporting a value computed from
      // half the items as though it were the whole is the failure this exists
      // to prevent.
      pricedShare: items.length > 0 ? priced / items.length : 1,
    };
  }, [items]);

  if (itemsQuery.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton height={140} />
        <Skeleton height={96} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (itemsQuery.error) {
    return (
      <Alert tone="danger" title="Unable to load stock">
        {getApiErrorMessage(itemsQuery.error)}
      </Alert>
    );
  }

  if (summary.total === 0) {
    return (
      <EmptyState
        title="Nothing in stock yet"
        body="Receive something in and it shows up here, along with what it is worth and where it is."
      />
    );
  }

  const needsAttention = summary.low + summary.out;

  return (
    <div className="space-y-5">
      <StatHero
        label="Stock on hand"
        value={money(summary.value)}
        subtitle={
          summary.pricedShare < 1
            ? `Counted from the ${Math.round(summary.pricedShare * 100)}% of items that have a unit cost recorded.`
            : `Across ${summary.total} items.`
        }
        trend={needsAttention > 0 ? "down" : "neutral"}
        change={
          needsAttention > 0
            ? `${needsAttention} need attention`
            : "Everything above its minimum"
        }
      />

      <KpiGrid
        cols={3}
        items={[
          {
            label: "Items held",
            value: String(summary.total),
            href: "/stores/inventory",
          },
          {
            label: "Below minimum",
            value: String(summary.low),
            tone: summary.low > 0 ? "warn" : undefined,
            href: "/stores/inventory?lowStock=true",
          },
          {
            label: "Out of stock",
            value: String(summary.out),
            tone: summary.out > 0 ? "danger" : undefined,
            href: "/stores/inventory?lowStock=true",
          },
        ]}
      />

      <section aria-labelledby="stock-attention" className="space-y-2">
        <h2
          id="stock-attention"
          className="text-sm font-medium uppercase tracking-wide text-[var(--text-subtle)]"
        >
          Running low
        </h2>
        {items.filter(
          (item) =>
            item.currentStock <= 0 ||
            (item.minStock !== null &&
              item.minStock !== undefined &&
              item.currentStock <= item.minStock),
        ).length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] px-3 py-4 text-sm text-[var(--text-muted)]">
            Nothing is below its minimum.
          </p>
        ) : (
          <div className="space-y-2">
            {items
              .filter(
                (item) =>
                  item.currentStock <= 0 ||
                  (item.minStock !== null &&
                    item.minStock !== undefined &&
                    item.currentStock <= item.minStock),
              )
              .slice(0, 6)
              .map((item) => (
                <RowCard
                  key={item.id}
                  title={item.name}
                  subtitle={`${item.site?.name ?? "—"} · ${item.location?.name ?? "—"}`}
                  status={
                    <span className="font-mono text-sm tabular-nums">
                      {item.currentStock} {item.unit}
                      {item.minStock ? (
                        <span className="text-[var(--text-subtle)]"> / {item.minStock}</span>
                      ) : null}
                    </span>
                  }
                  action={<ChevronRight className="size-4 text-[var(--text-subtle)]" />}
                />
              ))}
          </div>
        )}
      </section>

      <section aria-labelledby="stock-recent" className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id="stock-recent"
            className="text-sm font-medium uppercase tracking-wide text-[var(--text-subtle)]"
          >
            Last movements
          </h2>
          <Link href="/stores/movements" className="text-sm hover:underline">
            All movements
          </Link>
        </div>

        {movementsQuery.error ? (
          <Alert tone="danger" title="Unable to load movements">
            {getApiErrorMessage(movementsQuery.error)}
          </Alert>
        ) : movements.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] px-3 py-4 text-sm text-[var(--text-muted)]">
            Nothing has moved yet.
          </p>
        ) : (
          <div className="space-y-2">
            {movements.slice(0, 5).map((movement) => (
              <RowCard
                key={movement.id}
                title={movement.item?.name ?? "Unknown item"}
                subtitle={
                  <>
                    {movement.movementType === "ISSUE" ? "Issued" : "Received"}
                    {" · "}
                    <ClientDate value={movement.createdAt} mode="date" />
                  </>
                }
                status={
                  <span className="font-mono text-sm tabular-nums">
                    {movement.movementType === "ISSUE" ? "−" : "+"}
                    {movement.quantity} {movement.unit}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
