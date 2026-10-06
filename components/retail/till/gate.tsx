"use client";

/**
 * "Who is selling?" and their PIN: the POS host's signed-out `/` on a till.
 *
 * The device's key (the httpOnly cookie a manager's pairing code issued) says
 * which till this is; the PIN says who (`till-pin`). The list is the people
 * holding a till PIN, which a manager sends from People (ADM-02, ADM-03). Five
 * wrong PINs lock it until a new one is sent; meanwhile the account password
 * signs in instead. A PIN that was sent is changed for one of their own on
 * first use, over the till (`lock.tsx`). Opening the shift comes after
 * sign-in, on the till.
 */

import * as React from "react";
import { signIn } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CaretLeft, CaretRight, Key, LogOut, UserSwitch } from "@/lib/icons";
import type { TillPerson } from "@/lib/retail/devices";
import { TILL_PIN_LOCKED } from "@/lib/retail/till-pin";
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
    if (person) setStep({ at: "password", person });
  }
  // Steps hold the person as they were picked; the list is what is true now.
  const now = (person: TillPerson) => people.find((entry) => entry.userId === person.userId) ?? person;
  const elsewhere = people.find((person) => person.openShift && !person.openShift.here);
  const back = () => setStep({ at: "who" });
  const pick = (person: TillPerson) => setStep(person.pinLocked ? { at: "locked", person } : { at: "pin", person });
  /** A refusal that changes the step rather than showing a line. */
  const follow = async (person: TillPerson, refusal: Refusal) => {
    if (refusal.leave) return leave(refusal.leave);
    if (refusal.step === "locked") {
      const fresh = (await refresh()).data?.find((entry) => entry.userId === person.userId);
      setStep({ at: "locked", person: fresh ?? person });
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
          key={step.person.userId}
          person={step.person}
          onBack={back}
          onSignedIn={() => leave("till")}
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
              <h1 className="text-title">{name}’s PIN is locked</h1>
              <p className="muted">{TILL_PIN_LOCKED}</p>
            </div>
          </div>
          <PinDots length={4} wrong label="PIN locked" />
          <p>Until a new one comes, {name} signs in with their password, or someone else sells.</p>
          <div className="actions">
            <button type="button" className="btn btn-lg grow" onClick={() => setStep({ at: "password", person })}>
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
                ) : person.pinLocked ? (
                  <span className="note">Locked</span>
                ) : null}
              </span>
              <CaretRight className="ic" />
            </button>
          ))}
        </div>
        <p className="help">
          Someone missing is sent a PIN from People in Management.
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
  onBack: () => void;
  onSignedIn: () => void;
  /** A refusal that moves the gate: a locked PIN, or a device that is not a till. */
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

function PasswordStep({ person, onBack, onSignedIn, onRefusal }: SignInProps) {
  const [password, setPassword] = React.useState("");
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
    <form className="gate-form" onSubmit={submit}>
      <div className="who-head">
        <Avatar name={person.label} size={40} />
        <div>
          <h1 className="text-title">{person.label}</h1>
          <p className="muted">Sign in with your password</p>
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
        {error ? <ErrorLine id={`${id}-error`}>{error}</ErrorLine> : null}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-lg" onClick={onBack}>
          <CaretLeft className="ic" />
          Not {firstName(person.label)}
        </button>
        <button type="submit" className="btn btn-primary btn-lg grow" aria-busy={busy || undefined} disabled={busy}>
          <CaretRight className="ic" />
          Sign in
        </button>
      </div>
    </form>
  );
}
