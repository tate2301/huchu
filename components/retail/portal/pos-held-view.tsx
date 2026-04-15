"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowRight, Clock, Package, ReceiptLong, RefreshCcw, User, Wallet } from "@/lib/icons";
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
import { cn } from "@/lib/utils";

/* ─── Elapsed time helper ─────────────────────────────────────────── */
function elapsedLabel(createdAt: string): { label: string; urgent: boolean } {
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return { label: "Just held", urgent: false };
  if (mins < 5) return { label: `${mins}m ago`, urgent: false };
  if (mins < 15) return { label: `${mins}m ago`, urgent: true };
  const hours = Math.floor(mins / 60);
  if (hours < 1) return { label: `${mins}m ago`, urgent: true };
  return { label: `${hours}h ${mins % 60}m ago`, urgent: true };
}

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

      {/* ── Header metrics ────────────────────────────────── */}
      <PosPanel>
        <PosPanelHeader
          eyebrow="Parked sales"
          title="Held carts"
          description="Recall any cart to instantly resume it at checkout."
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] })}
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <PosMetricCard
            icon={ReceiptLong}
            label="Held carts"
            value={String(heldCarts.length)}
            meta={heldCarts.length === 0 ? "Queue is clear" : "Waiting to be recalled"}
            tone={heldCarts.length > 0 ? "warning" : "neutral"}
          />
          <PosMetricCard
            icon={Clock}
            label="Active shift"
            value={currentShift?.shiftNo ?? "Not open"}
            meta={currentShift?.registerName ?? "Open a shift to park carts"}
            tone={currentShift ? "brand" : "warning"}
          />
        </div>
      </PosPanel>

      {/* ── Cart grid ─────────────────────────────────────── */}
      <PosPanel className="min-h-0">
        <div className="h-full min-h-0 overflow-y-auto pr-0.5">
          {!currentShift ? (
            <PosEmptyState
              icon={Clock}
              title="Open a shift first"
              description="Held carts are tied to the active register shift. Open a shift to see and recall parked sales."
            />
          ) : heldCartsQuery.isLoading ? (
            <div className="flex min-h-[10rem] items-center justify-center text-sm text-[var(--text-muted)]">
              Loading held carts…
            </div>
          ) : heldCarts.length === 0 ? (
            <PosEmptyState
              icon={ReceiptLong}
              title="No held carts"
              description="Use the Hold button at checkout to park a sale. It will appear here for quick recall."
            />
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {heldCarts.map((heldCart) => {
                const itemCount = heldCart.cartSnapshot.items?.length ?? 0;
                const total =
                  heldCart.cartSnapshot.items?.reduce(
                    (sum, item) =>
                      sum + item.quantity * item.unitPrice - (item.lineDiscountAmount ?? 0),
                    0,
                  ) ?? 0;
                const { label: timeLabel, urgent } = elapsedLabel(heldCart.createdAt);
                const isRecalling = recallMutation.isPending &&
                  recallMutation.variables?.id === heldCart.id;

                return (
                  <div
                    key={heldCart.id}
                    className="flex flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] overflow-hidden"
                  >
                    {/* Card header */}
                    <div className="flex items-start justify-between gap-3 bg-[var(--surface-base)] px-4 py-3.5 border-b border-[var(--border-subtle)]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-bold text-[var(--text-strong)]">
                            {heldCart.label || heldCart.holdNo}
                          </span>
                          {heldCart.label && (
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">
                              {heldCart.holdNo}
                            </span>
                          )}
                        </div>
                        <div className={cn(
                          "mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold",
                          urgent ? "text-amber-600" : "text-[var(--text-muted)]",
                        )}>
                          <Clock className="h-3 w-3" />
                          {timeLabel}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-xl font-black text-[var(--text-strong)]">
                          {money(total)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                          {itemCount} line{itemCount !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                    {/* Cart details */}
                    <div className="flex items-center gap-4 px-4 py-3">
                      <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-medium">
                          {heldCart.cartSnapshot.customerName || "Walk-in"}
                        </span>
                      </div>
                      {itemCount > 0 && (
                        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
                          <Package className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {heldCart.cartSnapshot.items?.slice(0, 2).map(i => i.name).join(", ")}
                            {(heldCart.cartSnapshot.items?.length ?? 0) > 2 && " …"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* CTA */}
                    <div className="px-4 pb-4 pt-1">
                      <Button
                        className="w-full h-11 gap-2 rounded-xl text-[14px] font-bold"
                        onClick={() => recallMutation.mutate(heldCart)}
                        disabled={recallMutation.isPending}
                      >
                        {isRecalling ? (
                          "Loading…"
                        ) : (
                          <>
                            Recall to checkout
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
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
