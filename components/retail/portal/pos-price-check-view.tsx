"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
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

  return (
    <div className="space-y-3">
      <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] p-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Scan barcode or search product"
          className="h-11"
        />
      </div>
      {!currentShift ? (
        <div className="rounded-[1rem] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-3 py-8 text-center text-sm text-[var(--text-muted)]">
          Open a shift to use price check.
        </div>
      ) : (
        <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] p-3">
          <div className="space-y-2">
            {rows.length === 0 ? (
              <div className="rounded-[1rem] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-3 py-8 text-center text-sm text-[var(--text-muted)]">
                {catalogQuery.isLoading ? "Loading products..." : "No matching products."}
              </div>
            ) : (
              rows.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[1rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{item.name}</div>
                    <div className="font-mono text-xs text-[var(--text-muted)]">
                      {item.barcode || item.sku}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-base font-semibold">{money(item.unitPrice)}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {item.inventoryItem
                        ? `${item.inventoryItem.currentStock.toFixed(2)} ${item.inventoryItem.unit}`
                        : "No stock"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
