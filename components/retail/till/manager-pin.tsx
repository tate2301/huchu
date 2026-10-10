"use client";

/* A manager's PIN at the till, shared by refund, void and cash in or out (FLR-03). */

import * as React from "react";

import { ApiError, getApiErrorMessage } from "@/lib/api-client";
import { firstName } from "./format";
import { useTill } from "./state";

/**
 * The manager standing at the counter (C-31). When the till rules ask for one
 * (a refund over the limit, a void the rule locks) and the person selling may
 * not approve it, they pick who approves and that manager types their PIN. The
 * server decides again: a 409 `needsApprover` opens the fields with its
 * sentence, a refused PIN or person is cleared, and a locked PIN (423), locked
 * until a new one is sent (ADM-03), is cleared so another manager approves. The PIN lives in this dialog only.
 */
export function useManagerPin(predicted: string | null) {
  const { approvers } = useTill();
  const [askedFor, setAskedFor] = React.useState<string | null>(null);
  const [managerId, setManagerId] = React.useState("");
  const [pin, setPin] = React.useState("");
  const asks = askedFor ?? predicted;
  const chosen = approvers.find((person) => person.userId === managerId) ?? approvers[0] ?? null;
  return {
    asks,
    chosen,
    choices: approvers,
    setManagerId,
    pin,
    setPin: (value: string) => setPin(value.replace(/\D/g, "").slice(0, 4)),
    approver: () => (asks && chosen && pin.length === 4 ? { approver: { userId: chosen.userId, pin } } : {}),
    ready: !asks || Boolean(chosen && pin.length === 4),
    /** The server's no, as the line under the fields says it. */
    refused: (error: unknown): string => {
      const message = getApiErrorMessage(error);
      if (!(error instanceof ApiError)) return message;
      if (error.status === 423) {
        // ADM-03: locked until a new PIN is sent, so somebody else approves.
        setPin("");
        return chosen ? `${firstName(chosen.name)}’s PIN is locked until a new one is sent. Another manager can approve it.` : message;
      }
      const details = error.details as { needsApprover?: boolean; reason?: string; fieldErrors?: { pin?: string; approver?: string } } | undefined;
      if (error.status === 409 && details?.needsApprover) {
        if (!details.fieldErrors) {
          setAskedFor(details.reason ?? message);
          return details.reason ?? message;
        }
        setPin("");
        if (details.fieldErrors.approver) setManagerId("");
      }
      return message;
    },
  };
}

export function ManagerFields({ fields, ids }: { fields: ReturnType<typeof useManagerPin>; ids: string }) {
  if (!fields.asks) return null;
  if (!fields.choices.length) {
    return <p className="help is-flush">Nobody here can approve it with a PIN yet. A manager sets their till PIN first.</p>;
  }
  return (
    <div className="field-row">
      <div className="field">
        <label htmlFor={`${ids}m`}>Manager</label>
        <select id={`${ids}m`} className="select input-lg" value={fields.chosen?.userId ?? ""} onChange={(event) => fields.setManagerId(event.target.value)}>
          {fields.choices.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${ids}p`}>{fields.chosen ? `${firstName(fields.chosen.name)}’s PIN` : "PIN"}</label>
        <input
          id={`${ids}p`}
          className="input input-lg num text-left"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={fields.pin}
          onChange={(event) => fields.setPin(event.target.value)}
        />
      </div>
    </div>
  );
}
