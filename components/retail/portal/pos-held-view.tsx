"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowRight, Clock, Package, ReceiptLong, RefreshCcw, User } from "@/lib/icons";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import {
  PosEmptyState,
  PosPanel,
  PosPanelHeader,
  PosTerminalHeader,
} from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import type { HeldCart } from "./pos-types";
import { money } from "./pos-utils";

/* ─── Elapsed time helper ─────────────────────────────────────────── */
function elapsedLabel(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just held";
  const hours = Math.floor(mins / 60);
  if (hours < 1) return `${mins}m ago`;
  return `${hours}h ${mins % 60}m ago`;
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
        title: "That sale was not recalled",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const heldCarts = heldCartsQuery.data?.data ?? [];

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)]">
      {/* ── Cart grid ─────────────────────────────────────── */}
      <PosPanel className="flex min-h-0 flex-col">
        <PosPanelHeader
          title={`${heldCarts.length} held sale${heldCarts.length === 1 ? "" : "s"}`}
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] })}
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh the list
            </Button>
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          {!currentShift ? (
            <PosEmptyState icon={Clock} title="Open a shift first" />
          ) : heldCartsQuery.isLoading ? (
            <div className="flex min-h-[10rem] items-center justify-center text-sm text-[var(--text-muted)]">
              Loading held sales…
            </div>
          ) : heldCarts.length === 0 ? (
            <PosEmptyState icon={ReceiptLong} title="No held sales yet" />
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
                const timeLabel = elapsedLabel(heldCart.createdAt);
                const isRecalling = recallMutation.isPending &&
                  recallMutation.variables?.id === heldCart.id;

                return (
                  <div
                    key={heldCart.id}
                    className="flex flex-col rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-base)] overflow-hidden"
                    style={{ boxShadow: "var(--shadow-card, 0 1px 3px rgba(15,23,42,0.06))" }}
                  >
                    {/* Dark instrument panel header */}
                    <PosTerminalHeader
                      eyebrow={`Hold · ${heldCart.holdNo}`}
                      title={heldCart.label || heldCart.holdNo}
                      subtitle={timeLabel}
                      valuePrimary={money(total)}
                      valueSecondary={`${itemCount} product${itemCount !== 1 ? "s" : ""}`}
                    />

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
                        className="w-full h-11 gap-2 rounded-xl text-[14px] font-bold active:translate-y-[2px] active:shadow-none"
                        style={{
                          background: "var(--pos-cta-bg)",
                          color: "var(--pos-cta-text)",
                          boxShadow: "0 3px 0 var(--pos-cta-shadow)",
                        }}
                        onClick={() => recallMutation.mutate(heldCart)}
                        disabled={recallMutation.isPending}
                      >
                        {isRecalling ? (
                          "Loading…"
                        ) : (
                          <>
                            Recall the sale
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
