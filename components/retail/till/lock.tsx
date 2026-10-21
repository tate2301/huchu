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
import { useHydrated } from "@/hooks/use-hydrated";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { UserSwitch } from "@/lib/icons";
import { TILL_LOCK_COOKIE, TILL_PIN_LOCKED, tillPinDenial } from "@/lib/retail/till-pin";
import type { TillPinStatus } from "@/lib/retail/till-pin-status";
import { count, firstName } from "./format";
import { GateButton, GateError, GateFrame, GateStrip, GateWho, PinLockedSide, PinPad } from "./gate";
import { KeysPaused, PinDots, useKeypadKeys, type KeypadKey } from "./parts";
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

/** The strip over the lock: the till's details can come from the device's cache, which the server does not have. */
function LockStrip() {
  const { context: known } = useTill();
  const context = useHydrated() ? known : null;
  return <GateStrip shop={context?.site.name} till={context?.till.name} logo={context?.receipt.logoUrl} />;
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
  const image = session?.user?.image;

  return (
    <GateFrame
      ref={screen}
      className="is-over"
      strip={<LockStrip />}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      {pinLocked ? (
        <>
          <section className="gate-l">
            <GateWho
              name={name}
              image={image}
              titleId={titleId}
              title={`${firstName(name)}’s PIN is locked`}
              sub={TILL_PIN_LOCKED}
              bad
            />
          </section>
          <PinLockedSide onPassword={() => requestSignOut({ next: "password" })} onSomeoneElse={someoneElse} />
        </>
      ) : (
        <>
          <section className="gate-l">
            <GateWho
              name={name}
              image={image}
              titleId={titleId}
              title={`${tillName} is locked`}
              sub={
                <>
                  {name}
                  {shiftHere ? (
                    <>
                      {" · "}
                      <span className="num">{shiftHere.shiftNo}</span>
                    </>
                  ) : null}
                  {items ? ` · ${count(items, "item")} waiting` : ""}
                </>
              }
            />
            <div className="gate-foot">
              <GateButton icon={UserSwitch} onClick={someoneElse}>
                Someone else
              </GateButton>
            </div>
          </section>
          <section className="gate-r">
            <div className="gate-pinl">{firstName(name)}’s PIN</div>
            <PinDots length={pin.length} wrong={Boolean(error)} />
            {error ? <GateError>{error}</GateError> : null}
            <PinPad onKey={onKey} onGo={() => pin.length === 4 && void submit(pin)} goLabel="Unlock" busy={checking} />
          </section>
        </>
      )}
    </GateFrame>
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
 * The first entry is asked of the server at once, so the sent PIN, or one too
 * easy to guess, is refused before it is typed twice.
 */
function ChoosePinScreen({ currentPin, onChosen }: { currentPin: string | null; onChosen: () => void }) {
  const { data: session } = useSession();
  const { requestSignOut } = useSignOut();
  const { toast } = useToast();
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"checking" | "saving" | null>(null);
  const name = session?.user?.name ?? "";
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
      toast({ title: "Your PIN is set.", variant: "success" });
      onChosen();
    } catch (caught) {
      refuse(refusal(caught));
    } finally {
      setBusy(null);
    }
  };

  /** Four digits typed: the first time it is checked, the second it must match and is saved. */
  const settle = (full: string) => {
    if (first === null) void take(full);
    else if (full !== first) refuse(MISMATCH);
    else void save(full);
  };

  const onKey = (key: KeypadKey) => {
    if (busy) return;
    setError(null);
    if (key.kind === "delete") return setPin((current) => current.slice(0, -1));
    if (key.kind === "clear") return setPin("");
    if (key.kind !== "digit" || pin.length >= 4) return;
    const next = pin + key.value;
    setPin(next);
    if (next.length === 4) settle(next);
  };
  useKeypadKeys(onKey);

  return (
    <GateFrame
      ref={screen}
      className="is-over"
      strip={<LockStrip />}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <section className="gate-l">
        <GateWho
          name={name || "You"}
          image={session?.user?.image}
          titleId={titleId}
          title="Now choose your own PIN"
          sub={name ? `Signed in as ${firstName(name)} with the PIN you were sent` : "Signed in with the PIN you were sent"}
        />
        <div className="gate-foot">
          <GateButton icon={UserSwitch} onClick={() => requestSignOut()}>
            Someone else
          </GateButton>
        </div>
      </section>
      <section className="gate-r">
        <div className={first === null ? "gate-twin is-now" : "gate-twin"}>
          <div className="gate-pinl">New PIN</div>
          <PinDots length={first !== null ? 4 : pin.length} wrong={Boolean(error)} label={`New PIN, ${first !== null ? 4 : pin.length} of 4 digits typed`} />
        </div>
        <div className={first === null ? "gate-twin is-later" : "gate-twin is-now"}>
          <div className="gate-pinl">Again</div>
          <PinDots length={first === null ? 0 : pin.length} label={`Again, ${first === null ? 0 : pin.length} of 4 digits typed`} />
        </div>
        {error ? <GateError>{error}</GateError> : null}
        <PinPad
          onKey={onKey}
          onGo={() => pin.length === 4 && settle(pin)}
          goLabel={first === null ? "Next" : "Save the PIN"}
          go="check"
          busy={busy !== null}
        />
      </section>
    </GateFrame>
  );
}
