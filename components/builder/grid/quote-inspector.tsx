"use client";

import * as React from "react";

import { formatMoney } from "@/components/crm/money/money";
import { Button, Field, Input, Select } from "@/components/core";
import { MEASURE_FIELD_TYPES, measureUnit, type FieldDefinition } from "@/lib/forms/fields";
import type { QuoteLine } from "@/lib/forms/quote";

import { describeRule, RuleEditor } from "./rule-editor";

const FIXED = "__fixed__";

const toNumber = (value: string, fallback: number) => (value.trim() === "" || !Number.isFinite(Number(value)) ? fallback : Number(value));

/** A line id no other line has. */
export function freeLineId(lines: readonly QuoteLine[]): string {
  const taken = new Set(lines.map((line) => line.id));
  let n = lines.length + 1;
  while (taken.has(`line_${n}`)) n += 1;
  return `line_${n}`;
}

/** A new line counting a measured question. */
export function lineFor(field: FieldDefinition | undefined, lines: readonly QuoteLine[]): QuoteLine {
  return {
    id: freeLineId(lines),
    description: field ? field.label : "New line",
    ...(field ? { unit: measureUnit(field) || "each" } : { unit: "each" }),
    unitPrice: 0,
    quantity: field ? { from: "field", key: field.key, factor: 1 } : { from: "fixed", value: 1 },
  };
}

/**
 * The quote the form drafts, in the builder's inspector: each line, what it
 * charges, and where its quantity comes from — a measurement on the form,
 * scaled for waste and rounded up to whole packs, or a fixed number — and when
 * it is quoted.
 */
export function QuoteInspector({
  lines,
  fields,
  currency,
  open,
  onOpen,
  onChange,
}: {
  lines: readonly QuoteLine[];
  fields: readonly FieldDefinition[];
  currency: string;
  /** The line being edited. */
  open: string | null;
  onOpen: (id: string | null) => void;
  onChange: (lines: QuoteLine[]) => void;
}) {
  const measured = fields.filter((field) => MEASURE_FIELD_TYPES.includes(field.type));
  const update = (id: string, next: QuoteLine) => onChange(lines.map((line) => (line.id === id ? next : line)));

  return (
    <>
      <h2>The quote it drafts</h2>
      <p className="rb-note">What a visit&apos;s answers put on the quote. Measure once on site and these are filled in.</p>
      <div className="pl">
        <div className="pl-h">
          {lines.length} {lines.length === 1 ? "line" : "lines"}
        </div>
        {lines.map((line) => {
          const from = line.quantity.from === "field" ? line.quantity.key : FIXED;
          const source = line.quantity.from === "field" ? fields.find((field) => field.key === from) : undefined;
          const isOpen = open === line.id;
          return (
            <div key={line.id} className={isOpen ? "rb-line is-open" : "rb-line"}>
              <button type="button" className="prow" aria-expanded={isOpen} onClick={() => onOpen(isOpen ? null : line.id)}>
                <b>{line.description || "A line with no description"}</b>
                <span>
                  {formatMoney(line.unitPrice, currency)} a {line.unit || "unit"} × {line.quantity.from === "fixed" ? line.quantity.value : (source?.label ?? "a question that is gone")}
                  {line.showWhen ? `, when ${describeRule(line.showWhen, fields).toLowerCase()}` : ""}
                </span>
              </button>
              {isOpen ? (
                <div className="rb-line-b">
                  <Field label="Line" htmlFor={`line-${line.id}-description`}>
                    <Input id={`line-${line.id}-description`} value={line.description} onChange={(event) => update(line.id, { ...line, description: event.target.value })} />
                  </Field>
                  <Field label="Price">
                    <span className="rb-pair">
                      <Input
                        aria-label="Price for one"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={line.unitPrice}
                        onChange={(event) => update(line.id, { ...line, unitPrice: Math.max(0, toNumber(event.target.value, 0)) })}
                      />
                      <Input aria-label="Unit" value={line.unit ?? ""} placeholder="m²" onChange={(event) => update(line.id, { ...line, unit: event.target.value || undefined })} />
                    </span>
                  </Field>
                  <Field label="Quantity from" htmlFor={`line-${line.id}-from`}>
                    <Select
                      id={`line-${line.id}-from`}
                      value={from}
                      onChange={(event) =>
                        update(line.id, {
                          ...line,
                          quantity: event.target.value === FIXED ? { from: "fixed", value: 1 } : { from: "field", key: event.target.value, factor: 1 },
                        })
                      }
                    >
                      {measured.map((field) => (
                        <option key={field.key} value={field.key}>
                          {field.label}
                        </option>
                      ))}
                      <option value={FIXED}>A fixed number</option>
                    </Select>
                  </Field>
                  {line.quantity.from === "fixed" ? (
                    <Field label="How many" htmlFor={`line-${line.id}-fixed`}>
                      <Input
                        id={`line-${line.id}-fixed`}
                        type="number"
                        min={0}
                        value={line.quantity.value}
                        onChange={(event) => update(line.id, { ...line, quantity: { from: "fixed", value: Math.max(0, toNumber(event.target.value, 0)) } })}
                      />
                    </Field>
                  ) : (
                    <>
                      <Field label="Times" htmlFor={`line-${line.id}-factor`} help="1.08 adds 8% for waste.">
                        <Input
                          id={`line-${line.id}-factor`}
                          type="number"
                          step="0.01"
                          min={0.01}
                          value={line.quantity.factor}
                          onChange={(event) => {
                            const factor = toNumber(event.target.value, 1);
                            if (line.quantity.from === "field" && factor > 0) update(line.id, { ...line, quantity: { ...line.quantity, factor } });
                          }}
                        />
                      </Field>
                      <Field label={`In packs of${source ? `, ${measureUnit(source)}` : ""}`} htmlFor={`line-${line.id}-per`}>
                        <Input
                          id={`line-${line.id}-per`}
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="Not packed"
                          value={line.quantity.per ?? ""}
                          onChange={(event) => {
                            if (line.quantity.from !== "field") return;
                            const per = toNumber(event.target.value, 0);
                            const rest = { ...line.quantity };
                            delete rest.per;
                            update(line.id, { ...line, quantity: per > 0 ? { ...rest, per } : rest });
                          }}
                        />
                      </Field>
                    </>
                  )}
                  <RuleEditor
                    id={`line-${line.id}-rule`}
                    label="Quote it only when"
                    rule={line.showWhen}
                    candidates={fields}
                    onChange={(rule) => {
                      const rest = { ...line };
                      delete rest.showWhen;
                      update(line.id, rule ? { ...rest, showWhen: rule } : rest);
                    }}
                  />
                  <Button variant="quiet" icon="x" onClick={() => onChange(lines.filter((other) => other.id !== line.id))}>
                    Remove this line
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        <Button
          variant="quiet"
          icon="plus"
          onClick={() => {
            const line = lineFor(measured[0], lines);
            onChange([...lines, line]);
            onOpen(line.id);
          }}
        >
          Add a line
        </Button>
      </div>
    </>
  );
}
