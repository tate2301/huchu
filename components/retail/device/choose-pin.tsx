"use client";

import { useCallback, useEffect, useState } from "react";

import { PosNumericKeypad } from "@/components/retail/portal/pos-numeric-keypad";
import type { PosKeypadAction } from "@/components/retail/portal/pos-numeric-input";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { TILL_PIN_LENGTH } from "@/lib/retail/till-pin";

import "./device-screen.css";

const MISMATCH = "Those two do not match. Try again.";

/**
 * "Choose your own PIN" (80-admin 5.14, ADM-03): a person who opened the till
 * with a PIN somebody sent them picks their own before it opens — four digits,
 * then "Type it again", then `POST /api/v2/retail/pos/pin/change { newPin }`.
 * The server's refusals ("Pick a PIN that is not the one you were sent.") show
 * under the dots and start again.
 */
export function ChooseYourPin({ name, onChosen }: { name: string; onChosen: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  const refuse = useCallback((sentence: string) => {
    setFirst(null);
    setPin("");
    setError(sentence);
    setShake(true);
  }, []);

  const save = useCallback(
    async (digits: string) => {
      setBusy(true);
      try {
        await fetchJson("/api/v2/retail/pos/pin/change", { method: "POST", body: JSON.stringify({ newPin: digits }) });
        onChosen();
      } catch (caught) {
        const fieldErrors =
          caught instanceof ApiError ? (caught.details as { fieldErrors?: Record<string, string> } | undefined)?.fieldErrors : undefined;
        refuse(fieldErrors?.newPin ?? fieldErrors?.currentPin ?? getApiErrorMessage(caught));
      } finally {
        setBusy(false);
      }
    },
    [onChosen, refuse],
  );

  const press = useCallback(
    (action: PosKeypadAction) => {
      if (busy) return;
      setShake(false);
      if (action.type === "backspace") return setPin((current) => current.slice(0, -1));
      if (action.type === "clear") return setPin("");
      if (action.type !== "digit") return;
      setError(null);
      const next = `${pin}${action.value}`.slice(0, TILL_PIN_LENGTH);
      setPin(next);
      if (next.length < TILL_PIN_LENGTH) return;
      if (first === null) {
        setFirst(next);
        setPin("");
      } else if (next !== first) {
        refuse(MISMATCH);
      } else {
        void save(next);
      }
    },
    [busy, first, pin, refuse, save],
  );

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (/^\d$/.test(event.key)) press({ type: "digit", value: event.key });
      else if (event.key === "Backspace") press({ type: "backspace" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="choose-pin-title">
      <main className="device-screen" data-theme="tender-dark">
        <section className="device-card">
          <span className="device-eyebrow">{name}</span>
          <h1 id="choose-pin-title" className="device-title">
            {first === null ? "Choose your own PIN" : "Type it again"}
          </h1>
          <p className="device-body">
            {first === null
              ? "Four digits only you know, in place of the one you were sent."
              : "The same four digits, to be sure."}
          </p>
          <div
            className="device-dots"
            data-shake={shake ? "true" : undefined}
            aria-label={`${pin.length} of ${TILL_PIN_LENGTH} digits`}
          >
            {Array.from({ length: TILL_PIN_LENGTH }, (_, index) => (
              <span key={index} className="device-dot" data-filled={index < pin.length ? "true" : undefined} />
            ))}
          </div>
          {error ? (
            <p className="device-error" role="alert">
              {error}
            </p>
          ) : null}
          <PosNumericKeypad onAction={press} decimal={false} />
        </section>
      </main>
    </div>
  );
}
