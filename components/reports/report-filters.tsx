"use client";

import { forwardRef, useId, useMemo, useState } from "react";

import { Button as KitButton, Icon, type IconName } from "@/components/core";
import { MenuButton } from "@/components/core/menu";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { describeCondition, formatValue, opLabel } from "@/lib/reports/format";
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

/** A filter chip in the kit (`.chipsel`): what it narrows by, and the menu or editor it opens. */
export const Chip = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { set?: boolean; icon?: IconName }>(
  function Chip({ set = false, icon = "filter", children, className, ...rest }, ref) {
    return (
      <button ref={ref} type="button" className={cn("chipsel", set && "is-set", className)} {...rest}>
        <Icon name={icon} />
        <span className="truncate">{children}</span>
        <Icon name="down" />
      </button>
    );
  },
);

/**
 * The quick chips: one per state the report has ("Any outcome") and per owner
 * ("Every owner"), each a menu of the values in the rows. Picking one narrows
 * the table to it; the first entry clears it. The grouped column has none: the
 * groups already split it.
 */
export function QuickChips({
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
  const quick = quickColumns(columns, view);
  return (
    <>
      {quick.map((column) => {
        const at = view.conditions.findIndex((condition) => condition.column === column.key && condition.op === "is");
        const condition = at >= 0 ? view.conditions[at]! : null;
        const picked = condition ? (Array.isArray(condition.value) ? condition.value : [condition.value]).filter(Boolean) : [];
        const any = column.kind === "status" ? `Any ${column.label.toLowerCase()}` : `Every ${column.label.toLowerCase()}`;
        const set = (value: string | null) => {
          const rest = view.conditions.filter((_, index) => index !== at);
          onViewChange({ ...view, conditions: value === null ? rest : [...rest, { column: column.key, op: "is", value: [value] }] });
        };
        return (
          <MenuButton
            key={column.key}
            className={cn("chipsel", condition && "is-set")}
            icon={column.kind === "status" ? "filter" : "person"}
            label={column.label}
            items={[
              { key: "any", label: any, checked: !condition, onSelect: () => set(null) },
              { separator: true as const },
              ...distinctValues(rows, column).map((value) => ({
                key: value,
                label: formatValue(value, column),
                checked: picked.includes(value),
                onSelect: () => set(value),
              })),
            ]}
          >
            {condition ? describeCondition(condition, column) : any}
          </MenuButton>
        );
      })}
    </>
  );
}

/** States, and the person a row belongs to: what people narrow a report by first. */
export function quickColumns(columns: ReportColumn[], view: ReportView): ReportColumn[] {
  return columns.filter(
    (column) =>
      !column.hidden &&
      column.key !== view.groupBy &&
      (column.kind === "status" || (column.kind === "text" && /^(owner|rep|cashier|teacher)$/i.test(column.key))),
  );
}

/** The filters set by hand (not by a quick chip), each a chip that opens its editor. */
export function FilterChips({
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
  const [editing, setEditing] = useState<number | null>(null);
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const quick = new Set(quickColumns(columns, view).map((column) => column.key));
  const setConditions = (conditions: Condition[]) => onViewChange({ ...view, conditions });

  return (
    <>
      {view.conditions.map((condition, index) => {
        const column = byKey.get(condition.column);
        if (!column || (quick.has(column.key) && condition.op === "is")) return null;
        return (
          <Popover key={`${condition.column}-${index}`} open={editing === index} onOpenChange={(open) => setEditing(open ? index : null)}>
            <PopoverTrigger asChild>
              <Chip set>{describeCondition(condition, column)}</Chip>
            </PopoverTrigger>
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
    </>
  );
}

/** Filters: add a filter on any column. Its count is how many are set. */
export function FiltersButton({
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
  return (
    <Popover open={adding} onOpenChange={setAdding}>
      <PopoverTrigger asChild>
        <KitButton icon="filter">
          Filters
          {view.conditions.length ? <span className="count">{view.conditions.length}</span> : null}
        </KitButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <ConditionEditor
          columns={columns}
          rows={rows}
          initial={null}
          onApply={(condition) => {
            onViewChange({ ...view, conditions: [...view.conditions, condition] });
            setAdding(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
