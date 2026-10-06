"use client";

/**
 * Held sales: this shift's, oldest first. Recall puts one back on the till,
 * asking once if a sale is already there; discard is the one thing here that
 * cannot be undone, so it asks.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { PauseCircle, PlayCircle, Trash, X } from "@/lib/icons";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { count, hhmm, usd } from "./format";
import { Empty, TillDialog } from "./parts";
import { heldTotal } from "./shell";
import { useTill } from "./state";
import type { HeldCart } from "./types";

function heldName(cart: HeldCart) {
  return cart.label || cart.cartSnapshot.customerName || "Walk-in";
}

function minutesAgo(at: string) {
  return Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60_000));
}

export function HeldScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { shiftHere, shiftLoading, cart, amountDue, replaceCartFromHeld, customerName, orderDiscountAmount, selectedPromotionId, clearCart, isPosHost } = useTill();
  const [recalling, setRecalling] = React.useState<HeldCart | null>(null);
  const [discarding, setDiscarding] = React.useState<HeldCart | null>(null);

  const query = useQuery({
    queryKey: ["retail-held-carts", shiftHere?.id ?? null],
    enabled: Boolean(shiftHere?.id),
    queryFn: () => fetchJson<{ data: HeldCart[] }>(`/api/v2/retail/pos/held-carts?shiftId=${encodeURIComponent(shiftHere?.id ?? "")}`),
  });
  const held = [...(query.data?.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const total = held.reduce((sum, entry) => sum + heldTotal(entry), 0);

  const recall = useMutation({
    mutationFn: async ({ entry, holdCurrent }: { entry: HeldCart; holdCurrent: boolean }) => {
      if (holdCurrent) {
        await fetchJson("/api/v2/retail/pos/held-carts", {
          method: "POST",
          body: JSON.stringify({
            shiftId: shiftHere?.id,
            label: customerName || undefined,
            cartSnapshot: { items: cart, customerName, orderDiscountAmount, selectedPromotionId },
          }),
        });
        clearCart();
      }
      await fetchJson(`/api/v2/retail/pos/held-carts/${entry.id}/recall`, { method: "POST" });
      return entry;
    },
    onSuccess: (entry) => {
      const customer = entry.cartSnapshot.customerName || null;
      replaceCartFromHeld({
        ...entry.cartSnapshot,
        heldAs: [entry.holdNo, customer, entry.label && entry.label !== customer ? entry.label : null].filter(Boolean).join(", "),
      });
      setRecalling(null);
      void queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
      router.push(getPosPortalHref("checkout", isPosHost));
    },
    onError: (error) => {
      // Recalled or discarded elsewhere since the list loaded: the list catches up.
      void queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
      toast({ title: "That sale was not recalled", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const discard = useMutation({
    mutationFn: (entry: HeldCart) => fetchJson(`/api/v2/retail/pos/held-carts/${entry.id}/discard`, { method: "POST" }),
    onSuccess: () => {
      setDiscarding(null);
      void queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
    },
    onError: (error) => {
      setDiscarding(null);
      void queryClient.invalidateQueries({ queryKey: ["retail-held-carts"] });
      toast({ title: "That sale was not discarded", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const startRecall = (entry: HeldCart) => {
    if (cart.length) setRecalling(entry);
    else recall.mutate({ entry, holdCurrent: false });
  };

  const oldest = held[0];
  return (
    <div className="main is-fixed">
      <div className="bar">
        <h1>Held sales</h1>
        <div className="end">
          <span className="note">
            This shift’s. A held sale ends with the shift.
          </span>
        </div>
      </div>
      {shiftLoading || query.isLoading ? (
        <div className="finding" aria-busy="true">
          <span className="skeleton is-lede" />
        </div>
      ) : !shiftHere ? (
        <Empty icon={PauseCircle} title="No shift is open here">
          Held sales belong to a shift. Open one on the till first.
        </Empty>
      ) : query.isError ? (
        <Empty icon={PauseCircle} title="Held sales did not load">
          {getApiErrorMessage(query.error)}
        </Empty>
      ) : !held.length ? (
        <Empty icon={PauseCircle} title="Nothing is held">
          Hold a sale from the till when someone steps away to fetch money. It waits here until this shift closes.
        </Empty>
      ) : (
        <div className="table-shell">
          <div className="table-scroll">
            <div className="finding">
              <p className="lede-figure">
                {count(held.length, "sale")} waiting, <span className="num">{usd(total)}</span>.{" "}
                {oldest ? <span className="q">The oldest has waited {count(minutesAgo(oldest.createdAt), "minute")}.</span> : null}
              </p>
            </div>
            <section aria-labelledby="held-waiting">
              <div className="group-head">
                <h2 id="held-waiting">Waiting</h2>
                <span className="sum">
                  {count(held.length, "sale")} · {usd(total)}
                </span>
              </div>
              <div className="list">
                {held.map((entry) => {
                  const items = entry.cartSnapshot.items ?? [];
                  return (
                    <div
                      key={entry.id}
                      className="row is-held"
                    >
                      <span className="code num text-left">
                        {entry.holdNo}
                      </span>
                      <span className="truncate">
                        <span className="ink">{heldName(entry)}</span>{" "}
                        <span className="muted">{count(items.length, "item")}</span>
                      </span>
                      <span className="muted num text-left">
                        {hhmm(entry.createdAt)} · {minutesAgo(entry.createdAt)} min
                      </span>
                      <span className="num ink">
                        {usd(heldTotal(entry))}
                      </span>
                      <span className="end-cell">
                        <div className="btn-group" role="group" aria-label={entry.holdNo}>
                          <button
                            type="button"
                            className="btn"
                            disabled={recall.isPending}
                            aria-label={`Recall ${entry.holdNo}`}
                            aria-busy={(recall.isPending && recall.variables?.entry.id === entry.id) || undefined}
                            onClick={() => startRecall(entry)}
                          >
                            <PlayCircle className="ic" />
                            Recall
                          </button>
                          <button type="button" className="btn btn-icon" aria-label={`Discard ${entry.holdNo}`} onClick={() => setDiscarding(entry)}>
                            <Trash className="ic" />
                          </button>
                        </div>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
          <div className="table-foot">
            <div className="foot-row">
              <span className="num text-left">
                1 to {held.length} of {held.length}
              </span>
              <span className="foot-sum">
                Held <b>{usd(total)}</b>
              </span>
            </div>
          </div>
        </div>
      )}

      <TillDialog
        open={Boolean(recalling)}
        onOpenChange={(open) => !open && setRecalling(null)}
        title="Put this sale aside first?"
        description={
          recalling
            ? `The till has a sale on it: ${count(cart.length, "item")}, ${usd(amountDue)}. Recalling “${heldName(recalling)}” would replace it.`
            : undefined
        }
        foot={
          <>
            <button type="button" className="btn" onClick={() => setRecalling(null)}>
              <X className="ic" />
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={recall.isPending}
              aria-busy={recall.isPending || undefined}
              onClick={() => recalling && recall.mutate({ entry: recalling, holdCurrent: true })}
            >
              <PauseCircle className="ic" />
              Hold it and recall
            </button>
          </>
        }
      />

      <TillDialog
        open={Boolean(discarding)}
        onOpenChange={(open) => !open && setDiscarding(null)}
        title={discarding ? `Discard ${discarding.holdNo}?` : "Discard"}
        description={
          discarding
            ? `“${heldName(discarding)}”: ${count((discarding.cartSnapshot.items ?? []).length, "item")}, ${usd(heldTotal(discarding))}. Nothing was paid and no stock moved. It cannot be brought back.`
            : undefined
        }
        foot={
          <>
            <button type="button" className="btn" onClick={() => setDiscarding(null)}>
              <X className="ic" />
              Keep the sale
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={discard.isPending}
              aria-busy={discard.isPending || undefined}
              onClick={() => discarding && discard.mutate(discarding)}
            >
              <Trash className="ic" />
              Discard {discarding?.holdNo}
            </button>
          </>
        }
      />
    </div>
  );
}
