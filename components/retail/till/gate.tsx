"use client";

/**
 * "Who is selling?" and their PIN: the POS host's signed-out `/` on a till.
 *
 * The device's key (the httpOnly cookie a manager's pairing code issued) says
 * which till this is; the PIN says who (`till-pin`). A PIN that is resting, or
 * a person who has none yet, signs in with their account password once. A
 * first PIN takes the password too (`devices/first-pin`), so a PIN is never
 * minted by another PIN. Opening the shift comes after sign-in, on the till.
 */

import * as React from "react";
import { signIn } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CaretLeft, CaretRight, Key, LogOut, UserSwitch } from "@/lib/icons";
import type { TillPerson } from "@/lib/retail/devices";
import { count, firstName, hhmm, pairedWhen } from "./format";
import { Avatar, ErrorLine, GateSide, Keypad, PinDots, useKeypadKeys, type KeypadKey } from "./parts";
import { SIGNED_OUT_NOTE_KEY, type SignedOutNote } from "./sign-out";

export type { TillPerson };

/** This till, as the server page found it from the device's key. */
export type GateTill = { name: string; site: string; pairedAt: string; pairedBy: string };

export const TILL_PEOPLE_KEY = ["till-people"] as const;

type Step =
  | { at: "who" }
  | { at: "pin"; person: TillPerson }
  | { at: "password"; person: TillPerson; purpose: "first" | "instead"; error?: string }
  | { at: "pick"; person: TillPerson; password: string }
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

  const side = (
    <GateSide
      lede={`${till.name} at ${till.site}.`}
      quiet={`Paired ${pairedWhen(till.pairedAt)} by ${till.pairedBy}.`}
      step={2}
      till={till.name}
    />
  );

  if (people.isLoading) {
    return (
      <div className="gate">
        <div className="gate-form" aria-busy="true">
          <span className="skeleton is-name" />
          <span className="skeleton is-line" />
        </div>
        {side}
      </div>
    );
  }

  if (people.isError || !people.data) {
    return (
      <div className="gate">
        <div className="gate-form">
          <h1 className="text-display">The till cannot reach the shop</h1>
          <ErrorLine large>{getApiErrorMessage(people.error)}</ErrorLine>
          <button type="button" className="btn btn-lg" onClick={() => void people.refetch()}>
            Try again
          </button>
        </div>
        {side}
      </div>
    );
  }

  return <WhoSells people={people.data} side={side} leave={leave} refresh={() => people.refetch()} />;
}

/* ─── Who is selling? ─────────────────────────────────────────────────── */

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
      // No note is a screen without its first sentence, nothing worse.
    }
  }, []);
  return note;
}

function WhoSells({
  people,
  side,
  leave,
  refresh,
}: {
  people: TillPerson[];
  side: React.ReactNode;
  leave: Leave;
  refresh: () => Promise<{ data?: TillPerson[] }>;
}) {
  const [step, setStep] = React.useState<Step>({ at: "who" });
  const signedOut = useSignedOutNote();
  // Signed out from the lock with "Use my password": open on their password, once.
  const [resumed, setResumed] = React.useState<SignedOutNote | null>(null);
  if (signedOut && signedOut !== resumed) {
    setResumed(signedOut);
    const person = signedOut.next === "password" ? people.find((entry) => entry.userId === signedOut.userId) : undefined;
    if (person) setStep({ at: "password", person, purpose: "instead" });
  }
  // Steps hold the person as they were picked; the list is what is true now.
  const now = (person: TillPerson) => people.find((entry) => entry.userId === person.userId) ?? person;
  const elsewhere = people.find((person) => person.openShift && !person.openShift.here);
  const back = () => setStep({ at: "who" });
  const pick = (person: TillPerson) =>
    setStep(
      !person.hasPin
        ? { at: "password", person, purpose: "first" }
        : person.pinLocked
          ? { at: "locked", person }
          : { at: "pin", person },
    );
  /** A refusal that changes the step rather than showing a line. */
  const follow = async (person: TillPerson, refusal: Refusal) => {
    if (refusal.leave) return leave(refusal.leave);
    if (refusal.step === "locked") {
      const fresh = (await refresh()).data?.find((entry) => entry.userId === person.userId);
      setStep({ at: "locked", person: fresh ?? person });
    } else if (refusal.step === "first") {
      setStep({ at: "password", person, purpose: "first" });
    }
  };

  if (step.at === "pin") {
    return (
      <div className="gate">
        <PinStep person={step.person} onBack={back} onSignedIn={() => leave("till")} onRefusal={(refusal) => follow(step.person, refusal)} />
        {side}
      </div>
    );
  }
  if (step.at === "password") {
    return (
      <div className="gate">
        <PasswordStep
          key={`${step.person.userId}-${step.purpose}-${step.error ?? ""}`}
          person={step.person}
          purpose={step.purpose}
          initialError={step.error}
          onBack={back}
          onSignedIn={() => leave("till")}
          onRefusal={(refusal) => follow(step.person, refusal)}
          onPick={(password) => setStep({ at: "pick", person: step.person, password })}
        />
        {side}
      </div>
    );
  }
  if (step.at === "pick") {
    return (
      <div className="gate">
        <PickPinStep
          person={step.person}
          password={step.password}
          onBack={back}
          onSignedIn={() => leave("till")}
          onWrongPassword={(error) => setStep({ at: "password", person: step.person, purpose: "first", error })}
          onHasPin={() => setStep({ at: "pin", person: step.person })}
          onRefusal={(refusal) => follow(step.person, refusal)}
        />
        {side}
      </div>
    );
  }
  if (step.at === "locked") {
    const person = now(step.person);
    const name = firstName(person.label);
    return (
      <div className="gate">
        <div className="gate-form">
          <div className="who-head">
            <Avatar name={person.label} size={40} />
            <div>
              <h1 className="text-title">Too many wrong PINs</h1>
              <p className="muted">
                {person.lockedUntil
                  ? `${name}’s PIN works again at ${hhmm(person.lockedUntil)}`
                  : `${name}’s PIN is resting for 15 minutes`}
              </p>
            </div>
          </div>
          <PinDots length={4} wrong label="PIN locked" />
          <p>
            Until then {name} signs in with their password, or someone else sells. A manager can set a new PIN under
            People in Management.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-lg grow" onClick={() => setStep({ at: "password", person, purpose: "instead" })}>
              <Key className="ic" />
              Use my password
            </button>
            <button type="button" className="btn btn-lg grow" onClick={back}>
              <UserSwitch className="ic" />
              Someone else
            </button>
          </div>
        </div>
        {side}
      </div>
    );
  }

  return (
    <div className="gate">
      <div className="gate-form">
        {signedOut ? (
          <div className="banner is-ringed" role="status">
            <LogOut className="ic" />
            <span>
              <b className="weight-500">
                {signedOut.name} signed out at {hhmm(signedOut.at)}.
              </b>{" "}
              {signedOut.shiftNo ? (
                <>
                  Shift <span className="num">{signedOut.shiftNo}</span> is still open on {signedOut.till ?? "this till"}
                  {signedOut.held ? `, with ${count(signedOut.held, "held sale")}` : ""}.
                </>
              ) : null}
            </span>
          </div>
        ) : null}
        <div>
          <h1 className="text-display">Who is selling?</h1>
          <p className="under">Pick your name, then type your PIN.</p>
        </div>
        <div className="people">
          {people.map((person) => (
            <button key={person.userId} type="button" className="pay" onClick={() => pick(person)}>
              <Avatar name={person.label} />
              <span>
                <span className="block">{person.label}</span>
              </span>
              <span className="push-right">
                {person.openShift?.here ? (
                  <span className="status status-info">Open here</span>
                ) : person.openShift ? (
                  <span className="status status-warning">Open on {person.openShift.till}</span>
                ) : !person.hasPin ? (
                  <span className="note">No PIN yet</span>
                ) : person.pinLocked ? (
                  <span className="note">PIN resting</span>
                ) : null}
              </span>
              <CaretRight className="ic" />
            </button>
          ))}
        </div>
        <p className="help">
          Someone missing is added under People in Management.
          {elsewhere
            ? ` ${firstName(elsewhere.label)} closes their shift on ${elsewhere.openShift?.till} before they can sell here.`
            : ""}
        </p>
      </div>
      {side}
    </div>
  );
}

/* ─── Signing in ──────────────────────────────────────────────────────── */

/** What a sign-in that never reached the server says. */
const UNREACHABLE = "The till cannot reach the shop. Try again.";

/** A refused sign-in: a line to show, or where the gate goes instead. */
type Refusal = { message: string; step?: "locked" | "first"; leave?: "pair" | "unpaired" };

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
  if (kind === "LOCKED") return { message: "Too many wrong PINs.", step: "locked" };
  if (kind === "NO_PIN") return { message: "Set a PIN first.", step: "first" };
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
  onBack: () => void;
  onSignedIn: () => void;
  /** A refusal that moves the gate: a resting PIN, no PIN yet, or a device that is not a till. */
  onRefusal: (refusal: Refusal) => void;
};

function PinStep({ person, onBack, onSignedIn, onRefusal }: SignInProps) {
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
    <div className="gate-form">
      <div className="who-head">
        <Avatar name={person.label} size={40} />
        <div>
          <h1 className="text-title">{person.label}</h1>
          <p className="muted">Type your PIN</p>
        </div>
      </div>
      <PinDots length={pin.length} wrong={Boolean(error)} />
      {error ? <ErrorLine large>{error}</ErrorLine> : <span className="help">{person.outcome}</span>}
      <Keypad onKey={onKey} disabled={busy} />
      <button type="button" className="btn btn-quiet" onClick={onBack}>
        <CaretLeft className="ic" />
        Not {firstName(person.label)}
      </button>
    </div>
  );
}

function PasswordStep({
  person,
  purpose,
  initialError,
  onBack,
  onSignedIn,
  onRefusal,
  onPick,
}: SignInProps & {
  purpose: "first" | "instead";
  initialError?: string;
  onPick: (password: string) => void;
}) {
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(initialError ?? null);
  const id = React.useId();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError("Type your password.");
      return;
    }
    if (purpose === "first") {
      onPick(password);
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
    <form className="gate-form" onSubmit={submit}>
      <div className="who-head">
        <Avatar name={person.label} size={40} />
        <div>
          <h1 className="text-title">{person.label}</h1>
          <p className="muted">{purpose === "first" ? "Set a PIN for every till here" : "Sign in with your password"}</p>
        </div>
      </div>
      <div className="field">
        <label htmlFor={id}>Your password</label>
        <input
          id={id}
          className="input input-lg"
          type="password"
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
        {error ? (
          <ErrorLine id={`${id}-error`}>{error}</ErrorLine>
        ) : purpose === "first" ? (
          <span className="help">Only this once. After it, your PIN opens the till.</span>
        ) : null}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-lg" onClick={onBack}>
          <CaretLeft className="ic" />
          Not {firstName(person.label)}
        </button>
        <button type="submit" className="btn btn-primary btn-lg grow" aria-busy={busy || undefined} disabled={busy}>
          {purpose === "first" ? (
            <>
              <Key className="ic" />
              Pick a PIN
            </>
          ) : (
            <>
              <CaretRight className="ic" />
              Sign in
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function PickPinStep({
  person,
  password,
  onBack,
  onSignedIn,
  onRefusal,
  onWrongPassword,
  onHasPin,
}: SignInProps & {
  password: string;
  /** A wrong password goes back to the password: that is where it is fixed. */
  onWrongPassword: (message: string) => void;
  /** Someone set a PIN for this person meanwhile: type it instead. */
  onHasPin: () => void;
}) {
  const [first, setFirst] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async (pin: string) => {
    setBusy(true);
    try {
      await fetchJson("/api/v2/retail/devices/first-pin", {
        method: "POST",
        body: JSON.stringify({ userId: person.userId, password, pin }),
      });
    } catch (caught) {
      setBusy(false);
      setFirst("");
      setAgain("");
      const code = caught instanceof ApiError ? (caught.details as { code?: string } | undefined)?.code : undefined;
      if (code === "DEVICE_UNPAIRED") return onRefusal({ message: "", leave: "unpaired" });
      if (code === "NOT_A_TILL") return onRefusal({ message: "", leave: "pair" });
      if (caught instanceof ApiError && caught.status === 403) return onWrongPassword(caught.message);
      if (caught instanceof ApiError && caught.status === 409) return onHasPin();
      setError(caught instanceof ApiError ? caught.message : UNREACHABLE);
      return;
    }
    const refusal = await tillSignIn({ userId: person.userId, pin }, person);
    if (!refusal) return onSignedIn();
    setBusy(false);
    setFirst("");
    setAgain("");
    if (refusal.step || refusal.leave) return onRefusal(refusal);
    setError(refusal.message);
  };

  const onKey = (key: KeypadKey) => {
    if (busy) return;
    setError(null);
    const typingAgain = first.length === 4;
    const current = typingAgain ? again : first;
    const set = typingAgain ? setAgain : setFirst;
    if (key.kind === "delete") {
      if (typingAgain && again.length === 0) setFirst(first.slice(0, -1));
      else set(current.slice(0, -1));
      return;
    }
    if (key.kind !== "digit" || current.length >= 4) return;
    const next = current + key.value;
    set(next);
    if (typingAgain && next.length === 4) {
      if (next !== first) {
        setError("The two PINs are different. Type it again.");
        setFirst("");
        setAgain("");
        return;
      }
      void save(next);
    }
  };
  useKeypadKeys(onKey);

  return (
    <div className="gate-form">
      <div className="who-head">
        <Avatar name={person.label} size={40} />
        <div>
          <h1 className="text-title">Pick a PIN</h1>
          <p className="muted">Four digits, typed twice</p>
        </div>
      </div>
      <div className="stack-12">
        <span className="label">PIN</span>
        <PinDots length={first.length} wrong={Boolean(error)} />
        <span className="label">Again</span>
        <PinDots length={again.length} wrong={Boolean(error)} />
      </div>
      {error ? (
        <ErrorLine large>{error}</ErrorLine>
      ) : (
        <span className="help">Not four of the same digit and not four in a row, like 1111 or 1234.</span>
      )}
      <Keypad onKey={onKey} disabled={busy} />
      <button type="button" className="btn btn-quiet" onClick={onBack}>
        <CaretLeft className="ic" />
        Not {firstName(person.label)}
      </button>
    </div>
  );
}
