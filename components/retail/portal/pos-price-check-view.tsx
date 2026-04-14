"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import { Package, QrCode, ReceiptLong, Search } from "@/lib/icons";
import {
  PosEmptyState,
  PosPanel,
  PosPanelHeader,
  PosStatusPill,
} from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import type { PosCatalogItem } from "./pos-types";
import { money } from "./pos-utils";

export function PosPriceCheckView() {
  const { currentShift } = usePosPortalState();
  const [search, setSearch] = useState("");

  const catalogQuery = useQuery({
    queryKey: ["retail-pos-price-check", currentShift?.siteId, search],
    queryFn: () =>
      fetchJson<{ data: PosCatalogItem[] }>(
        `/api/v2/retail/pos/catalog?siteId=${encodeURIComponent(currentShift?.siteId ?? "")}&search=${encodeURIComponent(search)}`,
      ),
    enabled: Boolean(currentShift?.siteId),
  });

  const rows = useMemo(() => catalogQuery.data?.data ?? [], [catalogQuery.data?.data]);
  const featuredItem = rows[0] ?? null;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <PosPanel>
        <PosPanelHeader
          eyebrow="Speed lookup"
          title="Price check"
          description="Keep this lane scan-first, glanceable, and oversized enough to answer a customer in seconds."
        />

        <div className="rounded-[1.25rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-3">
          <div className="flex items-center gap-3 rounded-[1rem] border border-[var(--border-subtle)] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--action-primary-bg)]">
              <Search className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <QrCode className="h-4 w-4" />
                Scanner-ready input
              </div>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Scan barcode or search product"
                className="mt-1 h-11 border-none bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
        </div>
      </PosPanel>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(320px,0.92fr)_minmax(0,1.08fr)]">
        <PosPanel className="flex min-h-0 flex-col">
          <PosPanelHeader
            eyebrow="Featured result"
            title="Best match"
            description="The first result should answer price, code, and stock at a glance."
          />

          {!currentShift ? (
            <PosEmptyState
              icon={ReceiptLong}
              title="Open a shift to use price check"
              description="Price check is tied to the active selling site, so it becomes available once the register is open."
            />
          ) : !featuredItem ? (
            <PosEmptyState
              icon={Package}
              title="No product selected yet"
              description={
                catalogQuery.isLoading
                  ? "Loading product matches."
                  : "Scan a barcode or type a product name to pull the best match here."
              }
            />
          ) : (
            <div className="flex h-full flex-col justify-between rounded-[1.4rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-5">
              <div>
                <div className="flex items-center gap-2">
                  <PosStatusPill tone="brand">Top match</PosStatusPill>
                  {featuredItem.inventoryItem ? (
                    <PosStatusPill
                      tone={
                        featuredItem.inventoryItem.currentStock > 0 ? "success" : "danger"
                      }
                    >
                      {featuredItem.inventoryItem.currentStock > 0 ? "In stock" : "Out of stock"}
                    </PosStatusPill>
                  ) : null}
                </div>
                <h2 className="mt-4 text-[1.8rem] font-semibold tracking-[-0.04em] text-[var(--text-strong)]">
                  {featuredItem.name}
                </h2>
                <div className="mt-3 font-mono text-[2.3rem] font-semibold tracking-[-0.04em] text-[var(--text-strong)]">
                  {money(featuredItem.unitPrice)}
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                <div className="rounded-[1rem] border border-[var(--border-subtle)] bg-white/80 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Barcode / SKU
                  </div>
                  <div className="mt-2 font-mono text-sm font-semibold text-[var(--text-strong)]">
                    {featuredItem.barcode || featuredItem.sku}
                  </div>
                </div>
                <div className="rounded-[1rem] border border-[var(--border-subtle)] bg-white/80 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Stock
                  </div>
                  <div className="mt-2 text-sm font-medium text-[var(--text-strong)]">
                    {featuredItem.inventoryItem
                      ? `${featuredItem.inventoryItem.currentStock.toFixed(2)} ${featuredItem.inventoryItem.unit}`
                      : "No stock data"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </PosPanel>

        <PosPanel className="min-h-0">
          <PosPanelHeader
            eyebrow="Matches"
            title="Lookup results"
            description="Keep the list dense, readable, and easy to scan when the first result is not the right one."
          />

          <div className="h-full min-h-0 overflow-y-auto pr-1">
            {!currentShift ? (
              <PosEmptyState
                icon={ReceiptLong}
                title="Price check is waiting on an open shift"
                description="Once the register is active, product matches and stock cues will appear here."
              />
            ) : rows.length === 0 ? (
              <PosEmptyState
                icon={Package}
                title="No matching products"
                description={
                  catalogQuery.isLoading
                    ? "Loading products now."
                    : "Try a barcode, SKU, or a shorter item name."
                }
              />
            ) : (
              <div className="space-y-3">
                {rows.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex min-h-[5.5rem] items-center justify-between gap-4 rounded-[1.2rem] border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-4"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[var(--action-primary-bg)] shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                        <Package className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-base font-semibold text-[var(--text-strong)]">
                            {item.name}
                          </div>
                          {index === 0 ? <PosStatusPill tone="brand">Best</PosStatusPill> : null}
                        </div>
                        <div className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                          {item.barcode || item.sku}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg font-semibold text-[var(--text-strong)]">
                        {money(item.unitPrice)}
                      </div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        {item.inventoryItem
                          ? `${item.inventoryItem.currentStock.toFixed(2)} ${item.inventoryItem.unit}`
                          : "No stock data"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PosPanel>
      </div>
    </div>
  );
}
