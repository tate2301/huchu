"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Package, RefreshCcw } from "@/lib/icons";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { usePosPortalState } from "./pos-portal-state";
import type { HeldCart } from "./pos-types";

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

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2.5">
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <Package className="h-5 w-5 text-[var(--text-muted)]" />
          Held carts
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          {heldCartsQuery.data?.data?.length ?? 0} waiting
        </div>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] })}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="min-h-0 rounded-[1rem] border border-[var(--border)] bg-[var(--surface-base)] p-3">
        <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
          {(heldCartsQuery.data?.data ?? []).length === 0 ? (
            <div className="rounded-[1rem] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-3 py-10 text-center text-sm text-[var(--text-muted)]">
              {heldCartsQuery.isLoading ? "Loading held carts..." : "No held carts for this shift."}
            </div>
          ) : (
            (heldCartsQuery.data?.data ?? []).map((heldCart) => (
              <div
                key={heldCart.id}
                className="flex items-center justify-between gap-3 rounded-[1rem] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3"
              >
                <div className="min-w-0">
                  <div className="font-medium">{heldCart.label || heldCart.holdNo}</div>
                  <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                    {heldCart.holdNo}
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {(heldCart.cartSnapshot.items?.length ?? 0)} lines -{" "}
                    {new Date(heldCart.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="min-h-11 min-w-20"
                  onClick={() => recallMutation.mutate(heldCart)}
                  disabled={recallMutation.isPending}
                >
                  Recall
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
