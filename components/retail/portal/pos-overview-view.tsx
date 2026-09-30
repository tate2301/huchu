"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import { BarChart3, History, Package, Payments, Wallet } from "@/lib/icons";
import { formatRetailTime, saleTypeLabel } from "@/lib/retail/words";
import {
  PosEmptyState,
  PosMetricCard,
  PosPanel,
  PosPanelHeader,
  PosStatusPill,
} from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import type { HeldCart, SaleRow } from "./pos-types";
import { money } from "./pos-utils";

/** A sale is the ordinary row and draws nothing; a refund or a void is the exception. */
function saleTypeTone(saleType: string): "danger" | "warning" {
  return saleType === "REFUND" ? "danger" : "warning";
}

export function PosOverviewView() {
  const { currentShift } = usePosPortalState();

  const heldCartsQuery = useQuery({
    queryKey: ["retail-held-carts", currentShift?.id],
    queryFn: () =>
      fetchJson<{ data: HeldCart[] }>(
        `/api/v2/retail/pos/held-carts?shiftId=${encodeURIComponent(currentShift?.id ?? "")}`,
      ),
    enabled: Boolean(currentShift?.id),
  });

  const salesQuery = useQuery({
    queryKey: ["retail-pos-sales-overview", currentShift?.id],
    queryFn: () =>
      fetchJson<{ data: SaleRow[] }>(`/api/v2/retail/pos/sales?scope=mine&limit=12`),
  });

  const recentSales = (salesQuery.data?.data ?? []).slice(0, 8);
  const heldCount = heldCartsQuery.data?.data?.length ?? 0;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">

      {/* ── Shift & metrics ───────────────────────────────── */}
      <PosPanel>
        <div className="mb-4">
          <h2 className="text-[1.3rem] font-bold tracking-[-0.025em] text-[var(--text-strong)]">
            {currentShift
              ? `Shift ${currentShift.shiftNo} · ${currentShift.registerName}`
              : "No shift open"}
          </h2>
          {currentShift?.site?.name && (
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">{currentShift.site.name}</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PosMetricCard
            icon={Wallet}
            label="Net sales"
            value={money(currentShift?.netSalesValue ?? 0)}
            meta={`${currentShift?.saleCount ?? 0} sale${(currentShift?.saleCount ?? 0) !== 1 ? "s" : ""}`}
            tone={currentShift ? "success" : "neutral"}
          />
          <PosMetricCard
            icon={Payments}
            label="Cash sales"
            value={money(currentShift?.cashSales ?? 0)}
            tone="brand"
          />
          <PosMetricCard
            icon={Package}
            label="Held sales"
            value={String(heldCount)}
            tone={heldCount > 0 ? "warning" : "neutral"}
          />
          <PosMetricCard
            icon={BarChart3}
            label="Refunds"
            value={money(currentShift?.refundValue ?? 0)}
            meta={`${currentShift?.refundCount ?? 0} refund${(currentShift?.refundCount ?? 0) !== 1 ? "s" : ""}`}
            tone={(currentShift?.refundCount ?? 0) > 0 ? "danger" : "neutral"}
          />
        </div>
      </PosPanel>

      {/* ── Recent sales ──────────────────────────────────── */}
      <PosPanel className="min-h-0">
        <PosPanelHeader title="Recent sales" />

        <div className="h-full min-h-0 overflow-auto">
          {recentSales.length === 0 ? (
            <PosEmptyState icon={History} title="No sales yet" />
          ) : (
            <table className="w-full min-w-[600px] text-sm">
              <thead
                className="sticky top-0 z-10 text-left text-xs"
                style={{ background: "var(--pos-amount-bg)", color: "rgba(240,249,255,0.7)" }}
              >
                <tr>
                  <th className="px-3 py-2.5">Sale</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {recentSales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="group transition-colors hover:bg-[var(--surface-canvas)]"
                  >
                    <td className="px-3 py-3.5 font-mono text-[13px] font-bold text-[var(--text-strong)]">
                      {sale.saleNo}
                    </td>
                    <td className="px-3 py-3.5">
                      {sale.saleType === "SALE" ? null : (
                        <PosStatusPill tone={saleTypeTone(sale.saleType)}>
                          {saleTypeLabel(sale.saleType)}
                        </PosStatusPill>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-[var(--text-muted)]">
                      {sale.customerName ?? "Walk-in"}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-[13px] font-black text-[var(--text-strong)]">
                      {money(sale.totalAmount)}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-xs text-[var(--text-muted)]">
                      {formatRetailTime(sale.postedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PosPanel>
    </div>
  );
}
