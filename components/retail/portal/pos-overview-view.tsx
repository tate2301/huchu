"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import { Clock, History, Package, Payments, Wallet } from "@/lib/icons";
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
        <div className="mb-3 inline-flex items-center gap-2 rounded-[0.85rem] bg-[var(--surface-muted)] px-3 py-2 text-sm font-semibold">
          <Payments className="h-5 w-5 text-[var(--text-muted)]" />
          POS snapshot
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-sm">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              <Clock className="h-3.5 w-3.5" />
              Shift
            </div>
            <div className="mt-2 font-mono text-base font-semibold">
              {currentShift?.shiftNo ?? "Not open"}
            </div>
          </div>
          <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-sm">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              <Payments className="h-3.5 w-3.5" />
              Register
            </div>
            <div className="mt-2 text-base font-semibold">
              {currentShift?.registerName ?? "No register"}
            </div>
          </div>
          <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-sm">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              <Package className="h-3.5 w-3.5" />
              Held carts
            </div>
            <div className="mt-2 font-mono text-base font-semibold">
              {heldCartsQuery.data?.data?.length ?? 0}
            </div>
          </div>
          <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-sm">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              <Wallet className="h-3.5 w-3.5" />
              Net sales
            </div>
            <div className="mt-2 font-mono text-base font-semibold">
              {money(currentShift?.netSalesValue ?? 0)}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] px-4 py-4">
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <History className="h-5 w-5 text-[var(--text-muted)]" />
          Quick actions
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Button asChild variant="outline" className="min-h-16 justify-start rounded-xl bg-[var(--surface-muted)] text-[15px]">
            <Link href={getPosPortalHref("checkout", isPosHost)}>
              <Payments className="h-5 w-5" />
              Checkout
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-16 justify-start rounded-xl bg-[var(--surface-muted)] text-[15px]">
            <Link href={getPosPortalHref("held", isPosHost)}>
              <Package className="h-5 w-5" />
              Held carts
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-16 justify-start rounded-xl bg-[var(--surface-muted)] text-[15px]">
            <Link href={getPosPortalHref("history", isPosHost)}>
              <History className="h-5 w-5" />
              History
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-16 justify-start rounded-xl bg-[var(--surface-muted)] text-[15px]">
            <Link href={getPosPortalHref("shift", isPosHost)}>
              <Clock className="h-5 w-5" />
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
