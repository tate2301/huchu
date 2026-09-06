"use client";

import { useState } from "react";

import { EmptyState } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Pencil, Plus, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

import type { JobItem } from "./job-types";

/** A line being typed. Quantity is a string until it is committed. */
type DraftLine = { key: string; description: string; quantity: string; unit: string };

let nextKey = 0;

function draftFrom(items: JobItem[]): DraftLine[] {
  return items.map((item) => ({
    key: `existing-${item.id}`,
    description: item.description,
    quantity: String(item.quantity),
    unit: item.unit ?? "",
  }));
}

function blankLine(): DraftLine {
  nextKey += 1;
  return { key: `new-${nextKey}`, description: "", quantity: "1", unit: "" };
}

/**
 * What needs doing, and what has been done.
 *
 * A tick is the whole interaction for the common case — one of a thing, done
 * or not — and the quantity box only appears where the line is genuinely a
 * count, because "1 / 1" in a number field is a form asking a question that
 * has already been answered.
 *
 * Ticks write through as you go rather than into a save button, the same as
 * every other editable thing on a record page. A quantity typed by hand does
 * not: somebody part-way through typing "12" has momentarily typed "1", and
 * committing that would record a job as further along than it is. So the box
 * commits on blur, and a pending edit is visibly pending until it does.
 */
export function JobChecklist({
  items,
  percent,
  readOnly,
  isSaving,
  onCommit,
  editRefusal,
  isSavingItems,
  onSaveItems,
}: {
  items: JobItem[];
  percent: number;
  /** A completed job is final — its checklist is a record, not a worksheet. */
  readOnly?: boolean;
  isSaving?: boolean;
  onCommit: (progress: Array<{ id: string; completedQuantity: number }>) => void;
  /**
   * Why the list itself cannot be rewritten right now — the server's own
   * answer, from `checklistEditRefusal`. Given one, the control is not offered
   * and the reason is: a button that fails silently is worse than no button.
   */
  editRefusal?: string | null;
  isSavingItems?: boolean;
  /** Replaces the whole list. Absent where the page has no way to save one. */
  onSaveItems?: (
    lines: Array<{ description: string; quantity: number; unit?: string | null }>,
  ) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<DraftLine[] | null>(null);

  const canEditList = Boolean(onSaveItems) && !editRefusal;

  const startEditing = (seed: DraftLine[]) => setLines(seed.length > 0 ? seed : [blankLine()]);

  const saveList = () => {
    const cleaned = (lines ?? [])
      .map((line) => {
        const description = line.description.trim();
        const quantity = Number(line.quantity);
        if (!description) return null;
        return {
          description,
          // A line with no number against it is one of it. Zero would mean a
          // thing that never has to be done, which is not a checklist line.
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
          unit: line.unit.trim() || null,
        };
      })
      .filter((line): line is { description: string; quantity: number; unit: string | null } =>
        line !== null,
      );
    setLines(null);
    onSaveItems?.(cleaned);
  };

  if (lines) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-muted)]">
          What the crew has to do, one line each. Quantities are what the job is measured
          against — “14” panels is fourteen ticks, not one.
        </p>

        <ul className="space-y-2">
          {lines.map((line, index) => (
            <li key={line.key} className="flex items-start gap-2">
              <Input
                className="min-w-0 flex-1"
                value={line.description}
                aria-label={`Line ${index + 1}`}
                placeholder="Install the panel and make good"
                onChange={(event) =>
                  setLines((previous) =>
                    (previous ?? []).map((entry) =>
                      entry.key === line.key
                        ? { ...entry, description: event.target.value }
                        : entry,
                    ),
                  )
                }
              />
              <Input
                className="w-20 shrink-0 text-right font-mono tabular-nums"
                type="number"
                min={0}
                inputMode="decimal"
                aria-label={`How many — line ${index + 1}`}
                value={line.quantity}
                onChange={(event) =>
                  setLines((previous) =>
                    (previous ?? []).map((entry) =>
                      entry.key === line.key ? { ...entry, quantity: event.target.value } : entry,
                    ),
                  )
                }
              />
              <Input
                className="w-20 shrink-0"
                aria-label={`Unit — line ${index + 1}`}
                placeholder="unit"
                value={line.unit}
                onChange={(event) =>
                  setLines((previous) =>
                    (previous ?? []).map((entry) =>
                      entry.key === line.key ? { ...entry, unit: event.target.value } : entry,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove line ${index + 1}`}
                onClick={() =>
                  setLines((previous) => (previous ?? []).filter((entry) => entry.key !== line.key))
                }
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((previous) => [...(previous ?? []), blankLine()])}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add a line
          </Button>
          <Button type="button" size="sm" disabled={isSavingItems} onClick={saveList}>
            {isSavingItems ? "Saving…" : "Save the checklist"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setLines(null)}>
            Cancel
          </Button>
          {/* Said plainly rather than discovered afterwards: this is a replace,
              so a line dropped here is a line the crew will never see. */}
          <span className="text-sm text-[var(--text-muted)]">
            This replaces the whole list.
          </span>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="This job has no checklist"
        body={
          canEditList
            ? "It was raised without a quote to lift one from. Write down what has to happen on site and the crew can tick it off — and it is what the invoice is worked out from afterwards."
            : (editRefusal ??
              "It was raised without a quote to lift one from. The crew still has the brief and the address.")
        }
        action={
          canEditList ? (
            <Button size="sm" onClick={() => startEditing([])}>
              <Plus className="size-4" aria-hidden="true" />
              Add the lines
            </Button>
          ) : undefined
        }
      />
    );
  }

  const commit = (id: string, completedQuantity: number) => {
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    onCommit([{ id, completedQuantity }]);
  };

  const done = items.filter((item) => item.completedQuantity >= item.quantity).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Progress
          value={percent}
          tone={percent === 100 ? "success" : "brand"}
          label="How far through the job is"
          className="min-w-0 flex-1"
        />
        <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--text-muted)]">
          {done}/{items.length} · {percent}%
        </span>
        {canEditList ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => startEditing(draftFrom(items))}
          >
            <Pencil className="size-4" aria-hidden="true" />
            Edit the list
          </Button>
        ) : null}
      </div>

      {/* Only where somebody would otherwise be hunting for the button: a
          completed job's checklist is obviously a record, but a crew on site
          wondering why they cannot correct a wrong line deserves the reason. */}
      {onSaveItems && editRefusal && !readOnly ? (
        <p className="text-sm text-[var(--text-muted)]">{editRefusal}</p>
      ) : null}

      <ul className="border-t border-[var(--table-divider)]">
        {items.map((item) => {
          const complete = item.completedQuantity >= item.quantity;
          const counted = item.quantity > 1;
          const draft = drafts[item.id];

          return (
            <li
              key={item.id}
              className="flex items-start gap-3 border-b border-[var(--table-divider)] py-2"
            >
              <Checkbox
                className="mt-0.5 shrink-0"
                checked={complete}
                disabled={readOnly || isSaving}
                aria-label={item.description}
                onCheckedChange={(value) =>
                  commit(item.id, value === true ? item.quantity : 0)
                }
              />

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm",
                    complete
                      ? "text-[var(--text-muted)] line-through"
                      : "text-[var(--text-body)]",
                  )}
                >
                  {item.description}
                </p>
                {item.notes ? (
                  <p className="text-sm text-[var(--text-muted)]">{item.notes}</p>
                ) : null}
              </div>

              {counted ? (
                <span className="flex shrink-0 items-center gap-1.5 text-sm">
                  <Input
                    className="h-8 w-16 text-right font-mono tabular-nums"
                    type="number"
                    min={0}
                    max={item.quantity}
                    inputMode="decimal"
                    aria-label={`Completed so far — ${item.description}`}
                    disabled={readOnly || isSaving}
                    value={draft ?? String(item.completedQuantity)}
                    onChange={(event) =>
                      setDrafts((previous) => ({ ...previous, [item.id]: event.target.value }))
                    }
                    onBlur={(event) => {
                      if (draft === undefined) return;
                      const parsed = Number(event.target.value);
                      if (!Number.isFinite(parsed)) {
                        setDrafts((previous) => {
                          const next = { ...previous };
                          delete next[item.id];
                          return next;
                        });
                        return;
                      }
                      commit(item.id, Math.min(Math.max(parsed, 0), item.quantity));
                    }}
                  />
                  <span className="font-mono tabular-nums text-[var(--text-muted)]">
                    / {item.quantity}
                    {item.unit ? ` ${item.unit}` : ""}
                  </span>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {!readOnly && Object.keys(drafts).length > 0 ? (
        // A blur commits, but a thumb on a phone often does not blur anything
        // before the screen is put away. This is the explicit way out.
        <Button
          size="sm"
          variant="secondary"
          disabled={isSaving}
          onClick={() => {
            const progress = Object.entries(drafts)
              .map(([id, value]) => {
                const item = items.find((entry) => entry.id === id);
                const parsed = Number(value);
                if (!item || !Number.isFinite(parsed)) return null;
                return {
                  id,
                  completedQuantity: Math.min(Math.max(parsed, 0), item.quantity),
                };
              })
              .filter((entry): entry is { id: string; completedQuantity: number } =>
                entry !== null,
              );
            setDrafts({});
            if (progress.length > 0) onCommit(progress);
          }}
        >
          Save the quantities
        </Button>
      ) : null}
    </div>
  );
}
