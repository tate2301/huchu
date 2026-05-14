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
          description="Scan-first, glanceable. Answers price, code, and stock in seconds."
        />

        {/* LCD search input */}
        <div
          className="flex items-center gap-3 rounded-xl border px-4 py-3"
          style={{ background: "var(--pos-lcd-bg)", borderColor: "var(--pos-lcd-border)" }}
        >
          <QrCode
            className="h-5 w-5 shrink-0"
            style={{ color: "var(--pos-lcd-label)" }}
          />
          <div className="min-w-0 flex-1">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "var(--pos-lcd-label)" }}
            >
              Scanner-ready
            </div>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Scan barcode or search product"
              className="mt-0.5 h-9 border-none bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
              style={{ color: "var(--pos-lcd-text)" }}
            />
          </div>
          <Search
            className="h-4 w-4 shrink-0 opacity-40"
            style={{ color: "var(--pos-lcd-label)" }}
          />
        </div>
      </PosPanel>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(320px,0.92fr)_minmax(0,1.08fr)]">
        {/* Featured result hero panel */}
        <PosPanel className="flex min-h-0 flex-col">
          <PosPanelHeader
            eyebrow="Featured result"
            title="Best match"
            description="Price, code, and stock at a glance."
          />

          {!currentShift ? (
            <PosEmptyState
              icon={ReceiptLong}
              title="Open a shift to use price check"
              description="Price check is tied to the active selling site."
            />
          ) : !featuredItem ? (
            <PosEmptyState
              icon={Package}
              title="No product selected yet"
              description={
                catalogQuery.isLoading
                  ? "Loading product matches."
                  : "Scan a barcode or type a product name."
              }
            />
          ) : (
            <div
              className="flex h-full flex-col justify-between rounded-xl border p-5"
              style={{
                background: "var(--pos-amount-bg)",
                borderColor: "var(--pos-amount-border)",
              }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <PosStatusPill tone="brand">Top match</PosStatusPill>
                  {featuredItem.inventoryItem ? (
                    <PosStatusPill
                      tone={featuredItem.inventoryItem.currentStock > 0 ? "success" : "danger"}
                    >
                      {featuredItem.inventoryItem.currentStock > 0 ? "In stock" : "Out of stock"}
                    </PosStatusPill>
                  ) : null}
                </div>
                <h2
                  className="mt-4 text-[1.8rem] font-bold tracking-[-0.04em]"
                  style={{ color: "var(--pos-amount-text)" }}
                >
                  {featuredItem.name}
                </h2>
                <div
                  className="mt-3 font-mono text-[2.5rem] font-black tabular-nums tracking-tight"
                  style={{ color: "var(--pos-amount-text)" }}
                >
                  {money(featuredItem.unitPrice)}
                </div>
              </div>

              <div className="mt-6 grid gap-2">
                <div
                  className="rounded-lg border px-4 py-3 ring-1"
                  style={{
                    background: "var(--pos-amount-surface)",
                    borderColor: "var(--pos-amount-border)",
                    boxShadow: `inset 0 0 0 1px var(--pos-amount-border)`,
                  }}
                >
                  <div
                    className="text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: "var(--pos-amount-label)" }}
                  >
                    Barcode / SKU
                  </div>
                  <div
                    className="mt-1 font-mono text-sm font-semibold tabular-nums"
                    style={{ color: "var(--pos-amount-text)" }}
                  >
                    {featuredItem.barcode || featuredItem.sku}
                  </div>
                </div>
                <div
                  className="rounded-lg border px-4 py-3"
                  style={{
                    background: "var(--pos-amount-surface)",
                    borderColor: "var(--pos-amount-border)",
                  }}
                >
                  <div
                    className="text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: "var(--pos-amount-label)" }}
                  >
                    Stock
                  </div>
                  <div
                    className="mt-1 text-sm font-medium"
                    style={{ color: "var(--pos-amount-text)" }}
                  >
                    {featuredItem.inventoryItem
                      ? `${featuredItem.inventoryItem.currentStock.toFixed(2)} ${featuredItem.inventoryItem.unit}`
                      : "No stock data"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </PosPanel>

        {/* Match list */}
        <PosPanel className="min-h-0">
          <PosPanelHeader
            eyebrow="Matches"
            title="Lookup results"
            description="Dense and scannable. First result is the best match."
          />

          <div className="h-full min-h-0 overflow-y-auto pr-1">
            {!currentShift ? (
              <PosEmptyState
                icon={ReceiptLong}
                title="Price check is waiting on an open shift"
                description="Once the register is active, product matches appear here."
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
              <div className="space-y-2">
                {rows.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex min-h-[4.5rem] items-center justify-between gap-4 rounded-xl border border-[var(--edge-default)] bg-[var(--surface-base)] px-4 py-3 ring-1 ring-transparent transition-all hover:ring-[var(--pos-status-info-ring)]"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                        style={{ background: "var(--pos-status-info-bg)", color: "var(--pos-status-info-text)" }}
                      >
                        <Package className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-[15px] font-semibold text-[var(--text-strong)]">
                            {item.name}
                          </div>
                          {index === 0 ? <PosStatusPill tone="brand">Best</PosStatusPill> : null}
                        </div>
                        <div className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">
                          {item.barcode || item.sku}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-lg font-black tabular-nums text-[var(--text-strong)]">
                        {money(item.unitPrice)}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {item.inventoryItem
                          ? `${item.inventoryItem.currentStock.toFixed(2)} ${item.inventoryItem.unit}`
                          : "No stock"}
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
