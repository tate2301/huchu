"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { PosNumericKeypad } from "@/components/retail/portal/pos-numeric-keypad";
import type { PosKeypadAction } from "@/components/retail/portal/pos-numeric-input";
import { fetchJson } from "@/lib/api-client";
import { wrongPinSentence } from "@/lib/retail/device-words";
import { TILL_PIN_LENGTH } from "@/lib/retail/till-pin";

import "./device-screen.css";

type Person = { userId: string; label: string };

/** The till PIN's own lock sentence (`pos/pin/unlock`). */
const LOCKED = "Too many wrong PINs. Sign in with your password to carry on.";

/**
 * "Who is selling?" (10-setup W-04 step 7, TillPairing panel 3): the till is
 * known; a person says who they are with their PIN. A chip per person who may
 * sell here, four dots, the keypad. The fourth digit signs in with the
 * `till-pin` provider, which reads this device's key from its cookie.
 */
export function WhoIsSelling({
  base,
  eyebrow,
  footnote,
}: {
  /** "" on the POS host, "/portal/pos" on the tenant host. */
  base: string;
  eyebrow: string;
  footnote: string;
}) {
  const people = useQuery({
    queryKey: ["till-people"],
    queryFn: () => fetchJson<{ data: Person[] }>("/api/v2/retail/devices/people"),
  });
  const list = people.data?.data ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = picked && list.some((person) => person.userId === picked) ? picked : (list[0]?.userId ?? null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (userId: string, digits: string) => {
      setBusy(true);
      const result = await signIn("till-pin", { userId, pin: digits, redirect: false });
      if (result?.ok && !result.error) {
        window.location.assign(base || "/");
        return;
      }
      const reason = result?.error ?? "";
      setBusy(false);
      setPin("");
      if (reason === "NOT_A_TILL") return window.location.assign(`${base}/pair`);
      if (reason === "DEVICE_UNPAIRED") return window.location.assign(`${base}/unpaired`);
      setShake(true);
      if (reason === "LOCKED") {
        setLocked(true);
        setError(LOCKED);
        return;
      }
      const left = /^WRONG_PIN:(\d+)$/.exec(reason);
      setError(left ? wrongPinSentence(Number(left[1])) : "That did not work. Try your PIN again.");
    },
    [base],
  );

  const press = useCallback(
    (action: PosKeypadAction) => {
      if (busy || !chosen) return;
      setShake(false);
      if (action.type === "backspace") return setPin((current) => current.slice(0, -1));
      if (action.type === "clear") return setPin("");
      if (action.type !== "digit") return;
      setError(locked ? LOCKED : null);
      const next = `${pin}${action.value}`.slice(0, TILL_PIN_LENGTH);
      setPin(next);
      if (next.length === TILL_PIN_LENGTH) void send(chosen, next);
    },
    [busy, chosen, locked, pin, send],
  );

  // A keyboard (or a browser till's number row) types the PIN too.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (/^\d$/.test(event.key)) press({ type: "digit", value: event.key });
      else if (event.key === "Backspace") press({ type: "backspace" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <main className="device-screen" data-theme="tender-dark">
      <section className="device-card" aria-labelledby="who-title">
        <span className="device-eyebrow">{eyebrow}</span>
        <h1 id="who-title" className="device-title">Who is selling?</h1>
        {people.isLoading ? (
          <p className="device-body">Loading the people who sell here…</p>
        ) : people.isError ? (
          <p className="device-error" role="alert">
            The till could not load who sells here.{" "}
            <button type="button" className="device-link" style={{ background: "none", border: 0, padding: 0, font: "inherit" }} onClick={() => void people.refetch()}>
              Try again
            </button>
          </p>
        ) : list.length === 0 ? (
          <p className="device-body">
            Nobody who sells here has a PIN yet. <a className="device-link" href={`${base}/login`}>Sign in with a password</a>
          </p>
        ) : (
          <>
            <div className="device-chips" role="group" aria-label="Who is selling">
              {list.map((person) => (
                <button
                  key={person.userId}
                  type="button"
                  className="device-chip"
                  aria-pressed={person.userId === chosen}
                  onClick={() => {
                    setPicked(person.userId);
                    setPin("");
                    setError(null);
                    setLocked(false);
                  }}
                >
                  {person.label}
                </button>
              ))}
            </div>
            <div className="device-dots" data-shake={shake ? "true" : undefined} aria-label={`${pin.length} of ${TILL_PIN_LENGTH} digits`}>
              {Array.from({ length: TILL_PIN_LENGTH }, (_, index) => (
                <span key={index} className="device-dot" data-filled={index < pin.length ? "true" : undefined} />
              ))}
            </div>
            {error ? (
              <p className="device-error" role="alert">
                {error}
                {locked ? (
                  <>
                    {" "}
                    <a className="device-link" href={`${base}/login`}>Sign in with a password</a>
                  </>
                ) : null}
              </p>
            ) : null}
            <PosNumericKeypad onAction={press} decimal={false} />
          </>
        )}
        <span className="device-foot">{footnote}</span>
      </section>
    </main>
  );
}
