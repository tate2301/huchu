"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import { Clock, History, Package, Payments } from "@/lib/icons";
import { getPosPortalHref } from "@/lib/retail/pos-host";
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
      fetchJson<{ data: SaleRow[] }>(
        `/api/v2/retail/pos/sales?scope=mine&limit=12`,
      ),
  });

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-4">
      <section className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Shift
            </div>
            <div className="mt-2 font-mono text-base font-semibold">
              {currentShift?.shiftNo ?? "Not open"}
            </div>
          </div>
          <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Register
            </div>
            <div className="mt-2 text-base font-semibold">
              {currentShift?.registerName ?? "No register"}
            </div>
          </div>
          <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Held carts
            </div>
            <div className="mt-2 font-mono text-base font-semibold">
              {heldCartsQuery.data?.data?.length ?? 0}
            </div>
          </div>
          <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Net sales
            </div>
            <div className="mt-2 font-mono text-base font-semibold">
              {money(currentShift?.netSalesValue ?? 0)}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] px-4 py-4">
        <div className="text-sm font-medium">Quick actions</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Button asChild variant="outline" className="min-h-14 justify-start">
            <Link href={getPosPortalHref("checkout", isPosHost)}>
              <Payments className="h-4 w-4" />
              Checkout
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-14 justify-start">
            <Link href={getPosPortalHref("held", isPosHost)}>
              <Package className="h-4 w-4" />
              Held carts
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-14 justify-start">
            <Link href={getPosPortalHref("history", isPosHost)}>
              <History className="h-4 w-4" />
              History
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-14 justify-start">
            <Link href={getPosPortalHref("shift", isPosHost)}>
              <Clock className="h-4 w-4" />
              Shift
            </Link>
          </Button>
        </div>
      </section>

      <section className="flex min-h-0 flex-col rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)]">
        <div className="shrink-0 px-4 py-3 text-sm font-medium">Recent activity</div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3">Sale no</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {(salesQuery.data?.data ?? []).slice(0, 8).map((sale) => (
                <tr key={sale.id} className="border-t border-[var(--border-subtle)]">
                  <td className="px-4 py-3 font-mono">{sale.saleNo}</td>
                  <td className="px-4 py-3">{sale.saleType}</td>
                  <td className="px-4 py-3">{sale.customerName ?? "Walk-in"}</td>
                  <td className="px-4 py-3 text-right font-mono">{money(sale.totalAmount)}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {new Date(sale.postedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
              {(salesQuery.data?.data ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-[var(--text-muted)]" colSpan={5}>
                    No transactions yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
