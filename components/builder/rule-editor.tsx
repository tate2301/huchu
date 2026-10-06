"use client";

import { Switch } from "@corelithzw/react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CHOICE_FIELD_TYPES,
  DISPLAY_FIELD_TYPES,
  MEASURE_FIELD_TYPES,
  measureUnit,
  type FieldDefinition,
  type FieldRule,
} from "@/lib/forms/fields";

import styles from "./builder.module.css";

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
 * is never waiting on something further down.
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
    <div className={styles.group}>
      <div className={styles.row}>
        <label htmlFor={`${id}-on`}>{label}</label>
        <div className={styles.inline}>
          <Switch
            id={`${id}-on`}
            checked={Boolean(rule)}
            disabled={!rule && answerable.length === 0}
            onChange={(event) => onChange(event.target.checked && answerable[0] ? defaultRule(answerable.at(-1)!) : undefined)}
          />
          <span className={styles.muted}>{rule ? "Only when…" : "Always"}</span>
        </div>
      </div>
      {!rule && answerable.length === 0 ? <p className={styles.hint}>Nothing is asked before this to depend on.</p> : null}

      {rule ? (
        <>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Answer to</span>
            <Select
              value={target?.key ?? ""}
              onValueChange={(key) => {
                const next = answerable.find((field) => field.key === key);
                if (next) onChange(defaultRule(next));
              }}
            >
              <SelectTrigger aria-label="The question it depends on">
                <SelectValue placeholder="A question that is gone" />
              </SelectTrigger>
              <SelectContent>
                {answerable.map((field) => (
                  <SelectItem key={field.key} value={field.key}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {target ? (
            <div className={styles.row}>
              <Select value={rule.op} onValueChange={(op) => onChange({ ...defaultRule(target), ...rule, op: op as Op, ...(op === "isAnswered" ? { value: undefined } : {}) })}>
                <SelectTrigger aria-label="How it is compared">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {opsFor(target).map((op) => (
                    <SelectItem key={op} value={op}>
                      {OP_LABELS[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
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
      <Select value={String(rule.value ?? "")} onValueChange={(value) => onChange({ ...rule, value })}>
        <SelectTrigger aria-label="The answer">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (rule.op === "above" || rule.op === "below") {
    return (
      <div className={styles.inline}>
        <Input
          type="number"
          inputMode="decimal"
          aria-label="The figure"
          value={rule.value === undefined ? "" : String(rule.value)}
          onChange={(event) => onChange({ ...rule, value: event.target.value === "" ? 0 : Number(event.target.value) })}
        />
        <span className={styles.muted}>{measureUnit(target)}</span>
      </div>
    );
  }
  return <Input aria-label="The answer" value={String(rule.value ?? "")} onChange={(event) => onChange({ ...rule, value: event.target.value })} />;
}
