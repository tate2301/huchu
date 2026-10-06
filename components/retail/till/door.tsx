"use client";

/**
 * The device's door, before it is a till: pair it with a manager's code
 * (`/pair`), and what it says once it is no longer one (`/unpaired`).
 *
 * Pairing happens on the POS host only (`devices/pair`), which sets the
 * httpOnly `tender_device` key. The page then loads the till's root afresh, so
 * the proxy sees the key and shows a signed-out `/` as "Who is selling?".
 */

import * as React from "react";

import { ApiError, fetchJson } from "@/lib/api-client";
import { CaretRight, QrCode, Tag } from "@/lib/icons";
import { hhmm, pairedWhen } from "./format";
import { CodeBoxes, ErrorLine, GateSide, Keypad, useKeypadKeys, type KeypadKey } from "./parts";

/** What a pairing that never reached the server says. */
const UNREACHABLE = "The till cannot reach the shop. Check the connection and try again.";

/* ─── 1. Pair this device ─────────────────────────────────────────────── */

export function PairDoor({
  base,
  host,
  kora,
}: {
  /** "" on the POS host, "/portal/pos" elsewhere. */
  base: string;
  host: string;
  /** The Kora shell, whose scanner types the QR's `tender-pair:482917` like a keyboard. */
  kora: boolean;
}) {
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [wrong, setWrong] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  // Five wrong codes stop this device for a while; the keypad waits with it.
  const [lockedUntil, setLockedUntil] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!lockedUntil) return;
    const timer = window.setTimeout(() => {
      setLockedUntil(null);
      setWrong(false);
      setError(null);
      setCode("");
    }, Math.max(0, lockedUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [lockedUntil]);

  const submit = async (full: string) => {
    setBusy(true);
    try {
      await fetchJson("/api/v2/retail/devices/pair", { method: "POST", body: JSON.stringify({ code: full }) });
      window.location.assign(base || "/");
      return;
    } catch (caught) {
      const details =
        caught instanceof ApiError ? (caught.details as { code?: string; lockedUntil?: string } | undefined) : undefined;
      if (details?.code === "LOCKED" && details.lockedUntil) setLockedUntil(Date.parse(details.lockedUntil));
      setWrong(true);
      setScanning(false);
      setError(caught instanceof ApiError ? caught.message : UNREACHABLE);
    }
    setBusy(false);
  };

  const locked = Boolean(lockedUntil);
  const onKey = (key: KeypadKey) => {
    if (busy || locked) return;
    if (wrong) {
      setWrong(false);
      setError(null);
      setCode(key.kind === "digit" ? key.value : "");
      return;
    }
    if (key.kind === "clear") setCode("");
    else if (key.kind === "delete") setCode((current) => current.slice(0, -1));
    else if (key.kind === "digit" && code.length < 6) {
      const next = code + key.value;
      setCode(next);
      if (next.length === 6) void submit(next);
    }
  };
  useKeypadKeys(onKey, !locked);

  return (
    <div className="gate">
      <div className="gate-form">
        <div>
          <h1 className="text-display balance">Pair this device</h1>
          <p className="under">
            Type the code a manager made under Tills and devices in Management.
            {wrong ? "" : " It works once, for 10 minutes."}
          </p>
        </div>
        <CodeBoxes value={code} wrong={wrong} />
        {error ? (
          <ErrorLine large>{lockedUntil ? `Too many tries. Try again at ${hhmm(new Date(lockedUntil))}.` : error}</ErrorLine>
        ) : scanning ? (
          <span className="help">Hold the code on the manager’s screen up to the scanner.</span>
        ) : null}
        <Keypad onKey={onKey} left="clear" disabled={busy || locked} />
        <div className="btn-group" role="group" aria-label="Other ways in">
          {kora ? (
            <button
              type="button"
              className="btn btn-lg grow"
              disabled={busy || locked}
              onClick={() => {
                // The scanner types the code's digits: start it on empty boxes.
                setCode("");
                setWrong(false);
                setError(null);
                setScanning(true);
              }}
            >
              <QrCode className="ic" />
              Scan the QR instead
            </button>
          ) : null}
          <a className="btn btn-lg grow" href={`${base}/price-check`}>
            <Tag className="ic" />
            Check a price
          </a>
        </div>
      </div>
      <GateSide lede={host} quiet="Not a till yet. Price check works; selling does not." step={1} />
    </div>
  );
}

/* ─── Replaced or unpaired ────────────────────────────────────────────── */

export type NoLongerFacts = {
  till: string;
  /** REPLACED when a manager paired another device to its till; any other reason reads as unpaired. */
  reason: string;
  by: string | null;
  at: string;
  /** Sales this device held offline that came in after it was unpaired. */
  sent: number;
};

export function NoLongerDoor({ base, host, facts }: { base: string; host: string; facts: NoLongerFacts }) {
  const [busy, setBusy] = React.useState(false);
  const who = facts.by || "A manager";
  const when = ` ${pairedWhen(facts.at)}`;
  const what =
    facts.reason === "REPLACED"
      ? `${who} paired another device to ${facts.till}${when}.`
      : `${who} unpaired it from ${facts.till}${when}.`;
  const sent =
    facts.sent === 1
      ? " The 1 sale saved here was sent first."
      : facts.sent > 1
        ? ` The ${facts.sent} sales saved here were sent first.`
        : "";

  return (
    <div className="gate">
      <div className="gate-form">
        <div>
          <h1 className="text-display balance">This device is no longer a till</h1>
          <p className="under">
            {what}
            {sent}
          </p>
        </div>
        <dl className="attrs">
          <dt>Open shifts</dt>
          <dd>Carry on wherever {facts.till} is now</dd>
          <dt>This device</dt>
          <dd>Sells again once it is paired</dd>
        </dl>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          aria-busy={busy || undefined}
          disabled={busy}
          onClick={async () => {
            // Forget the old key so the device is plainly not a till; the server already ignores it.
            setBusy(true);
            await fetch("/api/v2/retail/devices/forget", { method: "POST", credentials: "include" }).catch(() => null);
            window.location.assign(`${base}/pair`);
          }}
        >
          <CaretRight className="ic" />
          Pair it to a till
        </button>
      </div>
      <GateSide lede={host} quiet="Not a till now." step={1} />
    </div>
  );
}
