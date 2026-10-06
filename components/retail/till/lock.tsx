"use client";

/**
 * The lock: the sale waits under it, the cashier's PIN opens it.
 *
 * The session stays open while locked; the PIN is checked by `pos/pin/unlock`,
 * which grants nothing and counts wrong guesses. The till locks on Lock, on L,
 * and after five idle minutes. "Someone else" ends the session and goes to
 * "Who is selling?"; the shift stays open for whoever comes back to it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Key, UserSwitch } from "@/lib/icons";
import { count, firstName, hhmm, pairedWhen } from "./format";
import { Avatar, ErrorLine, GateSide, Keypad, KeysPaused, PinDots, useKeypadKeys, type KeypadKey } from "./parts";
import { useSignOut } from "./sign-out";
import { useTill } from "./state";

/** Survives a refresh, dies with the tab: a locked till reloaded is still locked. */
const LOCK_STORAGE_KEY = "retail_pos_till_locked";

/** Five minutes of no touch, key or pointer. */
export const POS_IDLE_LOCK_MS = 5 * 60 * 1000;

export type TillPinStatus = {
  configured: boolean;
  locked: boolean;
  lockedUntil: string | null;
  lastUnlockedAt: string | null;
  updatedAt: string | null;
};

type LockValue = {
  pinConfigured: boolean;
  pinStatus: TillPinStatus | null;
  isLocked: boolean;
  lock: () => void;
  refreshPinStatus: () => void;
};

const LockContext = createContext<LockValue | null>(null);

export function useTillLock() {
  const context = useContext(LockContext);
  if (!context) throw new Error("useTillLock must be used within TillLockProvider");
  return context;
}

export function TillLockProvider({ children }: PropsWithChildren) {
  // Read at the first render, not in an effect, so a reload never shows the sale for a frame.
  const [isLocked, setIsLocked] = useState(
    () => typeof window !== "undefined" && window.sessionStorage.getItem(LOCK_STORAGE_KEY) === "1",
  );

  const statusQuery = useQuery({
    queryKey: ["retail-till-pin"],
    queryFn: () => fetchJson<{ data: TillPinStatus }>("/api/v2/retail/pos/pin"),
    staleTime: 30_000,
  });
  const pinStatus = statusQuery.data?.data ?? null;
  const pinConfigured = Boolean(pinStatus?.configured);

  const lock = useCallback(() => {
    window.sessionStorage.setItem(LOCK_STORAGE_KEY, "1");
    setIsLocked(true);
  }, []);
  const unlock = useCallback(() => {
    window.sessionStorage.removeItem(LOCK_STORAGE_KEY);
    setIsLocked(false);
  }, []);

  useEffect(() => {
    if (!pinConfigured || isLocked) return;
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

  const value = useMemo<LockValue>(
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
    <LockContext.Provider value={value}>
      {/* Hidden, not unmounted: the sale under the lock is kept as it was. */}
      <div className="under-lock" hidden={value.isLocked}>
        <KeysPaused paused={value.isLocked}>{children}</KeysPaused>
      </div>
      {value.isLocked ? <LockScreen onUnlocked={unlock} /> : null}
    </LockContext.Provider>
  );
}

function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const { data: session } = useSession();
  const { shiftHere, cart, context } = useTill();
  const { requestSignOut } = useSignOut();
  const { pinStatus, refreshPinStatus } = useTillLock();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // A PIN already resting when the till locks shows the lockout straight away.
  const [lockedUntil, setLockedUntil] = useState<number | null>(() =>
    pinStatus?.locked && pinStatus.lockedUntil ? Date.parse(pinStatus.lockedUntil) : null,
  );
  const name = session?.user?.name ?? "You";
  const tillName = context?.till.name ?? "The till";
  const someoneElse = () => requestSignOut();
  // Whatever had focus is hidden now: the lock takes it, so a keyboard starts here.
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    screen.current?.focus();
  }, []);

  // The keypad comes back once the PIN works again.
  useEffect(() => {
    if (!lockedUntil) return;
    const timer = window.setTimeout(() => {
      setLockedUntil(null);
      setError(null);
      refreshPinStatus();
    }, Math.max(0, lockedUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [lockedUntil, refreshPinStatus]);

  const submit = async (candidate: string) => {
    setChecking(true);
    try {
      await fetchJson("/api/v2/retail/pos/pin/unlock", { method: "POST", body: JSON.stringify({ pin: candidate }) });
      setPin("");
      setError(null);
      onUnlocked();
    } catch (caught) {
      setPin("");
      const details = caught instanceof ApiError ? (caught.details as { attemptsRemaining?: number; retryAfterMs?: number } | undefined) : undefined;
      if (caught instanceof ApiError && caught.status === 423) {
        setLockedUntil(Date.now() + (details?.retryAfterMs ?? 15 * 60 * 1000));
        refreshPinStatus();
        return;
      }
      const left = details?.attemptsRemaining;
      setError(
        typeof left === "number"
          ? `That PIN is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
          : getApiErrorMessage(caught),
      );
    } finally {
      setChecking(false);
    }
  };

  const onKey = (key: KeypadKey) => {
    if (checking || lockedUntil) return;
    setError(null);
    if (key.kind === "delete") setPin((current) => current.slice(0, -1));
    else if (key.kind === "clear") setPin("");
    else if (key.kind === "digit" && pin.length < 4) {
      const next = pin + key.value;
      setPin(next);
      if (next.length === 4) void submit(next);
    }
  };
  useKeypadKeys(onKey, !lockedUntil);

  const items = cart.reduce((sum, item) => sum + (Number.isInteger(item.quantity) ? item.quantity : 1), 0);
  const side = (
    <GateSide
      lede={context ? `${context.till.name} at ${context.site.name}.` : tillName}
      quiet={context ? `Paired ${pairedWhen(context.device.pairedAt)} by ${context.device.pairedBy}.` : ""}
      step="done"
      till={context?.till.name}
    />
  );

  return (
    <div ref={screen} className="gate is-locked" role="dialog" aria-modal="true" aria-label={`${tillName} is locked`} tabIndex={-1}>
      {lockedUntil ? (
        <div className="gate-form">
          <div className="who-head">
            <Avatar name={name} image={session?.user?.image} size={40} />
            <div>
              <h1 className="text-title">Too many wrong PINs</h1>
              <p className="muted">
                {firstName(name)}’s PIN works again at {hhmm(new Date(lockedUntil))}
              </p>
            </div>
          </div>
          <PinDots length={4} wrong label="PIN locked" />
          <p>
            Until then {firstName(name)} signs in with their password, or someone else sells. A manager can set a
            new PIN under People in Management.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-lg grow" onClick={() => requestSignOut({ next: "password" })}>
              <Key className="ic" />
              Use my password
            </button>
            <button type="button" className="btn btn-lg grow" onClick={someoneElse}>
              <UserSwitch className="ic" />
              Someone else
            </button>
          </div>
        </div>
      ) : (
        <div className="gate-form">
          <div className="who-head">
            <Avatar name={name} image={session?.user?.image} size={40} />
            <div>
              <h1 className="text-title">{tillName} is locked</h1>
              <p className="muted">
                {name}
                {shiftHere ? (
                  <>
                    {" · "}
                    <span className="num">{shiftHere.shiftNo}</span>
                  </>
                ) : null}
                {items ? ` · ${count(items, "item")} waiting` : ""}
              </p>
            </div>
          </div>
          <PinDots length={pin.length} wrong={Boolean(error)} />
          {error ? <ErrorLine large>{error}</ErrorLine> : null}
          <Keypad onKey={onKey} disabled={checking} />
          <button type="button" className="btn btn-lg" onClick={someoneElse}>
            <UserSwitch className="ic" />
            Someone else
          </button>
        </div>
      )}
      {side}
    </div>
  );
}
