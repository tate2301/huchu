"use client";

/**
 * A manager approving at the counter (C-31, FLR-09): one dialog for every
 * till act the rules hold back — a refund over the limit, a void, cash in or
 * out, the drawer opened without a sale, a discount over the cap.
 *
 * `useApproval` wraps the act's request. The request goes as it is first;
 * when the server answers 409 `needsApprover`, the dialog opens with the act's
 * reason ("Refund over US$20.00"), the people who may approve it as chips and
 * four PIN dots over the till's keypad. The fourth digit sends the same
 * request again with `approver: { userId, pin }`. A wrong PIN shakes the dots
 * and clears them, a person who may not approve is unpicked, a locked PIN
 * (423) says ADM-03's sentence; anything else the server refuses closes the
 * dialog and goes back to the act. Cancel sends nothing more.
 *
 * The PIN lives in this dialog only: it is cleared each time it opens, after
 * every refusal, and never queued offline.
 */

import * as React from "react";

import { ApiError } from "@/lib/api-client";
import type { TillApprover } from "@/lib/retail/devices";
import { TILL_PIN_LOCKED } from "@/lib/retail/till-pin";
import { X } from "@/lib/icons";
import { ErrorLine, Keypad, PinDots, TillDialog, useKeypadKeys, type KeypadKey } from "./parts";
import type { Approver } from "./types";

export type { TillApprover };

/** What the server says when a PIN is wrong (C-31's `WRONG_PIN`). */
export const WRONG_PIN = "That PIN is not right.";

type Refusal = { needsApprover?: boolean; reason?: string; fieldErrors?: { pin?: string; approver?: string } };

/** The 409 `needsApprover` that asks for a manager, or null for any other answer. */
function askedFor(error: unknown): Refusal | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const details = error.details as Refusal | undefined;
  return details?.needsApprover ? details : null;
}

type Pending = {
  send: (approver: Approver | null) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

export type ApprovalOptions = {
  /** Who may approve this act: `devices/me`'s list for the right it needs. */
  approvers: readonly TillApprover[];
  /** The act's own line ("Void SALE-31866"); else the server's reason. A function reads the server's. */
  reason?: string | ((serverReason: string) => string);
};

export function useApproval(options: ApprovalOptions) {
  const [reason, setReason] = React.useState<string | null>(null);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [pin, setPin] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const [wrong, setWrong] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const pending = React.useRef<Pending | null>(null);
  const latest = React.useRef(options);
  React.useEffect(() => {
    latest.current = options;
  });

  const close = () => {
    pending.current = null;
    setReason(null);
    setPin("");
    setBusy(false);
  };

  /** Sends the act; asks for a manager when the server does. Resolves null when the approval is cancelled. */
  const run = React.useCallback(<T,>(send: (approver: Approver | null) => Promise<T>): Promise<T | null> => {
    return new Promise<T | null>((resolve, reject) => {
      send(null).then(resolve, (error: unknown) => {
        const asked = askedFor(error);
        if (!asked) return reject(error);
        const { approvers, reason: own } = latest.current;
        const server = asked.reason ?? (error instanceof Error ? error.message : "");
        pending.current = { send, resolve: resolve as (value: unknown) => void, reject };
        setReason(typeof own === "function" ? own(server) : (own ?? server));
        setUserId(approvers.length === 1 ? approvers[0]!.userId : null);
        setPin("");
        setProblem(null);
        setWrong(false);
        setBusy(false);
      });
    });
  }, []);

  const submit = (approver: Approver) => {
    const asking = pending.current;
    if (!asking) return;
    setBusy(true);
    asking.send(approver).then(
      (result) => {
        close();
        asking.resolve(result);
      },
      (error: unknown) => {
        setBusy(false);
        setPin("");
        if (error instanceof ApiError && error.status === 423) {
          // ADM-03: this PIN is locked until a new one is sent; somebody else approves.
          setUserId(null);
          setWrong(true);
          setProblem(TILL_PIN_LOCKED);
          return;
        }
        const asked = askedFor(error);
        if (asked?.fieldErrors?.pin) {
          setWrong(true);
          setProblem(WRONG_PIN);
          return;
        }
        if (asked?.fieldErrors?.approver) {
          setUserId(null);
          setWrong(false);
          setProblem(asked.fieldErrors.approver);
          return;
        }
        if (asked) {
          setProblem(asked.reason ?? WRONG_PIN);
          return;
        }
        close();
        asking.reject(error);
      },
    );
  };

  const cancel = () => {
    const asking = pending.current;
    close();
    asking?.resolve(null);
  };

  const onKey = (key: KeypadKey) => {
    if (busy || !reason) return;
    setWrong(false);
    if (key.kind === "delete") return setPin((current) => current.slice(0, -1));
    if (key.kind === "clear") return setPin("");
    if (key.kind !== "digit" || pin.length >= 4) return;
    if (!userId) {
      setProblem("Pick who approves it first.");
      return;
    }
    setProblem(null);
    const next = pin + key.value;
    setPin(next);
    if (next.length === 4) submit({ userId, pin: next });
  };

  const dialog = (
    <ApprovalDialog
      open={reason !== null}
      reason={reason ?? ""}
      approvers={options.approvers}
      chosen={userId}
      onChoose={(id) => {
        setUserId(id);
        setPin("");
        setProblem(null);
        setWrong(false);
      }}
      pin={pin}
      wrong={wrong}
      problem={problem}
      busy={busy}
      onKey={onKey}
      onCancel={cancel}
    />
  );

  return { run, dialog, asking: reason !== null };
}

/** The dialog itself: the reason, who approves, four dots and the keypad. */
export function ApprovalDialog({
  open,
  reason,
  approvers,
  chosen,
  onChoose,
  pin,
  wrong,
  problem,
  busy,
  onKey,
  onCancel,
}: {
  open: boolean;
  reason: string;
  approvers: readonly TillApprover[];
  chosen: string | null;
  onChoose: (userId: string) => void;
  pin: string;
  wrong: boolean;
  problem: string | null;
  busy: boolean;
  onKey: (key: KeypadKey) => void;
  onCancel: () => void;
}) {
  useKeypadKeys(onKey, open);
  const person = approvers.find((entry) => entry.userId === chosen) ?? null;
  return (
    <TillDialog
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      title="A manager has to approve this"
      description={reason}
      foot={
        <button type="button" className="btn" onClick={onCancel}>
          <X className="ic" />
          Cancel
        </button>
      }
    >
      {approvers.length ? (
        <div className="approvers" role="radiogroup" aria-label="Who approves">
          {approvers.map((entry) => (
            <button
              key={entry.userId}
              type="button"
              role="radio"
              aria-checked={entry.userId === chosen}
              className="btn btn-lg"
              disabled={busy}
              onClick={() => onChoose(entry.userId)}
            >
              {entry.short}
            </button>
          ))}
        </div>
      ) : (
        <p className="help is-flush">Nobody here can approve it with a PIN yet. A manager sets their till PIN first.</p>
      )}
      <div className="approve-pin" aria-busy={busy || undefined}>
        <PinDots
          length={pin.length}
          wrong={wrong}
          label={person ? `${person.short}: ${pin.length} of 4 digits typed` : `${pin.length} of 4 digits typed`}
        />
        {problem ? <ErrorLine>{problem}</ErrorLine> : <span className="help">{person ? `${person.short} types their PIN.` : "Pick who approves, then their PIN."}</span>}
        <Keypad onKey={onKey} disabled={busy || !approvers.length} />
      </div>
    </TillDialog>
  );
}
