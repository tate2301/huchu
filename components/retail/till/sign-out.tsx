"use client";

/**
 * Signing out: the person leaves the till; the shift and the sale stay.
 *
 * With a sale on the till it asks once, and holding it is the first answer, so
 * anyone can recall it from Held. The till then goes back to "Who is selling?",
 * which says who signed out and what they left open. The shift is not closed by
 * signing out: the same PIN carries on, and Shift is where it closes.
 */

import * as React from "react";
import { signOut, useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { PauseCircle, Trash, X } from "@/lib/icons";
import { count, usd } from "./format";
import { ErrorLine, TillDialog } from "./parts";
import { useTill } from "./state";

/** Read once by "Who is selling?" after the session ends, then forgotten. */
export const SIGNED_OUT_NOTE_KEY = "till_signed_out";

export type SignedOutNote = {
  userId: string | null;
  name: string;
  at: string;
  shiftNo: string | null;
  till: string | null;
  held: number;
  /** Where "Who is selling?" opens: on the list, or on this person's password. */
  next: "who" | "password";
};

type SignOutOptions = { next?: SignedOutNote["next"] };
type SignOutValue = { requestSignOut: (options?: SignOutOptions) => void };
const SignOutContext = React.createContext<SignOutValue | null>(null);

export function useSignOut() {
  const context = React.useContext(SignOutContext);
  if (!context) throw new Error("useSignOut must be used within TillSignOutProvider");
  return context;
}

export function TillSignOutProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { cart, amountDue, customerName, orderDiscountAmount, selectedPromotionId, shiftHere, context, isPosHost, clearCart } = useTill();
  const [asking, setAsking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [next, setNext] = React.useState<SignedOutNote["next"]>("who");

  const leave = React.useCallback(
    async (heldNow: boolean, next: SignedOutNote["next"]) => {
      const held = (queryClient.getQueriesData<{ data: unknown[] }>({ queryKey: ["retail-held-carts"] })[0]?.[1]?.data.length ?? 0) + (heldNow ? 1 : 0);
      const note: SignedOutNote = {
        userId: session?.user?.id ?? null,
        name: session?.user?.name ?? "Someone",
        at: new Date().toISOString(),
        shiftNo: shiftHere?.shiftNo ?? null,
        till: context?.till.name ?? null,
        held,
        next,
      };
      try {
        window.sessionStorage.setItem(SIGNED_OUT_NOTE_KEY, JSON.stringify(note));
      } catch {
        // A note that cannot be kept is only a missing sentence on the next screen.
      }
      // "Who is selling?": on the POS host the proxy shows it at a signed-out `/`.
      await signOut({ redirect: true, callbackUrl: isPosHost ? "/" : "/portal/pos/who" });
    },
    [context?.till.name, isPosHost, queryClient, session?.user?.id, session?.user?.name, shiftHere?.shiftNo],
  );

  const requestSignOut = React.useCallback(
    (options?: SignOutOptions) => {
      const then = options?.next ?? "who";
      if (cart.length) {
        setNext(then);
        setProblem(null);
        setAsking(true);
        return;
      }
      void leave(false, then);
    },
    [cart.length, leave],
  );

  const holdAndLeave = async () => {
    setBusy(true);
    try {
      await fetchJson("/api/v2/retail/pos/held-carts", {
        method: "POST",
        body: JSON.stringify({
          shiftId: shiftHere?.id,
          label: customerName || undefined,
          cartSnapshot: { items: cart, customerName, orderDiscountAmount, selectedPromotionId },
        }),
      });
    } catch (error) {
      setBusy(false);
      setProblem(`The sale was not held, so nothing has changed. ${getApiErrorMessage(error)}`);
      return;
    }
    clearCart();
    try {
      await leave(true, next);
    } finally {
      // Signing out leaves the page; if it does not, the dialog answers again.
      setBusy(false);
    }
  };

  const items = cart.length;
  return (
    <SignOutContext.Provider value={{ requestSignOut }}>
      {children}
      <TillDialog
        open={asking}
        onOpenChange={(open) => !busy && setAsking(open)}
        title="Sign out with a sale on the till?"
        description={`${count(items, "item")}, ${usd(amountDue)}${customerName ? `, with ${customerName} on it` : ""}. Held, anyone at the till can recall it from Held; signed out without it, it is gone.`}
        foot={
          <>
            <button type="button" className="btn" disabled={busy} onClick={() => setAsking(false)}>
              <X className="ic" />
              Stay signed in
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                clearCart();
                void leave(false, next);
              }}
            >
              <Trash className="ic" />
              Sign out without it
            </button>
            {/* Held sales hang off the shift: with none open here, there is nothing to hold it on. */}
            {shiftHere ? (
              <button type="button" className="btn btn-primary" aria-busy={busy || undefined} disabled={busy} onClick={() => void holdAndLeave()}>
                <PauseCircle className="ic" />
                Hold it and sign out
              </button>
            ) : null}
          </>
        }
      >
        {shiftHere ? (
          <p className="note">
            Shift <span className="num">{shiftHere.shiftNo}</span> stays open on {context?.till.name ?? "this till"}. The PIN carries on where
            it stopped; Shift is where it closes.
          </p>
        ) : null}
        {problem ? <ErrorLine>{problem}</ErrorLine> : null}
      </TillDialog>
    </SignOutContext.Provider>
  );
}
