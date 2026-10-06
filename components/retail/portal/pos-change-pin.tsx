"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Lock } from "@/lib/icons";
import { TILL_PIN_LENGTH } from "@/lib/retail/till-pin";

import type { PosTillPinStatus } from "./pos-lock-screen";
import { PosPanel, PosPanelHeader } from "./pos-primitives";

type Field = "currentPin" | "newPin" | "again";

const MISMATCH = "Those two do not match. Try again.";

/**
 * Change my PIN (80-admin 5.14, ADM-03), in the till's settings: "Current
 * PIN", "New PIN", "Again" → `POST /api/v2/retail/pos/pin/change`. A PIN is
 * never set with a password; someone without one is sent one from People.
 */
export function PosChangePin() {
  const status = useQuery({
    queryKey: ["retail-till-pin"],
    queryFn: () => fetchJson<{ data: PosTillPinStatus }>("/api/v2/retail/pos/pin"),
  });
  const [values, setValues] = useState<Record<Field, string>>({ currentPin: "", newPin: "", again: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const pin = status.data?.data ?? null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setDone(false);
    setProblem(null);
    if (values.newPin !== values.again) {
      setErrors({ again: MISMATCH });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await fetchJson("/api/v2/retail/pos/pin/change", {
        method: "POST",
        body: JSON.stringify({ currentPin: values.currentPin, newPin: values.newPin }),
      });
      setValues({ currentPin: "", newPin: "", again: "" });
      setDone(true);
      void status.refetch();
    } catch (caught) {
      const fieldErrors =
        caught instanceof ApiError ? (caught.details as { fieldErrors?: Partial<Record<Field, string>> } | undefined)?.fieldErrors : undefined;
      if (fieldErrors) setErrors(fieldErrors);
      else setProblem(getApiErrorMessage(caught));
      setValues((current) => ({ ...current, currentPin: "" }));
    } finally {
      setBusy(false);
    }
  };

  const input = (field: Field, label: string) => (
    <label className="block">
      <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={TILL_PIN_LENGTH}
        value={values[field]}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, TILL_PIN_LENGTH);
          setValues((current) => ({ ...current, [field]: digits }));
        }}
        aria-invalid={errors[field] ? true : undefined}
        className="mt-1 h-11 w-full rounded-xl border border-[var(--edge-default)] bg-[var(--surface-base)] px-3 font-mono text-lg tracking-[0.4em] text-[var(--text-strong)] outline-none focus:border-[var(--pos-cta-bg)] aria-[invalid=true]:border-[var(--pos-status-danger-text)]"
      />
      {errors[field] ? (
        <span className="mt-1 block text-xs text-[var(--pos-status-danger-text)]" role="alert">
          {errors[field]}
        </span>
      ) : null}
    </label>
  );

  return (
    <PosPanel>
      <PosPanelHeader title="Change my PIN" actions={<Lock className="h-5 w-5 text-[var(--text-muted)]" />} />
      {status.isLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading your PIN…</p>
      ) : !pin?.hasPin ? (
        <p className="text-sm leading-6 text-[var(--text-muted)]">You have no till PIN yet. Ask a manager to send you one.</p>
      ) : pin.locked ? (
        <p className="text-sm leading-6 text-[var(--pos-status-danger-text)]">Too many tries. Ask a manager to send you a new PIN.</p>
      ) : (
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={(event) => void submit(event)}>
          {input("currentPin", "Current PIN")}
          {input("newPin", "New PIN")}
          {input("again", "Again")}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <button
              type="submit"
              disabled={busy || Object.values(values).some((value) => value.length !== TILL_PIN_LENGTH)}
              className="min-h-11 rounded-xl px-4 text-[13px] font-bold disabled:opacity-50"
              style={{ background: "var(--pos-cta-bg)", color: "var(--pos-cta-text)" }}
            >
              {busy ? "Changing…" : "Change my PIN"}
            </button>
            {done ? <span className="text-sm text-[var(--text-muted)]">Your PIN is changed.</span> : null}
            {problem ? (
              <span className="text-sm text-[var(--pos-status-danger-text)]" role="alert">
                {problem}
              </span>
            ) : null}
          </div>
        </form>
      )}
    </PosPanel>
  );
}
