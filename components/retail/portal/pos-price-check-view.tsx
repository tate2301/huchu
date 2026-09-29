"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import { Package, QrCode, ReceiptLong, Search } from "@/lib/icons";
import { formatQuantity } from "@/lib/retail/words";
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
              className="text-xs font-bold"
              style={{ color: "var(--pos-lcd-label)" }}
            >
              Scan or search
            </div>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Scan barcode or search…"
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
          {!currentShift ? (
            <PosEmptyState icon={ReceiptLong} title="Open a shift first" />
          ) : !featuredItem ? (
            <PosEmptyState
              icon={Package}
              title={
                catalogQuery.isLoading
                  ? "Loading the products…"
                  : catalogQuery.isError
                    ? "The products would not load"
                    : "No products match that search"
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
                {featuredItem.inventoryItem && featuredItem.inventoryItem.currentStock <= 0 ? (
                  <PosStatusPill tone="danger">Out of stock</PosStatusPill>
                ) : null}
                <h2
                  className="mt-2 text-[1.8rem] font-bold tracking-[-0.04em]"
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
                    className="text-xs font-bold"
                    style={{ color: "var(--pos-amount-label)" }}
                  >
                    {featuredItem.barcode ? "Barcode" : "SKU"}
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
                    className="text-xs font-bold"
                    style={{ color: "var(--pos-amount-label)" }}
                  >
                    On hand
                  </div>
                  <div
                    className="mt-1 text-sm font-medium"
                    style={{ color: "var(--pos-amount-text)" }}
                  >
                    {featuredItem.inventoryItem
                      ? formatQuantity(
                          featuredItem.inventoryItem.currentStock,
                          featuredItem.inventoryItem.unit,
                        )
                      : "Not tracked"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </PosPanel>

        {/* Match list */}
        <PosPanel className="min-h-0">
          <PosPanelHeader title={`${rows.length} ${rows.length === 1 ? "product" : "products"}`} />

          <div className="h-full min-h-0 overflow-y-auto pr-1">
            {!currentShift ? (
              <PosEmptyState icon={ReceiptLong} title="Open a shift first" />
            ) : rows.length === 0 ? (
              <PosEmptyState
                icon={Package}
                title={
                  catalogQuery.isLoading
                    ? "Loading the products…"
                    : catalogQuery.isError
                      ? "The products would not load"
                      : "No products match that search"
                }
              />
            ) : (
              <div className="space-y-2">
                {rows.map((item) => (
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
                        <div className="truncate text-[15px] font-semibold text-[var(--text-strong)]">
                          {item.name}
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
                      <div className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">
                        {item.inventoryItem
                          ? formatQuantity(item.inventoryItem.currentStock, item.inventoryItem.unit)
                          : "Not tracked"}
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
