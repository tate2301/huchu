"use client";

/**
 * Held sales: this shift's, the latest first. Pick one to see its lines beside
 * the list; Recall (R) puts it back on the till, asking once if a sale is
 * already there. Discard is the one thing here that cannot be undone, so it asks.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowBendUpLeft, PauseCircle, Trash } from "@/lib/icons";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { count, hhmm, MEASURES, qty, usd } from "./format";
import { Empty, LoadFailed, TillDialog, useWindowKeys } from "./parts";
import { heldTotal } from "./shell";
import { useTill } from "./state";
import type { CartItem, HeldCart } from "./types";

function heldName(cart: HeldCart) {
  return cart.label || cart.cartSnapshot.customerName || "Walk-in";
}

const lineAmount = (item: CartItem) => Math.max(item.unitPrice * item.quantity - (item.lineDiscountAmount ?? 0), 0);

/** Items as the sale column counts them: a weighed line is one. */
const itemCount = (items: readonly CartItem[]) => items.reduce((sum, item) => sum + (Number.isInteger(item.quantity) ? item.quantity : 1), 0);

/** The VAT in a held sale: each line's share of the total after the sale's discount, at its own rate. */
function heldVat(cart: HeldCart) {
  const items = cart.cartSnapshot.items ?? [];
  const goods = items.reduce((sum, item) => sum + lineAmount(item), 0);
  const share = goods > 0 ? heldTotal(cart) / goods : 0;
  return items.reduce((sum, item) => {
    const amount = lineAmount(item) * share;
    const rate = (Number(item.taxPercent) || 0) / 100;
    return sum + (item.taxInclusive === false ? amount * rate : (amount * rate) / (1 + rate));
  }, 0);
}

/** The sale on the till, as the recall question names it: its customer, its one product, or its amount. */
function saleOnTill(cart: readonly CartItem[], customerName: string, amountDue: number) {
  if (customerName) return `${customerName}’s sale`;
  if (cart.length === 1) return `the ${cart[0].name} sale`;
  return `the ${usd(amountDue)} sale`;
}

function inField(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
}

function HeldLine({ item }: { item: CartItem }) {
  const unit = item.unit?.trim().toLowerCase();
  const measured = Boolean(unit && MEASURES.has(unit));
  const each = measured ? `${qty(item.quantity)} ${unit} · ${usd(item.unitPrice)} a ${unit}` : `${usd(item.unitPrice)} each`;
  const off = item.lineDiscountAmount > 0 ? ` · ${usd(item.lineDiscountAmount)} off` : "";
  return (
    <div className="held-line">
      <span className="held-line-q">{qty(item.quantity)} ×</span>
      <span className="held-line-n">
        <span className="held-line-t">{item.name}</span>
        <span className="held-line-s">
          {each}
          {off}
        </span>
      </span>
      <span className="held-line-v">{usd(lineAmount(item))}</span>
    </div>
  );
}

export function HeldScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { shiftHere, shiftLoading, cart, amountDue, replaceCartFromHeld, customerName, orderDiscountAmount, clearCart, isPosHost } = useTill();
  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const [recalling, setRecalling] = React.useState<HeldCart | null>(null);
  // Named when asked: holding it empties the till before the recall lands, and the question stays put.
  const [onTill, setOnTill] = React.useState("");
  const [discarding, setDiscarding] = React.useState<HeldCart | null>(null);

  const query = useQuery({
    queryKey: ["retail-held-carts", shiftHere?.id ?? null],
    enabled: Boolean(shiftHere?.id),
    queryFn: () => fetchJson<{ data: HeldCart[] }>(`/api/v2/retail/pos/held-carts?shiftId=${encodeURIComponent(shiftHere?.id ?? "")}`),
  });
  const held = [...(query.data?.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const chosen = held.find((entry) => entry.id === chosenId) ?? held[0] ?? null;

  const recall = useMutation({
    mutationFn: async ({ entry, holdCurrent }: { entry: HeldCart; holdCurrent: boolean }) => {
      if (holdCurrent) {
        await fetchJson("/api/v2/retail/pos/held-carts", {
          method: "POST",
          body: JSON.stringify({
            shiftId: shiftHere?.id,
            label: customerName || undefined,
            cartSnapshot: { items: cart, customerName, orderDiscountAmount },
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
    if (recall.isPending) return;
    if (cart.length) {
      setOnTill(saleOnTill(cart, customerName, amountDue));
      setRecalling(entry);
    } else recall.mutate({ entry, holdCurrent: false });
  };

  // R recalls the chosen sale, ↑ and ↓ choose; Enter answers the recall question.
  useWindowKeys((event) => {
    if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (recalling) {
      if (event.key === "Enter" && !recall.isPending) {
        event.preventDefault();
        recall.mutate({ entry: recalling, holdCurrent: true });
      }
      return;
    }
    if (discarding || inField(event.target) || !chosen) return;
    if (event.key.toLowerCase() === "r" && !event.repeat) {
      event.preventDefault();
      startRecall(chosen);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const at = held.indexOf(chosen) + (event.key === "ArrowDown" ? 1 : -1);
      const next = held[Math.min(Math.max(at, 0), held.length - 1)];
      if (next) setChosenId(next.id);
    }
  });

  const items = chosen?.cartSnapshot.items ?? [];
  const exclusive = items.some((item) => item.taxInclusive === false && Number(item.taxPercent) > 0);

  return (
    <div className="held-bench">
      <main className="main held-shelf">
        <h1 className="held-h1">Held</h1>
        {shiftLoading || query.isLoading ? (
          <div className="held-list" aria-busy="true">
            <span className="skeleton held-skeleton" />
            <span className="skeleton held-skeleton" />
          </div>
        ) : !shiftHere ? (
          <Empty icon={PauseCircle} title="No shift is open here" />
        ) : query.isError ? (
          <LoadFailed icon={PauseCircle} title="Held sales did not load" error={query.error} onRetry={() => void query.refetch()} />
        ) : !held.length ? (
          <Empty icon={PauseCircle} title="Nothing is held" />
        ) : (
          <ul className="held-list" aria-label="Held sales">
            {held.map((entry) => {
              const lines = entry.cartSnapshot.items ?? [];
              const on = entry.id === chosen?.id;
              return (
                <li key={entry.id} className={`held-row${on ? " is-on" : ""}`}>
                  <button type="button" className="held-pick" aria-pressed={on} onClick={() => setChosenId(entry.id)}>
                    <span className="held-glyph">
                      <PauseCircle className="ic" />
                    </span>
                    <span className="held-text">
                      <span className="held-note">{heldName(entry)}</span>
                      <span className="held-sub">
                        {count(lines.length, "line")} · <time dateTime={entry.createdAt}>{hhmm(entry.createdAt)}</time>
                      </span>
                    </span>
                    <span className="held-amount">{usd(heldTotal(entry))}</span>
                  </button>
                  <button type="button" className="btn btn-icon is-touch" aria-label={`Discard ${heldName(entry)}`} onClick={() => setDiscarding(entry)}>
                    <Trash className="ic" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <aside className="bench-side held-side" aria-label="Held sale">
        {chosen ? (
          <>
            <div className="held-head">
              <h2>{chosen.cartSnapshot.customerName || heldName(chosen)}</h2>
              <time dateTime={chosen.createdAt}>{hhmm(chosen.createdAt)}</time>
            </div>
            <div className="list held-lines">
              {items.map((item) => (
                <HeldLine key={item.id} item={item} />
              ))}
            </div>
            <div className="totals">
              <div className="l sum">
                <span>{count(itemCount(items), "item")}</span>
                <span>
                  VAT {usd(heldVat(chosen))}
                  {exclusive ? " added" : null}
                </span>
              </div>
              <button
                type="button"
                className="take-key held-recall"
                disabled={recall.isPending}
                aria-busy={(recall.isPending && !recalling) || undefined}
                onClick={() => startRecall(chosen)}
              >
                <ArrowBendUpLeft className="ic" />
                Recall
                <span className="num">{usd(heldTotal(chosen))}</span>
                <span className="kbd on-primary">R</span>
              </button>
            </div>
          </>
        ) : null}
      </aside>

      <TillDialog
        open={Boolean(recalling)}
        onOpenChange={(open) => !open && setRecalling(null)}
        title={`Hold ${onTill} first?`}
        foot={
          <>
            <button type="button" className="btn" onClick={() => setRecalling(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={recall.isPending}
              aria-busy={recall.isPending || undefined}
              onClick={() => recalling && recall.mutate({ entry: recalling, holdCurrent: true })}
            >
              Hold it and recall
              <span className="kbd on-primary">↵</span>
            </button>
          </>
        }
      />

      <TillDialog
        open={Boolean(discarding)}
        onOpenChange={(open) => !open && setDiscarding(null)}
        title="Discard this held sale?"
        description={
          discarding
            ? `${heldName(discarding)} · ${count((discarding.cartSnapshot.items ?? []).length, "line")} · ${usd(heldTotal(discarding))}`
            : undefined
        }
        foot={
          <>
            <button type="button" className="btn" onClick={() => setDiscarding(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={discard.isPending}
              aria-busy={discard.isPending || undefined}
              onClick={() => discarding && discard.mutate(discarding)}
            >
              <Trash className="ic" />
              Discard
            </button>
          </>
        }
      />
    </div>
  );
}
