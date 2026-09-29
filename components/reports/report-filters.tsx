"use client";

import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Funnel, Plus, X } from "@/lib/icons";
import { describeCondition, opLabel } from "@/lib/reports/format";
import type { Condition, ConditionOp, ReportColumn, ReportRow, ReportView } from "@/lib/reports/types";
import { compareValues, isNumeric } from "@/lib/reports/view";
import { cn } from "@/lib/utils";

/**
 * A report's filters as chips, each opening onto its own editor.
 *
 * The comparisons offered are the ones that mean something for the column: a
 * list of the values actually present for words, bounds for figures and dates.
 * Picking from what is there beats typing a status and missing it by a letter.
 */

/** Past this many distinct values a list is a haystack; typing is quicker. */
const MAX_CHOICES = 60;

function opsFor(column: ReportColumn, hasChoices: boolean): ConditionOp[] {
  if (isNumeric(column.kind)) return ["between", "gt", "lt", "is", "empty", "notEmpty"];
  if (column.kind === "date") return ["between", "gt", "lt", "empty", "notEmpty"];
  return hasChoices ? ["is", "isNot", "contains", "empty", "notEmpty"] : ["contains", "is", "isNot", "empty", "notEmpty"];
}

function distinctValues(rows: ReportRow[], column: ReportColumn): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row[column.key];
    if (value === null || value === undefined || value === "") continue;
    seen.add(String(value));
    if (seen.size > MAX_CHOICES) break;
  }
  return [...seen].sort((a, b) => compareValues(a, b, column.kind));
}

function ConditionEditor({
  columns,
  rows,
  initial,
  onApply,
  onRemove,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  initial: Condition | null;
  onApply: (condition: Condition) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  // A new filter starts on the column people most often narrow by: a state.
  const [columnKey, setColumnKey] = useState(
    initial?.column ?? (columns.find((column) => column.kind === "status") ?? columns[0])?.key ?? "",
  );
  const column = columns.find((candidate) => candidate.key === columnKey) ?? columns[0]!;
  const choices = useMemo(
    () => (isNumeric(column.kind) || column.kind === "date" ? [] : distinctValues(rows, column)),
    [rows, column],
  );
  const hasChoices = choices.length > 0 && choices.length <= MAX_CHOICES;
  const ops = opsFor(column, hasChoices);
  const [op, setOp] = useState<ConditionOp>(initial?.op ?? ops[0]!);
  const initialValues = Array.isArray(initial?.value) ? initial.value : initial?.value ? [initial.value] : [];
  const [values, setValues] = useState<string[]>(initialValues);

  const pickColumn = (key: string) => {
    const next = columns.find((candidate) => candidate.key === key)!;
    setColumnKey(key);
    const nextChoices = isNumeric(next.kind) || next.kind === "date" ? [] : distinctValues(rows, next);
    setOp(opsFor(next, nextChoices.length > 0 && nextChoices.length <= MAX_CHOICES)[0]!);
    setValues([]);
  };

  const inputType = column.kind === "date" ? "date" : isNumeric(column.kind) ? "number" : "text";
  const listMode = (op === "is" || op === "isNot") && hasChoices;
  const needsValue = op !== "empty" && op !== "notEmpty";
  const ready = !needsValue || values.some((value) => value.trim() !== "");

  const apply = () => {
    if (!ready) return;
    const value = !needsValue
      ? undefined
      : listMode || op === "between"
        ? values
        : op === "is" || op === "isNot"
          ? [values[0] ?? ""]
          : values[0] ?? "";
    onApply({ column: column.key, op, ...(value === undefined ? {} : { value }) });
  };

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <Select value={column.key} onValueChange={pickColumn}>
          <SelectTrigger size="sm" aria-label="Column">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columns.map((candidate) => (
              <SelectItem key={candidate.key} value={candidate.key}>
                {candidate.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={op}
          onValueChange={(next) => {
            setOp(next as ConditionOp);
            setValues([]);
          }}
        >
          <SelectTrigger size="sm" aria-label="Comparison">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ops.map((candidate) => (
              <SelectItem key={candidate} value={candidate}>
                {opLabel(candidate, column)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsValue ? (
        listMode ? (
          <ul className="grid max-h-56 gap-px overflow-y-auto">
            {choices.map((choice, index) => {
              const checked = values.includes(choice);
              return (
                <li key={choice} className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] px-1.5 hover:bg-[var(--canvas)]">
                  <Checkbox
                    id={`${id}-${index}`}
                    checked={checked}
                    onCheckedChange={() =>
                      setValues(checked ? values.filter((value) => value !== choice) : [...values, choice])
                    }
                  />
                  <label htmlFor={`${id}-${index}`} className="min-w-0 flex-1 cursor-pointer truncate text-sm">
                    {choice}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : op === "between" ? (
          <div className="grid grid-cols-2 gap-2">
            <Input
              type={inputType}
              aria-label="From"
              placeholder="From"
              value={values[0] ?? ""}
              onChange={(event) => setValues([event.target.value, values[1] ?? ""])}
              className={cn(inputType !== "text" && "font-mono tabular-nums")}
            />
            <Input
              type={inputType}
              aria-label="To"
              placeholder="To"
              value={values[1] ?? ""}
              onChange={(event) => setValues([values[0] ?? "", event.target.value])}
              className={cn(inputType !== "text" && "font-mono tabular-nums")}
            />
          </div>
        ) : (
          <Input
            type={inputType}
            aria-label="Value"
            autoFocus
            value={values[0] ?? ""}
            onChange={(event) => setValues([event.target.value])}
            className={cn(inputType !== "text" && "font-mono tabular-nums")}
          />
        )
      ) : null}

      <div className="flex items-center justify-between gap-2">
        {onRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : (
          <span />
        )}
        {ready ? (
          <Button type="submit" size="sm">
            Apply
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function ReportFilters({
  columns,
  rows,
  view,
  onViewChange,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  view: ReportView;
  onViewChange: (view: ReportView) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const setConditions = (conditions: Condition[]) => onViewChange({ ...view, conditions });

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {view.conditions.map((condition, index) => {
        const column = byKey.get(condition.column);
        if (!column) return null;
        return (
          <Popover key={`${condition.column}-${index}`} open={editing === index} onOpenChange={(open) => setEditing(open ? index : null)}>
            <span className="inline-flex h-7 items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[12px] font-medium text-[var(--text)]">
              <PopoverTrigger asChild>
                <button type="button" className="max-w-[18rem] truncate pl-2.5 pr-1 hover:underline">
                  {describeCondition(condition, column)}
                </button>
              </PopoverTrigger>
              <button
                type="button"
                aria-label={`Remove ${describeCondition(condition, column)}`}
                onClick={() => setConditions(view.conditions.filter((_, at) => at !== index))}
                className="mr-1 flex size-5 items-center justify-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--canvas)] hover:text-[var(--text)]"
              >
                <X className="size-3" />
              </button>
            </span>
            <PopoverContent align="start" className="w-80 p-3">
              <ConditionEditor
                columns={columns}
                rows={rows}
                initial={condition}
                onApply={(next) => {
                  setConditions(view.conditions.map((existing, at) => (at === index ? next : existing)));
                  setEditing(null);
                }}
                onRemove={() => {
                  setConditions(view.conditions.filter((_, at) => at !== index));
                  setEditing(null);
                }}
              />
            </PopoverContent>
          </Popover>
        );
      })}

      <Popover open={adding} onOpenChange={setAdding}>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm">
            {view.conditions.length ? <Plus className="size-4" aria-hidden="true" /> : <Funnel className="size-4" aria-hidden="true" />}
            {view.conditions.length ? "Add filter" : "Filter"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3">
          <ConditionEditor
            columns={columns}
            rows={rows}
            initial={null}
            onApply={(condition) => {
              setConditions([...view.conditions, condition]);
              setAdding(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
