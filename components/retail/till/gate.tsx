"use client";

/**
 * "Who is selling?" and their PIN: the POS host's signed-out `/` on a till.
 *
 * The device's key (the httpOnly cookie a manager's pairing code issued) says
 * which till this is; the PIN says who (`till-pin`). The people are those
 * holding a till PIN, which a manager sends from People (ADM-02, ADM-03). Five
 * wrong PINs lock it until a new one is sent; meanwhile the account password
 * signs in instead. A PIN that was sent is changed for one of their own on
 * first use, over the till (`lock.tsx`). Opening the shift comes after
 * sign-in, on the till.
 *
 * The frame here (the strip, the two halves, the PIN pad) is the one the lock
 * (`lock.tsx`) and the door (`door.tsx`) are drawn in too: who on the left,
 * the keys on the ground on the right (W6-9).
 */

import * as React from "react";
import { signIn } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Backspace, Check, Eye, EyeOff, Key, SignIn, UserSwitch, Wifi, WifiOff } from "@/lib/icons";
import type { TillPerson } from "@/lib/retail/devices";
import { TILL_PIN_LOCKED } from "@/lib/retail/till-pin";
import { useConnection } from "./connection";
import { count, firstName, hhmm } from "./format";
import { Avatar, PinDots, useKeypadKeys, useWindowKeys, type KeypadKey } from "./parts";
import { SIGNED_OUT_NOTE_KEY, type SignedOutNote } from "./sign-out";

export type { TillPerson };

/** This till, as the server page found it from the device's key. */
export type GateTill = { name: string; site: string };

export const TILL_PEOPLE_KEY = ["till-people"] as const;

/* ─── The frame: strip, two halves, PIN pad ───────────────────────────── */

/** The time on the strip, to the minute: the device's clock, so none until the page is on it. */
function useClock() {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    const tickNow = () => setNow(new Date());
    tickNow();
    const tick = window.setInterval(tickNow, 15_000);
    return () => window.clearInterval(tick);
  }, []);
  return now;
}

/**
 * The strip across the top of a gate screen. A till names its shop and
 * itself; a device that is not one yet shows Tender and where it is.
 */
export function GateStrip({ shop, till, logo, place }: { shop?: string; till?: string; logo?: string | null; place?: string }) {
  const { online } = useConnection();
  const now = useClock();
  return (
    <header className="strip">
      {shop ? (
        <span className="strip-mark" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- the shop's own logo, cached offline */}
          {logo ? <img src={logo} alt="" /> : shop.charAt(0)}
        </span>
      ) : (
        <svg className="strip-brand" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="6" />
          <path d="M7 8h10M12 8v9" />
        </svg>
      )}
      <span className="strip-shop">{shop || "Tender"}</span>
      {till ? <span className="strip-till">· {till}</span> : null}
      <span className="grow" />
      {online ? (
        <Wifi className="ic" role="img" aria-label="Connected" />
      ) : (
        <WifiOff className="ic is-off" role="img" aria-label="No connection" />
      )}
      {place ? <span className="strip-place">{place}</span> : null}
      {now ? (
        <time className="strip-time" dateTime={now.toISOString()}>
          {hhmm(now)}
        </time>
      ) : null}
    </header>
  );
}

/** A gate screen: the strip, then the two halves it is given. */
export function GateFrame({
  strip,
  className,
  children,
  ...rest
}: React.ComponentPropsWithRef<"div"> & { strip: React.ReactNode }) {
  return (
    <div {...rest} className={className ? `gate-cm ${className}` : "gate-cm"}>
      {strip}
      <div className="gate-body">{children}</div>
    </div>
  );
}

/** The left half's person: a big face, a title, and one line of facts (red when something went wrong). */
export function GateWho({
  name,
  image,
  title,
  titleId,
  sub,
  bad,
}: {
  name: string;
  image?: string | null;
  title: React.ReactNode;
  titleId?: string;
  sub?: React.ReactNode;
  bad?: boolean;
}) {
  return (
    <div className="gate-who">
      <Avatar name={name} image={image} size={40} />
      <div>
        <h1 id={titleId} className="gate-t">
          {title}
        </h1>
        {sub ? (
          <p className={bad ? "gate-s is-bad" : "gate-s"} role={bad ? "alert" : undefined}>
            {sub}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The quiet 64px key at the foot of a half: Someone else, Check a price. */
export function GateButton({
  icon: Icon,
  children,
  ...rest
}: React.ComponentPropsWithoutRef<"button"> & { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <button type="button" className="gate-btn" {...rest}>
      <Icon className="ic" />
      {children}
    </button>
  );
}

/** A focused control that handles Enter itself: Enter there is its own, not the screen's. */
function ownsEnter(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button, a, input, textarea, select"));
}

/** Enter, for a screen's one orange key, unless a field or another key has focus. */
export function useEnterKey(onEnter: () => void, enabled = true) {
  useWindowKeys((event) => {
    if (!enabled || event.key !== "Enter" || event.defaultPrevented || event.repeat || ownsEnter(event.target)) return;
    event.preventDefault();
    onEnter();
  });
}

/**
 * The PIN pad: 1 to 9, then Delete, 0 and the orange key (sign in, unlock,
 * save). Four digits go on their own; the orange key and Enter send what is
 * typed when it is complete. Physical digits work through `useKeypadKeys` in
 * the screen that owns it. Keeps the `keypad` class, which lets the keyboard
 * reach it inside the lock's dialog.
 */
export function PinPad({
  onKey,
  onGo,
  goLabel,
  go = "in",
  disabled,
  busy,
}: {
  onKey: (key: KeypadKey) => void;
  onGo: () => void;
  goLabel: string;
  go?: "in" | "check";
  disabled?: boolean;
  busy?: boolean;
}) {
  useEnterKey(onGo, !disabled && !busy);
  const GoIcon = go === "check" ? Check : SignIn;
  return (
    <div className="keypad pinpad" role="group" aria-label="Number pad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((value) => (
        <button key={value} type="button" disabled={disabled} onClick={() => onKey({ kind: "digit", value })}>
          {value}
        </button>
      ))}
      <button type="button" disabled={disabled} aria-label="Delete the last digit" onClick={() => onKey({ kind: "delete" })}>
        <Backspace className="ic" />
      </button>
      <button type="button" disabled={disabled} onClick={() => onKey({ kind: "digit", value: "0" })}>
        0
      </button>
      <button
        type="button"
        className="go"
        disabled={disabled}
        aria-busy={busy || undefined}
        aria-label={`${goLabel}, Enter`}
        onClick={onGo}
      >
        <GoIcon className="ic" />
      </button>
    </div>
  );
}

/** The red line under the dots. */
export function GateError({ children }: { children: React.ReactNode }) {
  return (
    <p className="gate-err" role="alert">
      {children}
    </p>
  );
}

/* ─── Who is selling? ─────────────────────────────────────────────────── */

type Step =
  | { at: "who"; person: TillPerson | null }
  | { at: "password"; person: TillPerson }
  | { at: "locked"; person: TillPerson };

/** Where the till goes once someone is signed in, or once the device turns out not to be a till. */
type Leave = (to: "till" | "pair" | "unpaired") => void;

export function TillGate({ base, till }: { base: string; till: GateTill }) {
  const people = useQuery({
    queryKey: TILL_PEOPLE_KEY,
    queryFn: async () => (await fetchJson<{ data: TillPerson[] }>("/api/v2/retail/devices/people")).data,
    staleTime: 15_000,
  });
  // A full load, so the proxy and the till's own layout see who is signed in now.
  const leave = React.useCallback<Leave>(
    (to) => window.location.assign(to === "till" ? base || "/" : `${base}/${to}`),
    [base],
  );
  // The device stopped being a till between the page and this request.
  const refusal = people.error instanceof ApiError ? (people.error.details as { code?: string } | undefined)?.code : undefined;
  React.useEffect(() => {
    if (refusal === "DEVICE_UNPAIRED") leave("unpaired");
    else if (refusal === "NOT_A_TILL") leave("pair");
  }, [refusal, leave]);

  const strip = <GateStrip shop={till.site} till={till.name} />;

  if (people.isLoading) {
    return (
      <GateFrame strip={strip}>
        <section className="gate-l" aria-busy="true">
          <h1 className="gate-h">Who’s selling?</h1>
          <div className="gate-people">
            {[0, 1, 2].map((index) => (
              <span key={index} className="skeleton is-face" />
            ))}
          </div>
        </section>
        <section className="gate-r" />
      </GateFrame>
    );
  }

  if (people.isError || !people.data) {
    return (
      <GateFrame strip={strip}>
        <section className="gate-l">
          <h1 className="gate-h">The till cannot reach the shop</h1>
          <p className="gate-s is-bad" role="alert">
            {getApiErrorMessage(people.error)}
          </p>
        </section>
        <section className="gate-r">
          <button type="button" className="take-key" onClick={() => void people.refetch()}>
            Try again
            <span className="kbd">↵</span>
          </button>
          <RetryOnEnter onEnter={() => void people.refetch()} />
        </section>
      </GateFrame>
    );
  }

  return <WhoSells people={people.data} strip={strip} leave={leave} refresh={() => people.refetch()} />;
}

/** Enter for a screen whose one key is not on a pad. */
function RetryOnEnter({ onEnter }: { onEnter: () => void }) {
  useEnterKey(onEnter);
  return null;
}

/** Who just signed out, kept for one look at this screen. */
function useSignedOutNote() {
  const [note, setNote] = React.useState<SignedOutNote | null>(null);
  React.useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(SIGNED_OUT_NOTE_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(SIGNED_OUT_NOTE_KEY);
      setNote(JSON.parse(raw) as SignedOutNote);
    } catch {
      // No note is a screen without its first line, nothing worse.
    }
  }, []);
  return note;
}

/** The quiet line on a face: their shift, a locked PIN. Colour only where it stops them here. */
function personState(person: TillPerson): { text: string; tone?: "warn" | "bad" } | null {
  if (person.openShift?.here) return { text: "Open here" };
  if (person.openShift) return { text: `Open on ${person.openShift.till}`, tone: "warn" };
  if (person.pinLocked) return { text: "PIN locked", tone: "bad" };
  return null;
}

function PersonState({ person }: { person: TillPerson }) {
  const state = personState(person);
  if (!state) return null;
  return <small className={state.tone ? `is-${state.tone}` : undefined}>{state.text}</small>;
}

function WhoSells({
  people,
  strip,
  leave,
  refresh,
}: {
  people: TillPerson[];
  strip: React.ReactNode;
  leave: Leave;
  refresh: () => Promise<{ data?: TillPerson[] }>;
}) {
  const [step, setStep] = React.useState<Step>({ at: "who", person: null });
  const signedOut = useSignedOutNote();
  // Signed out from the lock with "Use my password": open on their password, once.
  const [resumed, setResumed] = React.useState<SignedOutNote | null>(null);
  if (signedOut && signedOut !== resumed) {
    setResumed(signedOut);
    const person = signedOut.next === "password" ? people.find((entry) => entry.userId === signedOut.userId) : undefined;
    if (person) setStep({ at: "password", person });
  }
  // Steps hold the person as they were picked; the list is what is true now.
  const now = (person: TillPerson) => people.find((entry) => entry.userId === person.userId) ?? person;
  const back = () => setStep({ at: "who", person: null });
  const pick = (person: TillPerson) => setStep(person.pinLocked ? { at: "locked", person } : { at: "who", person });
  /** A refusal that changes the step rather than showing a line. */
  const follow = async (person: TillPerson, refusal: Refusal) => {
    if (refusal.leave) return leave(refusal.leave);
    if (refusal.step === "locked") {
      const fresh = (await refresh()).data?.find((entry) => entry.userId === person.userId);
      setStep({ at: "locked", person: fresh ?? person });
    }
  };

  if (step.at === "password") {
    const person = now(step.person);
    return (
      <GateFrame strip={strip}>
        <section className="gate-l">
          <GateWho name={person.label} title={person.label} sub={personState(person)?.text} />
          <div className="gate-foot">
            <GateButton icon={UserSwitch} onClick={back}>
              Someone else
            </GateButton>
          </div>
        </section>
        <PasswordSide
          key={person.userId}
          person={person}
          onSignedIn={() => leave("till")}
          onRefusal={(refusal) => follow(person, refusal)}
        />
      </GateFrame>
    );
  }

  if (step.at === "locked") {
    const person = now(step.person);
    return (
      <GateFrame strip={strip}>
        <section className="gate-l">
          <GateWho name={person.label} title={`${firstName(person.label)}’s PIN is locked`} sub={TILL_PIN_LOCKED} bad />
        </section>
        <PinLockedSide onPassword={() => setStep({ at: "password", person })} onSomeoneElse={back} />
      </GateFrame>
    );
  }

  const chosen = step.person ? now(step.person) : null;
  return (
    <GateFrame strip={strip} className={chosen ? undefined : "is-idle"}>
      <section className="gate-l">
        <div className="gate-head">
          <h1 className="gate-h">Who’s selling?</h1>
          {signedOut ? (
            <p className="gate-s">
              {signedOut.name} signed out at <time>{hhmm(signedOut.at)}</time>
              {signedOut.shiftNo ? (
                <>
                  {" · "}
                  <span className="num">{signedOut.shiftNo}</span> open on {signedOut.till ?? "this till"}
                  {signedOut.held ? ` · ${count(signedOut.held, "held sale")}` : ""}
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="gate-people">
          {people.map((person) => (
            <button
              key={person.userId}
              type="button"
              className="gate-face"
              aria-pressed={chosen?.userId === person.userId}
              onClick={() => pick(person)}
            >
              <span className="face">
                <Avatar name={person.label} size={40} />
                {/* How many wait, never what they say: the text shows after their PIN (FLR-09). */}
                {person.unread ? (
                  <span className="count" aria-label={count(person.unread, "message")}>
                    {person.unread}
                  </span>
                ) : null}
              </span>
              <span className="name">{person.label}</span>
              <PersonState person={person} />
            </button>
          ))}
        </div>
      </section>
      {chosen ? (
        <PinSide
          key={chosen.userId}
          person={chosen}
          onSignedIn={() => leave("till")}
          onRefusal={(refusal) => follow(chosen, refusal)}
        />
      ) : (
        <section className="gate-r" aria-label="PIN">
          <div className="gate-pinl is-quiet">PIN</div>
          <PinDots length={0} />
          <PinPad onKey={() => undefined} onGo={() => undefined} goLabel="Sign in" disabled />
        </section>
      )}
    </GateFrame>
  );
}

/** The right half once a PIN is locked: the dots in red, Use my password, Someone else. */
export function PinLockedSide({ onPassword, onSomeoneElse }: { onPassword: () => void; onSomeoneElse: () => void }) {
  useEnterKey(onPassword);
  return (
    <section className="gate-r">
      <PinDots length={4} wrong label="PIN locked" />
      <div className="gate-ways">
        <button type="button" className="take-key" onClick={onPassword}>
          <Key className="ic" />
          Use my password
          <span className="kbd">↵</span>
        </button>
        <GateButton icon={UserSwitch} onClick={onSomeoneElse}>
          Someone else
        </GateButton>
      </div>
    </section>
  );
}

/* ─── Signing in ──────────────────────────────────────────────────────── */

/** What a sign-in that never reached the server says. */
const UNREACHABLE = "The till cannot reach the shop. Try again.";

/** A refused sign-in: a line to show, or where the gate goes instead. */
type Refusal = { message: string; step?: "locked"; leave?: "pair" | "unpaired" };

/** What a refused sign-in means, from the `till-pin` provider's codes. */
function signInRefusal(code: string | undefined, person: TillPerson): Refusal {
  const [kind, value] = (code ?? "").split(":");
  if (kind === "WRONG_PIN") {
    const left = Number(value);
    return {
      message: Number.isFinite(left) && value
        ? `That PIN is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
        : "That PIN is not right.",
    };
  }
  if (kind === "LOCKED") return { message: TILL_PIN_LOCKED, step: "locked" };
  if (kind === "NO_PIN") return { message: "You have no till PIN yet. Ask a manager to send you one." };
  if (kind === "WRONG_PASSWORD") return { message: "That password is not right." };
  if (kind === "NOT_A_TILL") return { message: "This device is not a till.", leave: "pair" };
  if (kind === "DEVICE_UNPAIRED") return { message: "This device is no longer a till.", leave: "unpaired" };
  if (kind === "AUTH_RATE_LIMITED") return { message: "Too many tries from this till. Wait a few minutes." };
  if (kind === "LOGIN_DISABLED" || kind === "TENANT_INACTIVE") return { message: "Signing in is switched off for this shop." };
  return { message: `${firstName(person.label)} cannot sign in on this till.` };
}

/** Signs in with `till-pin`. Null when it worked; else what the refusal means. */
async function tillSignIn(credentials: { userId: string; pin: string } | { userId: string; password: string }, person: TillPerson) {
  let result: Awaited<ReturnType<typeof signIn>>;
  try {
    result = await signIn("till-pin", { ...credentials, redirect: false });
  } catch {
    return { message: UNREACHABLE } satisfies Refusal;
  }
  if (result?.ok && !result.error) return null;
  return signInRefusal(result?.error ?? undefined, person);
}

type SignInProps = {
  person: TillPerson;
  onSignedIn: () => void;
  /** A refusal that moves the gate: a locked PIN, or a device that is not a till. */
  onRefusal: (refusal: Refusal) => void;
};

function PinSide({ person, onSignedIn, onRefusal }: SignInProps) {
  const [pin, setPin] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (full: string) => {
    setBusy(true);
    const refusal = await tillSignIn({ userId: person.userId, pin: full }, person);
    if (!refusal) return onSignedIn();
    setBusy(false);
    setPin("");
    if (refusal.step || refusal.leave) return onRefusal(refusal);
    setError(refusal.message);
  };

  const onKey = (key: KeypadKey) => {
    if (busy) return;
    setError(null);
    if (key.kind === "delete") setPin((current) => current.slice(0, -1));
    else if (key.kind === "clear") setPin("");
    else if (key.kind === "digit" && pin.length < 4) {
      const next = pin + key.value;
      setPin(next);
      if (next.length === 4) void submit(next);
    }
  };
  useKeypadKeys(onKey);

  return (
    <section className="gate-r" aria-label={`${firstName(person.label)}’s PIN`}>
      <div className="gate-pinl">{firstName(person.label)}’s PIN</div>
      <PinDots length={pin.length} wrong={Boolean(error)} />
      {error ? <GateError>{error}</GateError> : null}
      <PinPad onKey={onKey} onGo={() => pin.length === 4 && void submit(pin)} goLabel="Sign in" busy={busy} />
    </section>
  );
}

function PasswordSide({ person, onSignedIn, onRefusal }: SignInProps) {
  const [password, setPassword] = React.useState("");
  const [shown, setShown] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError("Type your password.");
      return;
    }
    setBusy(true);
    const refusal = await tillSignIn({ userId: person.userId, password }, person);
    if (!refusal) return onSignedIn();
    setBusy(false);
    if (refusal.leave) return onRefusal(refusal);
    setError(refusal.message);
  };

  return (
    <form className="gate-r is-form" onSubmit={submit}>
      <div className="gate-field">
        <label htmlFor={id}>Your password</label>
        <div className={error ? "gate-pw is-bad" : "gate-pw"}>
          <input
            id={id}
            type={shown ? "text" : "password"}
            autoComplete="current-password"
            autoFocus
            value={password}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
          />
          <button
            type="button"
            className="eye"
            aria-label={shown ? "Hide the password" : "Show the password"}
            aria-pressed={shown}
            onClick={() => setShown((current) => !current)}
          >
            {shown ? <EyeOff className="ic" /> : <Eye className="ic" />}
          </button>
        </div>
        {error ? (
          <p className="gate-err is-left" role="alert" id={`${id}-error`}>
            {error}
          </p>
        ) : null}
      </div>
      <button type="submit" className="take-key" aria-busy={busy || undefined} disabled={busy}>
        <SignIn className="ic" />
        Sign in
        <span className="kbd">↵</span>
      </button>
    </form>
  );
}
