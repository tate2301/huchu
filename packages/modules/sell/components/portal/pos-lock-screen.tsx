"use client";

/**
 * The lock screen, and the four digits that clear it.
 *
 * S-7.5, and the decision the ticket already made. `docs/design-system/portals/pos.html`
 * signs a cashier in on a PIN — `renderLogin`, with the digits printed next to each
 * name. What is built here is the useful half of that without the credential half:
 *
 * - the cashier signs in **once**, with their password, at `app/portal/pos/login`;
 * - the till locks between customers, on the Lock key or after five idle minutes;
 * - four digits clear the lock. Same session, same user, nothing new granted.
 *
 * `lib/retail/till-pin.ts` carries the threat model and the lockout arithmetic;
 * `app/api/v2/retail/pos/pin/unlock` enforces it server-side, so the digits are
 * never compared in this bundle and a locked terminal never even hashes.
 *
 * **Sign in with your password** is on this screen at all times. That is what makes
 * a five-attempt lockout safe to ship into a queue: the worst case for a cashier who
 * has forgotten their PIN is fifteen seconds and a keyboard, never a closed till.
 *
 * ── What this is not ───────────────────────────────────────────────────────
 *
 * It is not a security boundary against somebody with the device and time. The
 * session cookie is still in the browser and a determined person with developer
 * tools is past this in a minute. It is a screen that stops the *next person at the
 * counter* transacting under a cashier's name while they are in the store room,
 * which is the actual thing that happens in a shop, and it is scoped and named that
 * way throughout.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { signOut, useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { fetchJson, getApiErrorMessage, ApiError } from "@corelithzw/platform/api-client";
import { Lock, LogOut } from "@corelithzw/ui/lib/icons";
import { PosNumericKeypad } from "./pos-numeric-keypad";
import type { PosKeypadAction } from "./pos-numeric-input";
import { usePosPortalState } from "./pos-portal-state";

/** Survives a refresh, dies with the tab. A locked till reloaded is still locked. */
const LOCK_STORAGE_KEY = "retail_pos_till_locked";

/**
 * Five minutes of nothing at all — no touch, no key, no pointer.
 *
 * Long enough that it never fires mid-sale, short enough that a cashier who walks
 * to the store room and gets talking has not left their name on an open till.
 * Idle-locking is the reason the feature earns its place: a lock that only works
 * when somebody remembers to press it protects the shifts where nothing happens.
 */
export const POS_IDLE_LOCK_MS = 5 * 60 * 1000;

export type PosTillPinStatus = {
  configured: boolean;
  locked: boolean;
  lockedUntil: string | null;
  lastUnlockedAt: string | null;
  updatedAt: string | null;
};

type PosTillLockValue = {
  /** Whether a PIN exists for this user. No PIN, no lock screen. */
  pinConfigured: boolean;
  pinStatus: PosTillPinStatus | null;
  isLocked: boolean;
  lock: () => void;
  refreshPinStatus: () => void;
};

const PosTillLockContext = createContext<PosTillLockValue | null>(null);

export function usePosTillLock() {
  const context = useContext(PosTillLockContext);
  if (!context) {
    throw new Error("usePosTillLock must be used within PosTillLockProvider");
  }
  return context;
}

export function PosTillLockProvider({ children }: PropsWithChildren) {
  // Re-lock on reload, read at initialisation rather than in a mount effect.
  //
  // A refresh must not be the way past the lock screen. Doing it in an effect
  // meant the till rendered unlocked for one paint and then locked — which on a
  // tablet left the previous cashier's basket briefly on screen, and is exactly
  // the gap the lock exists to close. A lazy initialiser locks on the first
  // client render instead.
  //
  // The server has no session storage, so it renders unlocked and the client
  // corrects on its first pass. That is unavoidable for state only the browser
  // can know, and it is the same reason the whole POS portal sits behind a
  // client auth guard.
  const [isLocked, setIsLocked] = useState(
    () => typeof window !== "undefined" && window.sessionStorage.getItem(LOCK_STORAGE_KEY) === "1",
  );

  const statusQuery = useQuery({
    queryKey: ["retail-till-pin"],
    queryFn: () => fetchJson<{ data: PosTillPinStatus }>("/api/v2/retail/pos/pin"),
    staleTime: 30_000,
  });
  const pinStatus = statusQuery.data?.data ?? null;
  const pinConfigured = Boolean(pinStatus?.configured);

  const lock = useCallback(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(LOCK_STORAGE_KEY, "1");
    }
    setIsLocked(true);
  }, []);

  const unlock = useCallback(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(LOCK_STORAGE_KEY);
    }
    setIsLocked(false);
  }, []);

  // ── Idle auto-lock ──────────────────────────────────────────────────────
  //
  // `lock` is a `useCallback` with no dependencies, so it is stable for the life
  // of the provider and the effect can simply depend on it. This held a ref that
  // was reassigned during render to dodge the dependency — which React forbids,
  // and which bought nothing here: a ref only earns its place when the callback
  // it holds actually changes between renders.
  useEffect(() => {
    if (!pinConfigured || isLocked) return;
    if (typeof window === "undefined") return;

    let timer = window.setTimeout(lock, POS_IDLE_LOCK_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, POS_IDLE_LOCK_MS);
    };

    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const event of events) window.addEventListener(event, bump, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, bump);
    };
  }, [pinConfigured, isLocked, lock]);

  const value = useMemo<PosTillLockValue>(
    () => ({
      pinConfigured,
      pinStatus,
      isLocked: isLocked && pinConfigured,
      lock,
      refreshPinStatus: () => void statusQuery.refetch(),
    }),
    [isLocked, lock, pinConfigured, pinStatus, statusQuery],
  );

  return (
    <PosTillLockContext.Provider value={value}>
      {children}
      {value.isLocked ? <PosLockScreen onUnlocked={unlock} /> : null}
    </PosTillLockContext.Provider>
  );
}

/* ─── The screen itself ───────────────────────────────────────────── */

function PinDots({ length, error }: { length: number; error: boolean }) {
  return (
    <div className="flex items-center justify-center gap-3" role="group" aria-label="PIN">
      {[0, 1, 2, 3].map((index) => {
        const filled = index < length;
        return (
          <span
            key={index}
            className="h-4 w-4 rounded-full border-2 transition-all duration-100"
            style={{
              borderColor: error
                ? "var(--pos-status-danger-text)"
                : filled
                  ? "var(--pos-cta-bg)"
                  : "var(--pos-key-border)",
              background: filled
                ? error
                  ? "var(--pos-status-danger-text)"
                  : "var(--pos-cta-bg)"
                : "transparent",
            }}
          />
        );
      })}
    </div>
  );
}

function PosLockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const { data: session } = useSession();
  const { isPosHost, currentShift } = usePosPortalState();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockedOut, setLockedOut] = useState(false);

  const submit = useCallback(
    async (candidate: string) => {
      setChecking(true);
      try {
        await fetchJson("/api/v2/retail/pos/pin/unlock", {
          method: "POST",
          body: JSON.stringify({ pin: candidate }),
        });
        setPin("");
        setError(null);
        onUnlocked();
      } catch (caught) {
        // The digits are dropped before anything else happens. They are not
        // logged, not reported, and not left in state for a re-render to show.
        setPin("");
        const status = caught instanceof ApiError ? caught.status : 0;
        const details =
          caught instanceof ApiError
            ? (caught.details as { attemptsRemaining?: number } | undefined)
            : undefined;
        setLockedOut(status === 423);
        setAttemptsRemaining(
          typeof details?.attemptsRemaining === "number" ? details.attemptsRemaining : null,
        );
        setError(getApiErrorMessage(caught));
      } finally {
        setChecking(false);
      }
    },
    [onUnlocked],
  );

  const push = useCallback(
    (digit: string) => {
      setError(null);
      setPin((current) => {
        if (current.length >= 4) return current;
        const next = current + digit;
        if (next.length === 4) void submit(next);
        return next;
      });
    },
    [submit],
  );

  const handleKeypad = (action: PosKeypadAction) => {
    if (checking || lockedOut) return;
    if (action.type === "digit") push(action.value);
    else if (action.type === "backspace") setPin((current) => current.slice(0, -1));
    else if (action.type === "clear") setPin("");
  };

  // A physical keyboard is on most of these tills, and a cashier who has one is
  // not going to reach for the screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (checking || lockedOut) return;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        push(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        setPin((current) => current.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checking, lockedOut, push]);

  const operatorName = session?.user?.name || "Cashier";

  return (
    <div
      className="pos-terminal fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "var(--pos-rail-bg)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Till locked"
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-6"
        style={{
          background: "var(--surface-base)",
          borderColor: "var(--edge-default)",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: "var(--pos-status-info-bg)", color: "var(--pos-status-info-text)" }}
          >
            <Lock className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Till locked
            </p>
            <p className="truncate text-[15px] font-bold text-[var(--text-strong)]">
              {operatorName}
            </p>
            <p className="truncate text-xs text-[var(--text-muted)]">
              {currentShift
                ? `${currentShift.shiftNo} · ${currentShift.registerName}`
                : "Still signed in"}
            </p>
          </div>
        </div>

        <div className="my-6">
          <PinDots length={pin.length} error={Boolean(error)} />
          <p
            className="mt-3 min-h-[2.5rem] text-center text-xs leading-5"
            style={{ color: error ? "var(--pos-status-danger-text)" : "var(--text-muted)" }}
          >
            {error
              ? `${error}${
                  attemptsRemaining !== null && attemptsRemaining > 0
                    ? ` ${attemptsRemaining} ${attemptsRemaining === 1 ? "try" : "tries"} left.`
                    : ""
                }`
              : "Type your four-digit PIN to carry on."}
          </p>
        </div>

        <PosNumericKeypad onAction={handleKeypad} decimal={false} />

        <button
          type="button"
          className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-[13px] font-bold"
          style={{
            background: "var(--surface-muted)",
            borderColor: "var(--edge-default)",
            color: "var(--text-strong)",
          }}
          onClick={() =>
            void signOut({
              redirect: true,
              callbackUrl: isPosHost ? "/login" : "/portal/pos/login",
            })
          }
        >
          <LogOut className="h-4 w-4" />
          Sign in with your password instead
        </button>
        <p className="mt-3 text-center text-[11px] leading-4 text-[var(--text-muted)]">
          The PIN only unlocks this screen. It cannot approve a price override or a
          refund — a manager still types their password for those.
        </p>
      </div>
    </div>
  );
}
