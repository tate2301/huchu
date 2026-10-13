"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Icon, Input, TextArea } from "@/components/core";
import type { VaneActionView } from "@/lib/vane/actions/engine";

type Values = Record<string, unknown>;

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

/** The inputs a person may change, as Vane proposed them. */
function initialValues(action: VaneActionView): Values {
  return Object.fromEntries(action.fields.map((field) => [field.name, field.value ?? ""]));
}

function FieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: VaneActionView["fields"][number];
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const id = React.useId();
  const common = { id, disabled, "aria-label": field.label };
  let control: React.ReactNode;
  if (field.type === "select") {
    control = (
      <select {...common} className="select" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "text" && field.multiline) {
    control = <TextArea {...common} rows={2} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />;
  } else {
    control = (
      <Input
        {...common}
        type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)}
      />
    );
  }
  return (
    <label htmlFor={id} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", flex: field.type === "date" ? "none" : "1 1 160px" }}>
      <span className="muted" style={{ fontSize: "var(--text-12)" }}>
        {field.label}
      </span>
      {control}
    </label>
  );
}

/** What became of a decided action, in a line. */
function Outcome({ action }: { action: VaneActionView }) {
  const who = action.decidedBy ? `${action.decidedBy}${action.decidedAt ? `, ${time(action.decidedAt)}` : ""}` : null;
  if (action.status === "done") {
    return (
      <span style={{ display: "flex", gap: "var(--space-8)", alignItems: "baseline", color: "var(--color-ink-2)" }}>
        <span style={{ color: "var(--color-success)", flex: "none", display: "inline-flex" }}>
          <Icon name="done" />
        </span>
        <span>
          {action.result ?? "Done."}
          {who ? <span className="muted"> Approved by {who}.</span> : null}
        </span>
      </span>
    );
  }
  if (action.status === "denied") {
    return <span className="muted">Denied{who ? ` by ${who}` : ""}.</span>;
  }
  if (action.status === "approved") return <span className="muted">Doing it…</span>;
  return null;
}

/**
 * The actions Vane proposes on a card or in an answer (the quick actions).
 * Each waits for a person: they may change its inputs (the due date Vane
 * suggested), then approve it, which does it now through the module as them,
 * or deny it. Several at once can be approved together. A failed one says
 * why and can be approved again.
 */
export function VaneActionList({
  actions,
  disabled = false,
  deciding,
  onDecide,
}: {
  actions: VaneActionView[];
  /** While Vane is working, nothing here can be pressed. */
  disabled?: boolean;
  /** The action being decided now. */
  deciding: string | null;
  onDecide: (action: VaneActionView, decision: { approve: false } | { approve: true; changes: Values }) => void;
}) {
  const [values, setValues] = React.useState<Record<string, Values>>(() =>
    Object.fromEntries(actions.map((action) => [action.id, initialValues(action)])),
  );
  if (actions.length === 0) return null;

  const valuesFor = (action: VaneActionView) => values[action.id] ?? initialValues(action);
  const open = actions.filter((action) => action.status === "proposed" || action.status === "failed");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)", marginTop: "var(--space-8)" }}>
      {open.length > 1 ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-8)" }}>
          <span className="muted" style={{ flex: 1, fontSize: "var(--text-12)" }}>
            Vane proposes {open.length} things. Nothing happens until you approve.
          </span>
          <Button
            size="sm"
            icon="check"
            disabled={disabled || deciding !== null}
            onClick={() => open.forEach((action) => onDecide(action, { approve: true, changes: valuesFor(action) }))}
          >
            Approve all {open.length}
          </Button>
        </div>
      ) : null}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        {actions.map((action) => {
          const waiting = action.status === "proposed" || action.status === "failed";
          const busy = deciding === action.id;
          return (
            <li
              key={action.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-8)",
                padding: "var(--space-8) var(--space-12)",
                borderRadius: 8,
                boxShadow: "inset 0 0 0 1px var(--color-line)",
                background: waiting ? "var(--color-surface)" : "var(--color-ground)",
              }}
            >
              <span style={{ display: "flex", gap: "var(--space-8)", alignItems: "baseline" }}>
                <span style={{ flex: 1, minWidth: 0, color: "var(--color-ink)" }}>{action.title}</span>
                {action.target ? (
                  <Link href={action.target} className="link" style={{ flex: "none", fontSize: "var(--text-12)" }}>
                    Open
                  </Link>
                ) : null}
              </span>
              {waiting ? (
                <>
                  {action.status === "failed" && action.result ? (
                    <span role="alert" style={{ color: "var(--color-danger)", fontSize: "var(--text-12)" }}>
                      {action.result}
                    </span>
                  ) : null}
                  {action.fields.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-8)" }}>
                      {action.fields.map((field) => (
                        <FieldInput
                          key={field.name}
                          field={field}
                          value={valuesFor(action)[field.name]}
                          disabled={disabled || busy}
                          onChange={(value) => setValues((current) => ({ ...current, [action.id]: { ...valuesFor(action), [field.name]: value } }))}
                        />
                      ))}
                    </div>
                  ) : null}
                  <span style={{ display: "flex", gap: "var(--space-8)" }}>
                    <Button
                      size="sm"
                      icon="check"
                      busy={busy}
                      disabled={disabled || (deciding !== null && !busy)}
                      onClick={() => onDecide(action, { approve: true, changes: valuesFor(action) })}
                    >
                      {action.status === "failed" ? "Try again" : action.verb}
                    </Button>
                    <Button size="sm" variant="quiet" disabled={disabled || deciding !== null} onClick={() => onDecide(action, { approve: false })}>
                      Deny
                    </Button>
                  </span>
                </>
              ) : (
                <Outcome action={action} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
