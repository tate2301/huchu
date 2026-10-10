"use client";

/**
 * The device's door, before it is a till: pair it with a manager's code
 * (`/pair`), typed or read from the QR, and what it says once it is no longer
 * one (`/unpaired`).
 *
 * Pairing happens on the POS host only (`devices/pair`), which sets the
 * httpOnly `tender_device` key. The page then loads the till's root afresh, so
 * the proxy sees the key and shows a signed-out `/` as "Who is selling?".
 */

import * as React from "react";

import { ApiError, fetchJson } from "@/lib/api-client";
import { Keyboard, Link, QrCode, Tag } from "@/lib/icons";
import type { NoLongerFacts } from "@/lib/retail/devices";
import { firstName, hhmm, pairedWhen } from "./format";
import {
  NOT_A_PAIRING_QR,
  SCAN_FAILURE,
  SCAN_FOR_MS,
  cameraFailure,
  pairingCodeFrom,
  qrDetector,
  type QrDetector,
  type ScanFailure,
} from "./pair-scan";
import { CodeBoxes, ErrorLine, GateSide, Keypad, useKeypadKeys, type KeypadKey } from "./parts";

export type { NoLongerFacts };

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
  // The Kora's own scanner, which types the code.
  const [scanning, setScanning] = React.useState(false);
  // Any other device: its camera, read by the browser's detector.
  const [camera, setCamera] = React.useState<QrDetector | null>(null);
  const [scanFailed, setScanFailed] = React.useState<ScanFailure | null>(null);
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

  const fresh = () => {
    setCode("");
    setWrong(false);
    setError(null);
    setScanFailed(null);
  };

  const scan = async () => {
    fresh();
    if (kora) {
      // The scanner types the code's digits: start it on empty boxes.
      setScanning(true);
      return;
    }
    const detector = await qrDetector();
    if (detector === "unsupported") setScanFailed("unsupported");
    else setCamera(detector);
  };

  // A pairing QR is the code, typed for them: it pairs exactly as the keypad does.
  const read = (digits: string) => {
    setCamera(null);
    setCode(digits);
    void submit(digits);
  };
  const failed = (failure: ScanFailure) => {
    setCamera(null);
    setScanFailed(failure);
  };

  const locked = Boolean(lockedUntil);
  const onKey = (key: KeypadKey) => {
    if (busy || locked) return;
    // A key typed while the camera looks: they chose to type.
    setCamera(null);
    setScanFailed(null);
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
            {camera
              ? "Hold the QR on the manager’s screen up to the camera."
              : `Type the code a manager made under Tills and devices in Management.${wrong ? "" : " It works once, for 10 minutes."}`}
          </p>
        </div>
        {camera ? (
          <QrCamera detector={camera} onCode={read} onFail={failed} />
        ) : (
          <>
            <CodeBoxes value={code} wrong={wrong} />
            {error ? (
              <ErrorLine large>{lockedUntil ? `Too many tries. Try again at ${hhmm(new Date(lockedUntil))}.` : error}</ErrorLine>
            ) : scanFailed ? (
              <ErrorLine large>{SCAN_FAILURE[scanFailed]}</ErrorLine>
            ) : scanning ? (
              <span className="help">Hold the code on the manager’s screen up to the scanner.</span>
            ) : null}
            <Keypad onKey={onKey} left="clear" disabled={busy || locked} />
          </>
        )}
        <div className="btn-group" role="group" aria-label="Other ways in">
          {camera ? (
            <button type="button" className="btn btn-lg grow" onClick={() => setCamera(null)}>
              <Keyboard className="ic" />
              Type the code instead
            </button>
          ) : (
            <button type="button" className="btn btn-lg grow" disabled={busy || locked} onClick={() => void scan()}>
              <QrCode className="ic" />
              {scanFailed === "nothing-seen" || scanFailed === "wrong-qr" ? "Scan again" : "Scan the QR instead"}
            </button>
          )}
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

/**
 * The camera, looking for the pairing QR five times a second until it finds
 * one, fails, or gives up after `SCAN_FOR_MS`. Leaving stops the camera.
 */
function QrCamera({
  detector,
  onCode,
  onFail,
}: {
  detector: QrDetector;
  onCode: (code: string) => void;
  onFail: (failure: ScanFailure) => void;
}) {
  const video = React.useRef<HTMLVideoElement>(null);
  const [stray, setStray] = React.useState(false);
  const handlers = React.useRef({ onCode, onFail });
  React.useEffect(() => {
    handlers.current = { onCode, onFail };
  });

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let next = 0;
    let giveUp = 0;
    let done = false;
    let sawStray = false;
    const stop = () => {
      done = true;
      window.clearTimeout(next);
      window.clearTimeout(giveUp);
      stream?.getTracks().forEach((track) => track.stop());
    };
    const end = (then: () => void) => {
      if (done) return;
      stop();
      then();
    };
    giveUp = window.setTimeout(() => end(() => handlers.current.onFail(sawStray ? "wrong-qr" : "nothing-seen")), SCAN_FOR_MS);

    const look = async () => {
      if (done) return;
      const element = video.current;
      if (element && element.readyState >= element.HAVE_CURRENT_DATA) {
        try {
          const found = await detector.detect(element);
          const digits = found.map((entry) => pairingCodeFrom(entry.rawValue)).find(Boolean);
          if (digits) return end(() => handlers.current.onCode(digits));
          if (found.length && !done) {
            sawStray = true;
            setStray(true);
          }
        } catch {
          // A frame it could not read; the next one may do.
        }
      }
      if (!done) next = window.setTimeout(() => void look(), 200);
    };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }).then(
      (media) => {
        if (done) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        if (video.current) {
          video.current.srcObject = media;
          video.current.play().catch(() => null);
        }
        void look();
      },
      (refusal: unknown) => end(() => handlers.current.onFail(cameraFailure(refusal))),
    );
    return stop;
  }, [detector]);

  return (
    <>
      <div className="qr-cam">
        <video ref={video} muted playsInline aria-hidden="true" />
        <span className="frame" aria-hidden="true" />
      </div>
      {stray ? (
        <ErrorLine large>{NOT_A_PAIRING_QR}</ErrorLine>
      ) : (
        <span className="help" role="status">
          Looking for the QR.
        </span>
      )}
    </>
  );
}

/* ─── Replaced or unpaired ────────────────────────────────────────────── */

/** "CounterMini", "Kora", "Windows PC"; a browser nothing more is known of is a browser. */
const deviceNoun = (device: NonNullable<NoLongerFacts["replacement"]>) =>
  device.kind === "COUNTER_MINI" ? "CounterMini" : device.kind === "KORA" ? "Kora" : device.label || "browser";

export function NoLongerDoor({ base, host, facts }: { base: string; host: string; facts: NoLongerFacts }) {
  const [busy, setBusy] = React.useState(false);
  const replacement = facts.replacement;
  const what =
    facts.reason !== "REPLACED"
      ? `${facts.by || "A manager"} unpaired it from ${facts.till} ${pairedWhen(facts.at)}.`
      : replacement
        ? `${replacement.by || "A manager"} paired a new ${deviceNoun(replacement)} ${pairedWhen(replacement.at)}.`
        : `${facts.by || "A manager"} paired another device to ${facts.till} ${pairedWhen(facts.at)}.`;
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
          {facts.shift ? (
            <>
              <dt>{firstName(facts.shift.cashier)}’s shift</dt>
              <dd>Carries on on the new device</dd>
            </>
          ) : null}
          <dt>This device</dt>
          <dd>Checks prices until it is paired again</dd>
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
          <Link className="ic" />
          Pair it to a till
        </button>
      </div>
      <GateSide lede={host} quiet="Not a till yet. Price check works; selling does not." step={1} />
    </div>
  );
}
