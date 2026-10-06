"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { dsConfirm } from "@/components/ui/ds-confirm";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { cashDropDue, cashDropSentence } from "@/lib/retail/till-on-device";

import { usePosTillLock } from "./pos-lock-screen";
import { usePosPortalState } from "./pos-portal-state";

/** Survives a reload, dies with the tab: the shift the till has already asked about. */
const ASKED_KEY = "retail_pos_cash_drop_asked";

function readAsked(): string | null {
  try {
    return window.sessionStorage.getItem(ASKED_KEY);
  } catch {
    return null;
  }
}

function writeAsked(shiftId: string | null) {
  try {
    if (shiftId) window.sessionStorage.setItem(ASKED_KEY, shiftId);
    else window.sessionStorage.removeItem(ASKED_KEY);
  } catch {
    // Storage blocked: the till asks again after a reload, which is harmless.
  }
}

/**
 * SET-06, W-64. "Ask for a cash drop above": once the drawer holds more than
 * the till rules allow, the till asks the cashier to drop to the safe, once
 * each time it goes over (a reload does not ask again), never over the lock
 * screen, and takes them to the shift's cash drop.
 */
export function PosCashDropPrompt() {
  const router = useRouter();
  const { paired, till, currentShift, isPosHost } = usePosPortalState();
  const { isLocked } = usePosTillLock();
  const shiftId = currentShift?.id ?? null;
  const expectedCash = currentShift?.expectedCash ?? null;
  const limit = till?.rules.cashDropPromptOver ?? null;
  const currency = till?.rules.currency ?? "";

  useEffect(() => {
    if (!paired || isLocked || !shiftId || expectedCash === null || limit === null) return;
    if (!cashDropDue(expectedCash, limit)) {
      if (readAsked() === shiftId) writeAsked(null);
      return;
    }
    if (readAsked() === shiftId) return;
    writeAsked(shiftId);
    void dsConfirm({
      title: "Drop cash to the safe",
      description: cashDropSentence(expectedCash, limit, currency),
      confirmLabel: "Drop cash now",
      cancelLabel: "Later",
      variant: "warning",
    }).then((drop) => {
      if (drop) router.push(getPosPortalHref("shift", isPosHost));
    });
  }, [currency, expectedCash, isLocked, isPosHost, limit, paired, router, shiftId]);

  return null;
}
