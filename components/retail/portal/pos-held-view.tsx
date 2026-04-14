"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Clock, Package, ReceiptLong, RefreshCcw, Wallet } from "@/lib/icons";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import {
  PosEmptyState,
  PosMetricCard,
  PosPanel,
  PosPanelHeader,
  PosStatusPill,
} from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import type { HeldCart } from "./pos-types";
import { money } from "./pos-utils";

export function PosHeldView() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentShift, replaceCartFromHeld, isPosHost } = usePosPortalState();

  const heldCartsQuery = useQuery({
    queryKey: ["retail-held-carts", currentShift?.id],
    queryFn: () =>
      fetchJson<{ data: HeldCart[] }>(
        `/api/v2/retail/pos/held-carts?shiftId=${encodeURIComponent(currentShift?.id ?? "")}`,
      ),
    enabled: Boolean(currentShift?.id),
  });

  const recallMutation = useMutation({
    mutationFn: async (heldCart: HeldCart) => {
      const recalled = await fetchJson<{ data: HeldCart }>(
        `/api/v2/retail/pos/held-carts/${heldCart.id}/recall`,
        { method: "POST" },
      );
      return { heldCart, recalled: recalled.data };
    },
    onSuccess: ({ heldCart }) => {
      replaceCartFromHeld(heldCart.cartSnapshot);
      queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
      router.push(getPosPortalHref("checkout", isPosHost));
    },
    onError: (error) =>
      toast({
        title: "Unable to recall cart",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const heldCarts = heldCartsQuery.data?.data ?? [];

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <PosPanel>
        <PosPanelHeader
          eyebrow="Held queue"
          title="Resume parked sales quickly"
          description="Held carts should feel like a short pause in checkout, not a separate workflow."
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] })
              }
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          }
        />
        <div className="grid gap-3 md:grid-cols-3">
          <PosMetricCard
            icon={ReceiptLong}
            label="Held carts"
            value={String(heldCarts.length)}
            meta="Waiting to be recalled"
            tone={heldCarts.length > 0 ? "warning" : "neutral"}
          />
          <PosMetricCard
            icon={Clock}
            label="Shift"
            value={currentShift?.shiftNo ?? "Not open"}
            meta={currentShift?.registerName ?? "Open a shift to park carts"}
            tone={currentShift ? "brand" : "warning"}
          />
          <PosMetricCard
            icon={Package}
            label="Checkout"
            value="Return fast"
            meta="Recalling a cart should put the cashier back in the active sale lane."
            tone="success"
          />
        </div>
      </PosPanel>

      <PosPanel className="min-h-0">
        <PosPanelHeader
          eyebrow="Queue"
          title="Held carts"
          description="Strong labels, timestamps, totals, and one obvious recall action."
        />

        <div className="h-full min-h-0 overflow-y-auto pr-1">
          {!currentShift ? (
            <PosEmptyState
              icon={Clock}
              title="Open a shift to use held carts"
              description="Held carts are tied to the active register shift, so this queue stays closed until the drawer is open."
            />
          ) : heldCarts.length === 0 ? (
            <PosEmptyState
              icon={ReceiptLong}
              title="No held carts for this shift"
              description={
                heldCartsQuery.isLoading
                  ? "Loading the queue now."
                  : "Once a cashier parks a sale, it will appear here for quick recall."
              }
            />
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {heldCarts.map((heldCart) => {
                const itemCount = heldCart.cartSnapshot.items?.length ?? 0;
                const total =
                  heldCart.cartSnapshot.items?.reduce(
                    (sum, item) =>
                      sum +
                      item.quantity * item.unitPrice -
                      (item.lineDiscountAmount ?? 0),
                    0,
                  ) ?? 0;

                return (
                  <div
                    key={heldCart.id}
                    className="rounded-[1.35rem] border border-[var(--border-default)] bg-[var(--surface-muted)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-base font-semibold text-[var(--text-strong)]">
                            {heldCart.label || heldCart.holdNo}
                          </div>
                          <PosStatusPill tone="warning">Held</PosStatusPill>
                        </div>
                        <div className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                          {heldCart.holdNo}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-lg font-semibold text-[var(--text-strong)]">
                          {money(total)}
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">
                          {itemCount} line{itemCount === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[1rem] border border-[var(--border-subtle)] bg-white/80 px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          Customer
                        </div>
                        <div className="mt-2 truncate text-sm font-medium text-[var(--text-strong)]">
                          {heldCart.cartSnapshot.customerName || "Walk-in"}
                        </div>
                      </div>
                      <div className="rounded-[1rem] border border-[var(--border-subtle)] bg-white/80 px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          Held at
                        </div>
                        <div className="mt-2 text-sm font-medium text-[var(--text-strong)]">
                          {new Date(heldCart.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <div className="rounded-[1rem] border border-[var(--border-subtle)] bg-white/80 px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          Value
                        </div>
                        <div className="mt-2 font-mono text-sm font-semibold text-[var(--text-strong)]">
                          {money(total)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <Wallet className="h-4 w-4" />
                        Recalling drops this cart back into checkout immediately.
                      </div>
                      <Button
                        className="min-h-11"
                        onClick={() => recallMutation.mutate(heldCart)}
                        disabled={recallMutation.isPending}
                      >
                        Recall cart
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PosPanel>
    </div>
  );
}
