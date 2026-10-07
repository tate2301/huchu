"use client";

import { formatMoney } from "@/components/crm/money/money";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ReceiptLong, Trash2 } from "@/lib/icons";
import { MEASURE_FIELD_TYPES, measureUnit, type FieldDefinition } from "@/lib/forms/fields";
import type { QuoteLine } from "@/lib/forms/quote";

import { describeRule, RuleEditor } from "./rule-editor";
import styles from "./builder.module.css";

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
 * The quote the form drafts: each line, what it charges, and where its
 * quantity comes from — a measurement on the form, scaled for waste and
 * rounded up to whole packs, or a fixed number.
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
      <div className={styles.inspectorHead}>
        <ReceiptLong aria-hidden />
        <span className={styles.inspectorTitle}>Quote lines</span>
        <span className={styles.inspectorKey}>{lines.length} {lines.length === 1 ? "line" : "lines"}</span>
      </div>
      <div className={styles.paneBody}>
        <div className={styles.group}>
          <p className={styles.hint} style={{ margin: 0 }}>
            What a visit&apos;s answers put on the quote. Measure once on site and these are filled in.
          </p>
          {lines.map((line) => {
            const from = line.quantity.from === "field" ? line.quantity.key : FIXED;
            const source = line.quantity.from === "field" ? fields.find((field) => field.key === from) : undefined;
            const isOpen = open === line.id;
            return (
              <div key={line.id} className={styles.lineCard} data-open={isOpen}>
                <button type="button" className={styles.lineCardHead} aria-expanded={isOpen} onClick={() => onOpen(isOpen ? null : line.id)}>
                  <span>
                    {line.description || "A line with no description"}
                    <small>
                      {formatMoney(line.unitPrice, currency)} a {line.unit || "unit"} ×{" "}
                      {line.quantity.from === "fixed" ? line.quantity.value : (source?.label ?? "a question that is gone")}
                      {line.showWhen ? ` · when ${describeRule(line.showWhen, fields).toLowerCase()}` : ""}
                    </small>
                  </span>
                </button>
                {isOpen ? (
                  <>
                    <div className={styles.row}>
                      <label htmlFor={`line-${line.id}-description`}>Line</label>
                      <Input id={`line-${line.id}-description`} value={line.description} onChange={(event) => update(line.id, { ...line, description: event.target.value })} />
                    </div>
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>Price</span>
                      <div className={styles.inline}>
                        <Input
                          aria-label="Price for one"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={line.unitPrice}
                          onChange={(event) => update(line.id, { ...line, unitPrice: Math.max(0, toNumber(event.target.value, 0)) })}
                        />
                        <span className={styles.muted}>a</span>
                        <Input aria-label="Unit" value={line.unit ?? ""} placeholder="m²" onChange={(event) => update(line.id, { ...line, unit: event.target.value || undefined })} />
                      </div>
                    </div>
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>Quantity</span>
                      <Select
                        value={from}
                        onValueChange={(value) =>
                          update(line.id, {
                            ...line,
                            quantity: value === FIXED ? { from: "fixed", value: 1 } : { from: "field", key: value, factor: 1 },
                          })
                        }
                      >
                        <SelectTrigger aria-label="Where the quantity comes from">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {measured.map((field) => (
                            <SelectItem key={field.key} value={field.key}>
                              {field.label}
                            </SelectItem>
                          ))}
                          <SelectItem value={FIXED}>A fixed number</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {line.quantity.from === "fixed" ? (
                      <div className={styles.row}>
                        <label htmlFor={`line-${line.id}-fixed`}>How many</label>
                        <Input
                          id={`line-${line.id}-fixed`}
                          type="number"
                          min={0}
                          value={line.quantity.value}
                          onChange={(event) => update(line.id, { ...line, quantity: { from: "fixed", value: Math.max(0, toNumber(event.target.value, 0)) } })}
                        />
                      </div>
                    ) : (
                      <>
                        <div className={styles.row}>
                          <label htmlFor={`line-${line.id}-factor`}>Times</label>
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
                        </div>
                        <p className={styles.hint}>1.08 adds 8% for waste.</p>
                        <div className={styles.row}>
                          <label htmlFor={`line-${line.id}-per`}>In packs of</label>
                          <div className={styles.inline}>
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
                                const { per: _drop, ...rest } = line.quantity;
                                void _drop;
                                update(line.id, { ...line, quantity: per > 0 ? { ...rest, per } : rest });
                              }}
                            />
                            <span className={styles.muted}>{source ? measureUnit(source) : ""}</span>
                          </div>
                        </div>
                      </>
                    )}
                    <RuleEditor
                      id={`line-${line.id}-rule`}
                      label="Quote it"
                      rule={line.showWhen}
                      candidates={fields}
                      onChange={(rule) => {
                        const { showWhen: _drop, ...rest } = line;
                        void _drop;
                        update(line.id, rule ? { ...rest, showWhen: rule } : rest);
                      }}
                    />
                    <button type="button" className={styles.addLink} onClick={() => onChange(lines.filter((other) => other.id !== line.id))}>
                      <Trash2 aria-hidden />
                      Remove this line
                    </button>
                  </>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className={styles.addLink}
            onClick={() => {
              const line = lineFor(measured[0], lines);
              onChange([...lines, line]);
              onOpen(line.id);
            }}
          >
            <Plus aria-hidden />
            Add a line
          </button>
        </div>
      </div>
    </>
  );
}
