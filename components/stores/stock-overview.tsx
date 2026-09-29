"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, EmptyState, KpiGrid, RowCard, Skeleton, StatHero } from "@corelithzw/react";

import { SectionHeading } from "@/components/management/ui";
import { fetchInventoryItems, fetchStockMovements } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { ChevronRight } from "@/lib/icons";
import { formatQuantity, formatRetailDate } from "@/lib/retail/words";

import { movementDelta, movementTypeLabel, stockLevelLabel } from "./stock-words";

/**
 * The stock overview, on the dashboard recipe: one brand-tinted hero carrying
 * the number the module exists to report, three neutral metrics under it, and
 * then the drill targets — each a row that goes somewhere real.
 *
 * What it replaced was a wall of tinted tiles with no hierarchy, so nothing on
 * it was more important than anything else.
 */

/** The shell's own width (max-w-7xl), so a heading's link sits on the rows' right edge. */
const SECTION_WIDTH = 1280;

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function StockOverview({ siteId }: { siteId?: string }) {
  const router = useRouter();
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
  const short = useMemo(() => items.filter((item) => stockLevelLabel(item) !== null), [items]);

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
      const level = stockLevelLabel(item);
      if (level === "Out") out += 1;
      else if (level === "Low") low += 1;
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
      <Alert tone="danger" title="The stock would not load">
        {getApiErrorMessage(itemsQuery.error)}
      </Alert>
    );
  }

  if (summary.total === 0) {
    return <EmptyState title="No stock items yet" />;
  }

  const needsAttention = summary.low + summary.out;

  return (
    <div className="space-y-5">
      <StatHero
        label="Value on hand"
        value={MONEY.format(summary.value)}
        subtitle={
          summary.pricedShare < 1
            ? `Counted from the ${Math.round(summary.pricedShare * 100)}% of stock items with a unit cost.`
            : `Across ${summary.total} stock items.`
        }
        trend={needsAttention > 0 ? "down" : "neutral"}
        change={
          needsAttention > 0 ? `${needsAttention} need attention` : "Everything above its minimum"
        }
      />

      <KpiGrid
        cols={3}
        items={[
          {
            label: "Stock items",
            value: String(summary.total),
            href: "/stores/inventory",
          },
          {
            label: "Low",
            value: String(summary.low),
            tone: summary.low > 0 ? "warn" : undefined,
            href: "/stores/inventory?level=low",
          },
          {
            label: "Out of stock",
            value: String(summary.out),
            tone: summary.out > 0 ? "danger" : undefined,
            href: "/stores/inventory?level=out",
          },
        ]}
      />

      <section>
        <SectionHeading count={short.length} maxWidth={SECTION_WIDTH}>
          Running low
        </SectionHeading>
        {short.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] px-3 py-4 text-sm text-[var(--text-muted)]">
            Nothing is at or under its minimum.
          </p>
        ) : (
          <div className="space-y-2">
            {short.slice(0, 6).map((item) => (
              <RowCard
                key={item.id}
                title={item.name}
                subtitle={`${item.site?.name ?? "No site"} · ${item.location?.name ?? "No location"}`}
                onClick={() =>
                  router.push(`/stores/movements?q=${encodeURIComponent(item.itemCode)}`)
                }
                status={
                  <span className="font-mono text-sm tabular-nums">
                    {formatQuantity(item.currentStock, item.unit)}
                    {item.minStock ? (
                      <span className="text-[var(--text-subtle)]"> of {item.minStock}</span>
                    ) : null}
                  </span>
                }
                action={<ChevronRight className="size-4 text-[var(--text-subtle)]" />}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeading
          maxWidth={SECTION_WIDTH}
          action={
            <Link href="/stores/movements" className="text-sm hover:underline">
              All movements
            </Link>
          }
        >
          Last movements
        </SectionHeading>

        {movementsQuery.error ? (
          <Alert tone="danger" title="The movements would not load">
            {getApiErrorMessage(movementsQuery.error)}
          </Alert>
        ) : movements.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] px-3 py-4 text-sm text-[var(--text-muted)]">
            No movements yet
          </p>
        ) : (
          <div className="space-y-2">
            {movements.slice(0, 5).map((movement) => {
              const delta = movementDelta(movement.movementType, movement.quantity);
              return (
                <RowCard
                  key={movement.id}
                  title={movement.item?.name ?? "Stock item not on file"}
                  subtitle={`${movementTypeLabel(movement.movementType)} · ${formatRetailDate(movement.createdAt)}`}
                  status={
                    <span className="font-mono text-sm tabular-nums">
                      {delta < 0 ? "−" : "+"}
                      {formatQuantity(Math.abs(delta), movement.unit)}
                    </span>
                  }
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
