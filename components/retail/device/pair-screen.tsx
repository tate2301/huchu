"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

import "./device-screen.css";

const LENGTH = 6;

type PairAnswer = { till?: { id: string; name: string }; error?: string; code?: string };

/**
 * Pair this device (10-setup W-04 step 5, TillPairing panel 1): six digit
 * boxes, a dash after the third; typing moves on, pasting fills them all, and
 * the sixth digit sends the code. "Scan it instead" only in the Kora shell,
 * whose scanner types the QR's `tender-pair:482917` like a keyboard.
 */
export function PairScreen({ home, kora }: { home: string; kora: boolean }) {
  const [digits, setDigits] = useState<string[]>(() => Array(LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const scan = useRef<HTMLInputElement | null>(null);

  const focus = (index: number) => boxes.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus();

  const submit = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/retail/devices/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      const answer = (await response.json().catch(() => ({}))) as PairAnswer;
      if (response.ok) {
        window.location.assign(home);
        return;
      }
      setError(answer.error ?? "That code did not work.");
      setDigits(Array(LENGTH).fill(""));
      focus(0);
    } catch {
      setError("The till could not reach the shop. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const fill = (from: number, typed: string) => {
    const incoming = typed.replace(/\D/g, "").slice(0, LENGTH - from).split("");
    if (incoming.length === 0) return;
    const next = [...digits];
    incoming.forEach((digit, offset) => {
      next[from + offset] = digit;
    });
    setDigits(next);
    const filled = next.join("");
    if (filled.length === LENGTH && !busy) void submit(filled);
    else focus(from + incoming.length);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      focus(index - 1);
    } else if (event.key === "ArrowLeft") {
      focus(index - 1);
    } else if (event.key === "ArrowRight") {
      focus(index + 1);
    }
  };

  const onPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    fill(index, event.clipboardData.getData("text"));
  };

  const onScanned = (value: string) => {
    const code = /(\d{3})\D?(\d{3})/.exec(value);
    if (code) fill(0, `${code[1]}${code[2]}`);
  };

  return (
    <main className="device-screen" data-theme="tender-dark">
      <section className="device-card" aria-labelledby="pair-title">
        <span className="device-eyebrow">Tender · not a till yet</span>
        <h1 id="pair-title" className="device-title">Pair this device</h1>
        <p className="device-body">Type the code from Management › Tills and devices.</p>
        <div className="device-boxes" role="group" aria-label="Pairing code">
          {digits.map((digit, index) => (
            <span key={index} style={{ display: "contents" }}>
              {index === 3 ? <span className="device-dash" aria-hidden="true">–</span> : null}
              <input
                ref={(element) => {
                  boxes.current[index] = element;
                }}
                className="device-box"
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={1}
                aria-label={`Digit ${index + 1}`}
                aria-invalid={error ? true : undefined}
                autoFocus={index === 0}
                disabled={busy}
                value={digit}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, "");
                  if (value) fill(index, value);
                  else {
                    const next = [...digits];
                    next[index] = "";
                    setDigits(next);
                  }
                }}
                // Typing over a digit replaces it.
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => onKeyDown(index, event)}
                onPaste={(event) => onPaste(index, event)}
              />
            </span>
          ))}
        </div>
        {error ? (
          <p className="device-error" role="alert">
            {error}
          </p>
        ) : null}
        {kora ? (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="device-button" onClick={() => scan.current?.focus()}>
                Scan it instead
              </button>
            </div>
            <input
              ref={scan}
              className="device-scan"
              aria-label="Scanned code"
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onScanned(event.currentTarget.value);
                  event.currentTarget.value = "";
                }
              }}
            />
          </>
        ) : null}
        <span className="device-foot">Price check works before pairing. Selling does not.</span>
      </section>
    </main>
  );
}
