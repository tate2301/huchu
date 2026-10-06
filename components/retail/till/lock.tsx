"use client";

/**
 * The lock: the sale waits under it, the cashier's PIN opens it.
 *
 * The till's layout reads the PIN status and the lock cookie on the server and
 * hands them in, so the server's render and the browser's first one agree: a
 * till with a PIN shows Lock from its first frame, and a locked till reloads
 * locked. The status query starts from what the layout read, which is newer
 * than any copy the persisted cache restores, and refetches from there.
 *
 * The session stays open while locked; the PIN is checked by `pos/pin/unlock`,
 * which grants nothing and counts wrong guesses. Five wrong in a row lock the
 * PIN until a manager sends a new one (ADM-03); the password still opens the
 * till. The till locks on Lock, on L, and after five idle minutes. "Someone
 * else" ends the session and goes to "Who is selling?"; the shift stays open
 * for whoever comes back to it.
 *
 * A PIN somebody sent from People is the person's to replace on first use
 * (ADM-03): signed in with it, or unlocking with it, the till asks them to
 * choose their own before it opens (`pos/pin/change`).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CheckCircle, Key, UserSwitch } from "@/lib/icons";
import { TILL_LOCK_COOKIE, TILL_PIN_LOCKED, tillPinDenial } from "@/lib/retail/till-pin";
import type { TillPinStatus } from "@/lib/retail/till-pin-status";
import { count, firstName, pairedWhen } from "./format";
import { Avatar, ErrorLine, GateSide, Keypad, KeysPaused, PinDots, useKeypadKeys, type KeypadKey } from "./parts";
import { useSignOut } from "./sign-out";
import { useTill } from "./state";

/** Five minutes of no touch, key or pointer. */
export const POS_IDLE_LOCK_MS = 5 * 60 * 1000;

type LockValue = {
  pinConfigured: boolean;
  pinStatus: TillPinStatus;
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

/*
 * Locked or open lives in a cookie: the layout reads it for the server's
 * render, and the browser reads it after hydration. Offline the service worker
 * serves the page as it was last rendered, so the cookie, not that page, says
 * whether this till is locked now.
 */
const lockListeners = new Set<() => void>();

function subscribeToLock(listener: () => void) {
  lockListeners.add(listener);
  return () => void lockListeners.delete(listener);
}

function readLockCookie() {
  return document.cookie.split("; ").includes(`${TILL_LOCK_COOKIE}=1`);
}

function writeLockCookie(locked: boolean) {
  document.cookie = `${TILL_LOCK_COOKIE}=${locked ? "1" : ""}; path=/; SameSite=Lax${locked ? "" : "; max-age=0"}`;
  for (const listener of lockListeners) listener();
}

export function TillLockProvider({
  children,
  pinStatus: initialPinStatus,
  locked,
}: PropsWithChildren<{ pinStatus: TillPinStatus; locked: boolean }>) {
  const isLocked = useSyncExternalStore(subscribeToLock, readLockCookie, () => locked);

  const statusQuery = useQuery({
    queryKey: ["retail-till-pin"],
    queryFn: () => fetchJson<{ data: TillPinStatus }>("/api/v2/retail/pos/pin"),
    initialData: { data: initialPinStatus },
    staleTime: 30_000,
  });
  const pinStatus = statusQuery.data.data;
  const pinConfigured = pinStatus.hasPin;
  const { data: session } = useSession();
  // Unlocked with a PIN that was sent: the PIN typed is the current one the change asks for.
  const [sentPin, setSentPin] = useState<string | null>(null);
  // Signed in with a PIN that was sent (the session says so), or unlocked with one: theirs comes first.
  const mustChoose =
    pinStatus.mustChange && (sentPin !== null || session?.user?.pinMustChange === true);

  const lock = useCallback(() => writeLockCookie(true), []);
  const unlock = useCallback(() => writeLockCookie(false), []);

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
      isLocked: (isLocked || mustChoose) && pinConfigured,
      lock,
      refreshPinStatus: () => void statusQuery.refetch(),
    }),
    [isLocked, lock, mustChoose, pinConfigured, pinStatus, statusQuery],
  );

  return (
    <LockContext.Provider value={value}>
      {/* Hidden, not unmounted: the sale under the lock is kept as it was. */}
      <div className="under-lock" hidden={value.isLocked}>
        <KeysPaused paused={value.isLocked}>{children}</KeysPaused>
      </div>
      {!value.isLocked ? null : mustChoose ? (
        <ChoosePinScreen
          currentPin={sentPin}
          onChosen={() => {
            setSentPin(null);
            unlock();
            void statusQuery.refetch();
          }}
        />
      ) : (
        <LockScreen
          onUnlocked={(mustChange, typed) => {
            if (mustChange) {
              setSentPin(typed);
              void statusQuery.refetch();
              return;
            }
            unlock();
          }}
        />
      )}
    </LockContext.Provider>
  );
}

function LockScreen({ onUnlocked }: { onUnlocked: (mustChange: boolean, typed: string) => void }) {
  const { data: session } = useSession();
  const { shiftHere, cart, context } = useTill();
  const { requestSignOut } = useSignOut();
  const { pinStatus, refreshPinStatus } = useTillLock();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // A PIN already locked when the till locks shows the lockout straight away.
  const [pinLocked, setPinLocked] = useState(() => pinStatus.locked);
  const name = session?.user?.name ?? "You";
  const tillName = context?.till.name ?? "The till";
  const someoneElse = () => requestSignOut();
  const titleId = useId();
  // Whatever had focus is hidden now: the lock takes it, so a keyboard starts here.
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    screen.current?.focus();
  }, []);

  const submit = async (candidate: string) => {
    setChecking(true);
    try {
      const answer = await fetchJson<{ mustChange?: boolean }>("/api/v2/retail/pos/pin/unlock", {
        method: "POST",
        body: JSON.stringify({ pin: candidate }),
      });
      setPin("");
      setError(null);
      onUnlocked(answer?.mustChange === true, candidate);
    } catch (caught) {
      setPin("");
      const details = caught instanceof ApiError ? (caught.details as { attemptsRemaining?: number } | undefined) : undefined;
      if (caught instanceof ApiError && caught.status === 423) {
        setPinLocked(true);
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
    if (checking || pinLocked) return;
    setError(null);
    if (key.kind === "delete") setPin((current) => current.slice(0, -1));
    else if (key.kind === "clear") setPin("");
    else if (key.kind === "digit" && pin.length < 4) {
      const next = pin + key.value;
      setPin(next);
      if (next.length === 4) void submit(next);
    }
  };
  useKeypadKeys(onKey, !pinLocked);

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
    <div ref={screen} className="gate is-locked" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      {pinLocked ? (
        <div className="gate-form">
          <div className="who-head">
            <Avatar name={name} image={session?.user?.image} size={40} />
            <div>
              <h1 id={titleId} className="text-title">{firstName(name)}’s PIN is locked</h1>
              <p className="muted">{TILL_PIN_LOCKED}</p>
            </div>
          </div>
          <PinDots length={4} wrong label="PIN locked" />
          <p>Until a new one comes, {firstName(name)} signs in with their password, or someone else sells.</p>
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
              <h1 id={titleId} className="text-title">{tillName} is locked</h1>
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

/* ─── Choose your own PIN ──────────────────────────────────────────────── */

/** The two tries did not match. */
const MISMATCH = "Those two do not match. Type your new PIN again.";

/**
 * "Choose your own PIN" (ADM-03): a PIN sent from People opens the till once,
 * and then its holder picks four digits of their own, typed twice. Over the
 * till like the lock, with nothing behind it reachable until it is done.
 * `currentPin` is the sent PIN when it was typed at the lock; a session opened
 * with it needs none (`chooseTillPin`).
 *
 * It says what is happening at each step: that the sent PIN worked and they are
 * signed in, which row they are typing, that the first entry can be their PIN
 * (asked of the server at once, so the sent PIN is refused before it is typed
 * twice), and, once saved, that their PIN is set.
 */
function ChoosePinScreen({ currentPin, onChosen }: { currentPin: string | null; onChosen: () => void }) {
  const { data: session } = useSession();
  const { context } = useTill();
  const { requestSignOut } = useSignOut();
  const { toast } = useToast();
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"checking" | "saving" | null>(null);
  const name = session?.user?.name ?? "";
  const tillName = context?.till.name ?? "The till";
  const titleId = useId();
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    screen.current?.focus();
  }, []);

  const refuse = (sentence: string) => {
    setFirst(null);
    setPin("");
    setError(sentence);
  };

  const send = (chosen: string, check: boolean) =>
    fetchJson("/api/v2/retail/pos/pin/change", {
      method: "POST",
      body: JSON.stringify({ newPin: chosen, ...(currentPin ? { currentPin } : {}), ...(check ? { check: true } : {}) }),
    });
  const refusal = (caught: unknown) => {
    const fieldErrors =
      caught instanceof ApiError ? (caught.details as { fieldErrors?: Record<string, string> } | undefined)?.fieldErrors : undefined;
    return fieldErrors?.newPin ?? fieldErrors?.currentPin ?? getApiErrorMessage(caught);
  };

  const take = async (chosen: string) => {
    const denial = tillPinDenial(chosen);
    if (denial) return refuse(denial);
    setBusy("checking");
    try {
      await send(chosen, true);
      setFirst(chosen);
      setPin("");
    } catch (caught) {
      refuse(refusal(caught));
    } finally {
      setBusy(null);
    }
  };

  const save = async (chosen: string) => {
    setBusy("saving");
    try {
      await send(chosen, false);
      toast({ title: "Your PIN is set. Use it from now on.", variant: "success" });
      onChosen();
    } catch (caught) {
      refuse(refusal(caught));
    } finally {
      setBusy(null);
    }
  };

  const onKey = (key: KeypadKey) => {
    if (busy) return;
    setError(null);
    if (key.kind === "delete") return setPin((current) => current.slice(0, -1));
    if (key.kind === "clear") return setPin("");
    if (key.kind !== "digit" || pin.length >= 4) return;
    const next = pin + key.value;
    setPin(next);
    if (next.length < 4) return;
    if (first === null) void take(next);
    else if (next !== first) refuse(MISMATCH);
    else void save(next);
  };
  useKeypadKeys(onKey);

  const help =
    busy === "checking"
      ? "Checking it…"
      : busy === "saving"
        ? "Saving your PIN…"
        : first === null
          ? "Not the PIN you were sent, not four of the same digit and not four in a row, like 1111 or 1234."
          : "The same four digits, to be sure.";

  return (
    <div ref={screen} className="gate is-locked" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className="gate-form">
        <span className="saved is-large">
          <CheckCircle className="ic" />
          {name ? `Signed in as ${firstName(name)} with the PIN you were sent` : "Signed in with the PIN you were sent"}
        </span>
        <div className="who-head">
          <Avatar name={name || "You"} image={session?.user?.image} size={40} />
          <div>
            <h1 id={titleId} className="text-title">Now choose your own PIN</h1>
            <p className="muted">The till opens once you have. The one you were sent stops working.</p>
          </div>
        </div>
        <div className="pin-rows">
          <div className="pin-row">
            <span className="label">New PIN</span>
            <PinDots length={first !== null ? 4 : pin.length} wrong={Boolean(error)} />
            {error ? (
              <ErrorLine large>{error}</ErrorLine>
            ) : first !== null ? (
              <span className="saved">
                <CheckCircle className="ic" />
                Can be your PIN
              </span>
            ) : null}
          </div>
          <div className={first === null ? "pin-row is-later" : "pin-row"}>
            <span className="label">Again</span>
            <PinDots length={first === null ? 0 : pin.length} />
          </div>
        </div>
        {error ? null : (
          <span className="help" role="status">
            {help}
          </span>
        )}
        <Keypad onKey={onKey} disabled={busy !== null} />
        <button type="button" className="btn btn-lg" onClick={() => requestSignOut()}>
          <UserSwitch className="ic" />
          Someone else
        </button>
      </div>
      <GateSide
        lede={context ? `${context.till.name} at ${context.site.name}.` : tillName}
        quiet={context ? `Paired ${pairedWhen(context.device.pairedAt)} by ${context.device.pairedBy}.` : ""}
        step={2}
        till={context?.till.name}
      />
    </div>
  );
}
