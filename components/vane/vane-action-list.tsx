"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Icon, Input, TextArea } from "@/components/core";
import type { VaneActionView } from "@/lib/vane/actions/engine";

import { moduleIcon } from "./vane-module";

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
    <label htmlFor={id} className={field.type === "date" ? "is-date" : undefined}>
      <span>{field.label}</span>
      {control}
    </label>
  );
}

/** What became of a decided action, in a line. */
function Outcome({ action }: { action: VaneActionView }) {
  const who = action.decidedBy ? `${action.decidedBy}${action.decidedAt ? `, ${time(action.decidedAt)}` : ""}` : null;
  if (action.status === "done") {
    return (
      <p className="va-o">
        {action.result ?? "Done."}
        {who ? <span className="muted"> Approved by {who}.</span> : null}
      </p>
    );
  }
  if (action.status === "denied") return <p className="va-o muted">Denied{who ? ` by ${who}` : ""}.</p>;
  if (action.status === "approved") return <p className="va-o">Doing it now…</p>;
  return null;
}

/** The square before an action: the module it acts in, or what became of it. */
function Mark({ action }: { action: VaneActionView }) {
  const name = action.status === "done" ? "done" : action.status === "failed" ? "warn" : action.status === "denied" ? "x" : moduleIcon(action.module);
  return (
    <span className="va-i">
      <Icon name={name} />
    </span>
  );
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
    <div className="va-l">
      {open.length > 1 ? (
        <div className="va-h">
          <span>Vane proposes {open.length} things. Nothing happens until you approve.</span>
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
      <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        {actions.map((action) => {
          const waiting = action.status === "proposed" || action.status === "failed";
          const busy = deciding === action.id;
          return (
            <li key={action.id} className="va" data-module={action.module} data-status={action.status}>
              <span className="va-t">
                <Mark action={action} />
                <span id={`vane-action-${action.id}`} className="va-n">
                  {action.title}
                </span>
                {action.target ? (
                  <Link href={action.target} className="link" aria-describedby={`vane-action-${action.id}`} style={{ flex: "none", fontSize: "var(--text-12)" }}>
                    Open
                  </Link>
                ) : null}
              </span>
              {waiting ? (
                <>
                  {action.status === "failed" && action.result ? (
                    <p role="alert" className="va-e">
                      {action.result}
                    </p>
                  ) : null}
                  {action.fields.some((field) => field.type !== "pick") ? (
                    <div className="va-f">
                      {action.fields.filter((field) => field.type !== "pick").map((field) => (
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
                  <span className="va-b">
                    <Button
                      size="sm"
                      icon="check"
                      busy={busy}
                      disabled={disabled || (deciding !== null && !busy)}
                      aria-describedby={`vane-action-${action.id}`}
                      onClick={() => onDecide(action, { approve: true, changes: valuesFor(action) })}
                    >
                      {action.status === "failed" ? "Try again" : action.verb}
                    </Button>
                    <Button
                      size="sm"
                      variant="quiet"
                      disabled={disabled || deciding !== null}
                      aria-describedby={`vane-action-${action.id}`}
                      onClick={() => onDecide(action, { approve: false })}
                    >
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
