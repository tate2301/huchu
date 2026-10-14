"use client";

import * as React from "react";

import { Field, Input, Select, Switch } from "@/components/core";
import {
  CHOICE_FIELD_TYPES,
  DISPLAY_FIELD_TYPES,
  MEASURE_FIELD_TYPES,
  measureUnit,
  type FieldDefinition,
  type FieldRule,
} from "@/lib/forms/fields";

type Op = FieldRule["op"];

const OP_LABELS: Record<Op, string> = {
  is: "is",
  isNot: "is not",
  isAnswered: "is answered",
  above: "is over",
  below: "is under",
};

/** What can be said about an answer of this kind. */
export function opsFor(field: FieldDefinition): Op[] {
  if (field.type === "checkbox") return ["is"];
  if (CHOICE_FIELD_TYPES.includes(field.type)) return ["is", "isNot", "isAnswered"];
  if (MEASURE_FIELD_TYPES.includes(field.type) || field.type === "rating") return ["above", "below", "isAnswered"];
  return ["isAnswered", "is", "isNot"];
}

function defaultRule(target: FieldDefinition): FieldRule {
  const op = opsFor(target)[0];
  if (target.type === "checkbox") return { key: target.key, op, value: "true" };
  if (CHOICE_FIELD_TYPES.includes(target.type)) return { key: target.key, op, value: target.options?.[0]?.value ?? "" };
  if (op === "above" || op === "below") return { key: target.key, op, value: 0 };
  return { key: target.key, op };
}

/** A rule in words: "Moisture reading is over 4 %". */
export function describeRule(rule: FieldRule, fields: readonly FieldDefinition[]): string {
  const target = fields.find((field) => field.key === rule.key);
  if (!target) return `${rule.key} ${OP_LABELS[rule.op]}`;
  if (rule.op === "isAnswered") return `${target.label} is answered`;
  let value = String(rule.value ?? "");
  if (target.type === "checkbox") value = value === "true" ? "yes" : "no";
  else if (CHOICE_FIELD_TYPES.includes(target.type)) value = target.options?.find((choice) => choice.value === value)?.label ?? value;
  else if (rule.op === "above" || rule.op === "below") value = `${value}${measureUnit(target) ? ` ${measureUnit(target)}` : ""}`;
  return `${target.label} ${OP_LABELS[rule.op]} ${value}`;
}

/**
 * "Ask this only when…" — a question, or a quote line, that depends on
 * another answer. Only answers asked before it can be pointed at, so a form
 * is never waiting on something further down. Drawn in the builder's
 * inspector, in the kit.
 */
export function RuleEditor({
  id,
  rule,
  onChange,
  candidates,
  label,
}: {
  id: string;
  rule: FieldRule | undefined;
  onChange: (rule: FieldRule | undefined) => void;
  /** The questions it may depend on. */
  candidates: readonly FieldDefinition[];
  label: string;
}) {
  const answerable = candidates.filter((field) => !DISPLAY_FIELD_TYPES.includes(field.type));
  const target = rule ? answerable.find((field) => field.key === rule.key) : undefined;

  return (
    <div className="pl">
      <label className="rb-swrow" htmlFor={`${id}-on`}>
        <span>
          <b>{label}</b>
          <span className="muted" style={{ fontSize: 13 }}>
            {rule ? `Only when ${describeRule(rule, answerable).charAt(0).toLowerCase()}${describeRule(rule, answerable).slice(1)}` : "Always"}
          </span>
        </span>
        <Switch
          id={`${id}-on`}
          checked={Boolean(rule)}
          disabled={!rule && answerable.length === 0}
          onCheckedChange={(on) => onChange(on && answerable.length ? defaultRule(answerable.at(-1)!) : undefined)}
        />
      </label>
      {!rule && answerable.length === 0 ? <p className="rb-note">Nothing is asked before this to depend on.</p> : null}

      {rule ? (
        <>
          <Field label="Answer to" htmlFor={`${id}-key`}>
            <Select
              id={`${id}-key`}
              value={target?.key ?? ""}
              onChange={(event) => {
                const next = answerable.find((field) => field.key === event.target.value);
                if (next) onChange(defaultRule(next));
              }}
            >
              {target ? null : <option value="">A question that is gone</option>}
              {answerable.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </Select>
          </Field>
          {target ? (
            <div className="rb-pair">
              <Select
                aria-label="How it is compared"
                value={rule.op}
                onChange={(event) => {
                  const op = event.target.value as Op;
                  onChange({ ...defaultRule(target), ...rule, op, ...(op === "isAnswered" ? { value: undefined } : {}) });
                }}
              >
                {opsFor(target).map((op) => (
                  <option key={op} value={op}>
                    {OP_LABELS[op]}
                  </option>
                ))}
              </Select>
              {rule.op === "isAnswered" ? <span /> : <RuleValue target={target} rule={rule} onChange={onChange} />}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RuleValue({ target, rule, onChange }: { target: FieldDefinition; rule: FieldRule; onChange: (rule: FieldRule) => void }) {
  if (target.type === "checkbox" || CHOICE_FIELD_TYPES.includes(target.type)) {
    const options = target.type === "checkbox" ? [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] : (target.options ?? []);
    return (
      <Select aria-label="The answer" value={String(rule.value ?? "")} onChange={(event) => onChange({ ...rule, value: event.target.value })}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  }
  if (rule.op === "above" || rule.op === "below") {
    return (
      <span className="rb-unit">
        <Input
          type="number"
          inputMode="decimal"
          aria-label="The figure"
          value={rule.value === undefined ? "" : String(rule.value)}
          onChange={(event) => onChange({ ...rule, value: event.target.value === "" ? 0 : Number(event.target.value) })}
        />
        <span className="muted">{measureUnit(target)}</span>
      </span>
    );
  }
  return <Input aria-label="The answer" value={String(rule.value ?? "")} onChange={(event) => onChange({ ...rule, value: event.target.value })} />;
}
