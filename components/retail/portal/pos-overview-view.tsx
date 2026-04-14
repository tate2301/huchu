"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import { Clock, History, Package, Payments, Wallet } from "@/lib/icons";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import {
  PosEmptyState,
  PosMetricCard,
  PosPanel,
  PosPanelHeader,
} from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import type { HeldCart, SaleRow } from "./pos-types";
import { money } from "./pos-utils";

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

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-4">
      <PosPanel>
        <PosPanelHeader
          eyebrow="Operational snapshot"
          title="Overview"
          description="This stays lightweight. The real center of the product is checkout, and this page should only help operators get back there fast."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PosMetricCard
            icon={Clock}
            label="Shift"
            value={currentShift?.shiftNo ?? "Not open"}
            meta={currentShift?.registerName ?? "No active drawer"}
            tone={currentShift ? "brand" : "warning"}
          />
          <PosMetricCard
            icon={Package}
            label="Held carts"
            value={String(heldCartsQuery.data?.data?.length ?? 0)}
            meta="Parked sales waiting for recall"
            tone={(heldCartsQuery.data?.data?.length ?? 0) > 0 ? "warning" : "neutral"}
          />
          <PosMetricCard
            icon={Wallet}
            label="Net sales"
            value={money(currentShift?.netSalesValue ?? 0)}
            meta="Current shift performance"
            tone="success"
          />
          <PosMetricCard
            icon={Payments}
            label="Recent receipts"
            value={String(recentSales.length)}
            meta="Latest transaction activity"
            tone="neutral"
          />
        </div>
      </PosPanel>

      <PosPanel>
        <PosPanelHeader
          eyebrow="Launch points"
          title="Quick actions"
          description="These are support routes. They should never compete with checkout."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Button
            asChild
            variant="outline"
            className="min-h-16 justify-start rounded-[1rem] bg-[var(--surface-muted)] text-[15px]"
          >
            <Link href={getPosPortalHref("checkout", isPosHost)}>
              <Payments className="h-5 w-5" />
              Checkout
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="min-h-16 justify-start rounded-[1rem] bg-[var(--surface-muted)] text-[15px]"
          >
            <Link href={getPosPortalHref("held", isPosHost)}>
              <Package className="h-5 w-5" />
              Held carts
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="min-h-16 justify-start rounded-[1rem] bg-[var(--surface-muted)] text-[15px]"
          >
            <Link href={getPosPortalHref("history", isPosHost)}>
              <History className="h-5 w-5" />
              History
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="min-h-16 justify-start rounded-[1rem] bg-[var(--surface-muted)] text-[15px]"
          >
            <Link href={getPosPortalHref("shift", isPosHost)}>
              <Clock className="h-5 w-5" />
              Shift
            </Link>
          </Button>
        </div>
      </PosPanel>

      <PosPanel className="min-h-0">
        <PosPanelHeader
          eyebrow="Recent activity"
          title="Latest receipts"
          description="A compact ops snapshot for leads and follow-up, not a full transaction workspace."
        />

        <div className="h-full min-h-0 overflow-auto">
          {recentSales.length === 0 ? (
            <PosEmptyState
              icon={History}
              title="No transactions yet"
              description="Recent receipt activity will appear here once this cashier starts posting sales."
            />
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-[var(--border-subtle)] text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-3">Receipt</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3">Posted</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="border-b border-[var(--border-subtle)] bg-[var(--surface-base)]"
                  >
                    <td className="px-3 py-4 font-mono font-semibold text-[var(--text-strong)]">
                      {sale.saleNo}
                    </td>
                    <td className="px-3 py-4 text-[var(--text-strong)]">{sale.saleType}</td>
                    <td className="px-3 py-4 text-[var(--text-muted)]">
                      {sale.customerName ?? "Walk-in"}
                    </td>
                    <td className="px-3 py-4 text-right font-mono font-semibold text-[var(--text-strong)]">
                      {money(sale.totalAmount)}
                    </td>
                    <td className="px-3 py-4 text-[var(--text-muted)]">
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
