"use client";

import { useMemo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "@/lib/icons";
import type { SqlColumn, SqlTable } from "@/lib/reports/sql/schema";
import {
  FILTER_OPS,
  TOTAL_FNS,
  resultNames,
  stepsFromSql,
  stepsToSql,
  type Bucket,
  type FilterOp,
  type QuerySteps as Steps,
  type StepFilter,
  type StepTotal,
  type TotalFn,
} from "@/lib/reports/sql/steps";

import styles from "./query-steps.module.css";

const NUMERIC = new Set(["number", "money"]);
const NO_BUCKET = "__as_is__";

/** A fresh query over a table: every row, as it is. */
export function startingSteps(table: SqlTable): Steps {
  return { from: table.name, keep: [], groups: [], totals: [], columns: [] };
}

/**
 * A query built by picking: from a table, keep the rows that match, total
 * them by something, sort. Every pick rewrites the SQL, which is shown
 * underneath — the same query, for whoever wants to take it further by hand.
 */
export function QuerySteps({ sql, tables, onChange }: { sql: string; tables: readonly SqlTable[]; onChange: (sql: string) => void }) {
  const steps = useMemo(() => stepsFromSql(sql, tables), [sql, tables]);

  if (!steps) {
    return (
      <div className={styles.handWritten}>
        <span>This query says more than steps can — a join, a subquery or an expression — so it is edited as SQL.</span>
        {tables[0] ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(stepsToSql(startingSteps(tables[0]), tables))}>
            Start again from steps
          </Button>
        ) : null}
      </div>
    );
  }

  const table = tables.find((candidate) => candidate.name === steps.from);
  const columns = table?.columns ?? [];
  const write = (next: Steps) => onChange(stepsToSql(next, tables));
  const set = (patch: Partial<Steps>) => write({ ...steps, ...patch });
  const label = (name: string) => columns.find((column) => column.sql === name)?.label ?? name;
  const totalled = steps.totals.length > 0 || steps.groups.length > 0;
  const sortable = resultNames(steps, table);

  return (
    <div>
      <div className={styles.steps}>
        <Step number={1} verb="From">
          <div className={styles.part}>
            <ColumnSelect
              label="Table"
              value={steps.from}
              options={tables.map((entry) => ({ value: entry.name, label: entry.title }))}
              onChange={(from) => {
                const next = tables.find((entry) => entry.name === from);
                if (next) write(startingSteps(next));
              }}
            />
          </div>
        </Step>

        <Step number={2} verb="Keep">
          {steps.keep.map((filter, index) => (
            <FilterRow
              key={index}
              filter={filter}
              columns={columns}
              onChange={(next) => set({ keep: steps.keep.map((other, at) => (at === index ? next : other)) })}
              onRemove={() => set({ keep: steps.keep.filter((_, at) => at !== index) })}
            />
          ))}
          <button
            type="button"
            className={styles.add}
            onClick={() => columns[0] && set({ keep: [...steps.keep, { column: columns[0].sql, op: "isNotEmpty" }] })}
          >
            <Plus aria-hidden />
            {steps.keep.length ? "And another" : "Only some rows"}
          </button>
        </Step>

        <Step number={3} verb="Total">
          {steps.totals.map((total, index) => (
            <TotalRow
              key={index}
              total={total}
              columns={columns}
              onChange={(next) => set({ totals: steps.totals.map((other, at) => (at === index ? next : other)) })}
              onRemove={() => {
                const totals = steps.totals.filter((_, at) => at !== index);
                set({ totals, ...(totals.length ? {} : { groups: [] }), sort: undefined });
              }}
            />
          ))}
          <button
            type="button"
            className={styles.add}
            onClick={() => {
              const taken = new Set(steps.totals.map((total) => total.as));
              const as = taken.has("rows") ? `total_${steps.totals.length + 1}` : "rows";
              set({ totals: [...steps.totals, { fn: "count", as }], columns: [], sort: undefined });
            }}
          >
            <Plus aria-hidden />
            {steps.totals.length ? "Another total" : "Count or add up"}
          </button>
        </Step>

        {totalled ? (
          <Step number={4} verb="By">
            {steps.groups.map((group, index) => {
              const column = columns.find((entry) => entry.sql === group.column);
              return (
                <div key={index} className={styles.part}>
                  <ColumnSelect
                    label="Group by"
                    value={group.column}
                    options={columns.map((entry) => ({ value: entry.sql, label: entry.label }))}
                    onChange={(value) => set({ groups: steps.groups.map((other, at) => (at === index ? { column: value } : other)), sort: undefined })}
                  />
                  {column?.kind === "date" ? (
                    <ColumnSelect
                      label="Date grouping"
                      value={group.by ?? NO_BUCKET}
                      options={[
                        { value: NO_BUCKET, label: "each day" },
                        { value: "week", label: "by week" },
                        { value: "month", label: "by month" },
                        { value: "year", label: "by year" },
                      ]}
                      onChange={(value) =>
                        set({
                          groups: steps.groups.map((other, at) => (at === index ? (value === NO_BUCKET ? { column: other.column } : { column: other.column, by: value as Bucket }) : other)),
                          sort: undefined,
                        })
                      }
                    />
                  ) : null}
                  <Remove label={`Stop grouping by ${label(group.column)}`} onClick={() => set({ groups: steps.groups.filter((_, at) => at !== index), sort: undefined })} />
                </div>
              );
            })}
            <button
              type="button"
              className={styles.add}
              onClick={() => {
                // Over time first, then by an outcome, then by who or what.
                const free = columns.filter((entry) => !NUMERIC.has(entry.kind) && !steps.groups.some((group) => group.column === entry.sql));
                const column =
                  free.find((entry) => entry.kind === "date") ??
                  free.find((entry) => entry.kind === "status") ??
                  free.find((entry) => entry.kind === "text" || entry.kind === "relation") ??
                  free[0] ??
                  columns[0];
                if (column) set({ groups: [...steps.groups, column.kind === "date" ? { column: column.sql, by: "month" } : { column: column.sql }], sort: undefined });
              }}
            >
              <Plus aria-hidden />
              {steps.groups.length ? "And by" : "Split it by something"}
            </button>
          </Step>
        ) : null}

        <Step number={totalled ? 5 : 4} verb="Sort">
          <div className={styles.part}>
            <ColumnSelect
              label="Sort by"
              value={steps.sort?.column ?? NO_BUCKET}
              options={[{ value: NO_BUCKET, label: "as it comes" }, ...sortable.map((name) => ({ value: name, label: label(name) }))]}
              onChange={(value) => set({ sort: value === NO_BUCKET ? undefined : { column: value, dir: steps.sort?.dir ?? "desc" } })}
            />
            {steps.sort ? (
              <ColumnSelect
                label="Direction"
                value={steps.sort.dir}
                options={[
                  { value: "desc", label: "highest first" },
                  { value: "asc", label: "lowest first" },
                ]}
                onChange={(dir) => set({ sort: { column: steps.sort!.column, dir: dir as "asc" | "desc" } })}
              />
            ) : null}
            <span className={styles.word}>show</span>
            <Input
              aria-label="How many rows"
              type="number"
              min={1}
              placeholder="all"
              value={steps.limit ?? ""}
              onChange={(event) => {
                const limit = Math.floor(Number(event.target.value));
                set({ limit: Number.isFinite(limit) && limit > 0 ? limit : undefined });
              }}
            />
          </div>
        </Step>
      </div>
      <pre className={styles.asSql} aria-label="As SQL">
        {sql.trimEnd()}
      </pre>
    </div>
  );
}

function Step({ number, verb, children }: { number: number; verb: string; children: ReactNode }) {
  return (
    <div className={styles.step}>
      <span className={styles.number}>{number}</span>
      <span className={styles.verb}>{verb}</span>
      <div className={styles.parts}>{children}</div>
    </div>
  );
}

function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.remove} aria-label={label} onClick={onClick}>
      <X aria-hidden />
    </button>
  );
}

function ColumnSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
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

function opsFor(column: SqlColumn | undefined): FilterOp[] {
  if (column && (NUMERIC.has(column.kind) || column.kind === "date")) return ["is", "isNot", "above", "below", "isEmpty", "isNotEmpty"];
  return ["is", "isNot", "contains", "isEmpty", "isNotEmpty"];
}

function FilterRow({ filter, columns, onChange, onRemove }: { filter: StepFilter; columns: readonly SqlColumn[]; onChange: (filter: StepFilter) => void; onRemove: () => void }) {
  const column = columns.find((entry) => entry.sql === filter.column);
  const needsValue = filter.op !== "isEmpty" && filter.op !== "isNotEmpty";
  return (
    <div className={styles.part}>
      <ColumnSelect
        label="Column"
        value={filter.column}
        options={columns.map((entry) => ({ value: entry.sql, label: entry.label }))}
        onChange={(value) => onChange({ column: value, op: "isNotEmpty" })}
      />
      <ColumnSelect
        label="Comparison"
        value={filter.op}
        options={opsFor(column).map((op) => ({ value: op, label: FILTER_OPS[op] }))}
        onChange={(op) => onChange({ ...filter, op: op as FilterOp, value: op === "isEmpty" || op === "isNotEmpty" ? undefined : (filter.value ?? "") })}
      />
      {needsValue ? (
        <Input
          aria-label="Value"
          type={column?.kind === "date" ? "date" : column && NUMERIC.has(column.kind) ? "number" : "text"}
          value={filter.value ?? ""}
          onChange={(event) => onChange({ ...filter, value: event.target.value })}
        />
      ) : null}
      <Remove label="Remove this filter" onClick={onRemove} />
    </div>
  );
}

function TotalRow({ total, columns, onChange, onRemove }: { total: StepTotal; columns: readonly SqlColumn[]; onChange: (total: StepTotal) => void; onRemove: () => void }) {
  const numbers = columns.filter((column) => NUMERIC.has(column.kind));
  return (
    <div className={styles.part}>
      <ColumnSelect
        label="Total"
        value={total.fn}
        options={(Object.keys(TOTAL_FNS) as TotalFn[]).filter((fn) => fn === "count" || numbers.length > 0).map((fn) => ({ value: fn, label: TOTAL_FNS[fn] }))}
        onChange={(fn) => {
          if (fn === "count") onChange({ fn: "count", as: total.as });
          else onChange({ fn: fn as TotalFn, column: total.column ?? numbers[0]?.sql, as: total.fn === "count" ? (total.column ?? numbers[0]?.sql ?? total.as) : total.as });
        }}
      />
      {total.fn === "count" ? (
        <span className={styles.word}>rows</span>
      ) : (
        <ColumnSelect
          label="Of"
          value={total.column ?? ""}
          options={numbers.map((column) => ({ value: column.sql, label: column.label }))}
          onChange={(column) => onChange({ ...total, column })}
        />
      )}
      <span className={styles.word}>as</span>
      <Input
        aria-label="Called"
        className="font-mono"
        value={total.as}
        onChange={(event) => {
          const as = event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^([0-9])/, "_$1");
          if (as) onChange({ ...total, as });
        }}
      />
      <Remove label="Remove this total" onClick={onRemove} />
    </div>
  );
}

