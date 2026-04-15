"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import { BarChart3, Clock, History, Package, Payments, Wallet } from "@/lib/icons";
import { getPosPortalHref } from "@/lib/retail/pos-host";
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
import { cn } from "@/lib/utils";

/* ── Sale type style helpers ──────────────────────────────────────── */
function saleTypeTone(saleType: string): "success" | "danger" | "warning" | "neutral" {
  if (saleType === "SALE") return "success";
  if (saleType === "REFUND") return "danger";
  if (saleType === "VOID") return "warning";
  return "neutral";
}

export function PosOverviewView() {
  const { currentShift, isPosHost } = usePosPortalState();

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
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-4">

      {/* ── Shift & metrics ───────────────────────────────── */}
      <PosPanel>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Operational snapshot
            </p>
            <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.03em] text-[var(--text-strong)]">
              {currentShift
                ? `Shift ${currentShift.shiftNo} · ${currentShift.registerName}`
                : "No active shift"}
            </h2>
            {currentShift?.site?.name && (
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">{currentShift.site.name}</p>
            )}
          </div>
          <PosStatusPill tone={currentShift ? "success" : "warning"}>
            {currentShift ? "Shift open" : "Shift closed"}
          </PosStatusPill>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PosMetricCard
            icon={Wallet}
            label="Net sales"
            value={money(currentShift?.netSalesValue ?? 0)}
            meta={`${currentShift?.saleCount ?? 0} transaction${(currentShift?.saleCount ?? 0) !== 1 ? "s" : ""}`}
            tone={currentShift ? "success" : "neutral"}
          />
          <PosMetricCard
            icon={Payments}
            label="Cash sales"
            value={money(currentShift?.cashSales ?? 0)}
            meta="Cash tendered this shift"
            tone="brand"
          />
          <PosMetricCard
            icon={Package}
            label="Held carts"
            value={String(heldCount)}
            meta={heldCount > 0 ? "Parked sales waiting" : "No carts on hold"}
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

      {/* ── Quick actions ──────────────────────────────────── */}
      <PosPanel>
        <PosPanelHeader
          eyebrow="Navigate"
          title="Quick actions"
          className="mb-3"
        />
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href={getPosPortalHref("checkout", isPosHost)}
            className="group flex items-center gap-3.5 rounded-2xl border border-[color-mix(in_srgb,var(--action-primary-bg)_35%,var(--border-default))] bg-[color-mix(in_srgb,var(--action-primary-bg)_5%,var(--surface-base))] px-4 py-3.5 transition-all hover:border-[var(--action-primary-bg)] hover:bg-[color-mix(in_srgb,var(--action-primary-bg)_9%,var(--surface-base))] hover:shadow-[0_4px_14px_rgba(0,0,0,0.07)]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--action-primary-bg)] text-white shadow-[0_4px_10px_rgba(0,0,0,0.15)]">
              <Payments className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-[var(--text-strong)]">Checkout</div>
              <div className="text-[11px] text-[var(--text-muted)]">Start a new sale</div>
            </div>
          </Link>

          <Link
            href={getPosPortalHref("held", isPosHost)}
            className={cn(
              "group flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 transition-all hover:shadow-[0_4px_14px_rgba(0,0,0,0.07)]",
              heldCount > 0
                ? "border-amber-300 bg-amber-50 hover:border-amber-400 hover:bg-amber-50"
                : "border-[var(--border-default)] bg-[var(--surface-muted)] hover:border-[color-mix(in_srgb,var(--action-primary-bg)_35%,var(--border-default))] hover:bg-[var(--surface-base)]",
            )}
          >
            <div className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_4px_10px_rgba(0,0,0,0.12)]",
              heldCount > 0 ? "bg-amber-500" : "bg-[var(--text-muted)]",
            )}>
              <Package className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-[var(--text-strong)]">
                Held{heldCount > 0 ? ` (${heldCount})` : ""}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {heldCount > 0 ? "Recall a parked sale" : "No carts on hold"}
              </div>
            </div>
          </Link>

          <Link
            href={getPosPortalHref("history", isPosHost)}
            className="group flex items-center gap-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-3.5 transition-all hover:border-[color-mix(in_srgb,var(--action-primary-bg)_35%,var(--border-default))] hover:bg-[var(--surface-base)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.07)]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-500 text-white shadow-[0_4px_10px_rgba(0,0,0,0.12)]">
              <History className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-[var(--text-strong)]">History</div>
              <div className="text-[11px] text-[var(--text-muted)]">Receipts & refunds</div>
            </div>
          </Link>

          <Link
            href={getPosPortalHref("shift", isPosHost)}
            className="group flex items-center gap-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-4 py-3.5 transition-all hover:border-[color-mix(in_srgb,var(--action-primary-bg)_35%,var(--border-default))] hover:bg-[var(--surface-base)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.07)]"
          >
            <div className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_4px_10px_rgba(0,0,0,0.12)]",
              currentShift ? "bg-emerald-500" : "bg-amber-500",
            )}>
              <Clock className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-[var(--text-strong)]">Shift</div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {currentShift ? "Open · manage drawer" : "Open the drawer"}
              </div>
            </div>
          </Link>
        </div>
      </PosPanel>

      {/* ── Recent sales ──────────────────────────────────── */}
      <PosPanel className="min-h-0">
        <PosPanelHeader
          eyebrow="Recent activity"
          title="Latest receipts"
          description="Most recent transactions for this session."
        />

        <div className="h-full min-h-0 overflow-auto">
          {recentSales.length === 0 ? (
            <PosEmptyState
              icon={History}
              title="No transactions yet"
              description="Receipt activity will appear here once you start posting sales."
            />
          ) : (
            <table className="w-full min-w-[600px] text-sm">
              <thead className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface-base)] text-left text-[10px] uppercase tracking-[0.13em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2.5">Receipt</th>
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
                    className="group transition-colors hover:bg-[var(--surface-muted)]"
                  >
                    <td className="px-3 py-3.5 font-mono text-[13px] font-bold text-[var(--text-strong)]">
                      {sale.saleNo}
                    </td>
                    <td className="px-3 py-3.5">
                      <PosStatusPill tone={saleTypeTone(sale.saleType)}>
                        {sale.saleType}
                      </PosStatusPill>
                    </td>
                    <td className="px-3 py-3.5 text-[var(--text-muted)]">
                      {sale.customerName ?? "Walk-in"}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-[13px] font-black text-[var(--text-strong)]">
                      {money(sale.totalAmount)}
                    </td>
                    <td className="px-3 py-3.5 text-xs text-[var(--text-muted)]">
                      {new Date(sale.postedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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
