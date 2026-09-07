"use client";

import type { ReactNode } from "react";

import { Badge } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import { Plus, Trash2, type LucideIcon } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * A workflow drawn as the sequence it is.
 *
 * The rule editor used to be a form: a trigger picker, then a list of
 * conditions, then a list of actions, each in its own box with a heading. That
 * is a faithful rendering of the data and a poor rendering of the thing — what
 * somebody has in their head is "when this happens, if that holds, do these in
 * order", which is a line, not three lists. Drawing the line means the order
 * is visible, the gaps between steps are where you add one, and a rule with
 * four actions reads as four steps rather than as a taller box.
 *
 * The rail is drawn per node rather than once behind the column so the last
 * node's line stops at its own marker instead of trailing into the gap below.
 */

export type NodeTone = "trigger" | "filter" | "action";

const TONE_STYLE: Record<NodeTone, { marker: string; band: string; label: string }> = {
  trigger: {
    marker: "bg-[var(--brand)] text-[var(--brand-contrast)]",
    band: "border-[var(--brand)]",
    label: "Trigger",
  },
  filter: {
    marker: "bg-[var(--surface-subtle)] text-[var(--text-muted)]",
    band: "border-[var(--border)]",
    label: "Filter",
  },
  action: {
    marker: "bg-[var(--surface-subtle)] text-[var(--text)]",
    band: "border-[var(--border)]",
    label: "Step",
  },
};

export function SequenceNode({
  tone,
  icon: Icon,
  title,
  summary,
  badge,
  step,
  onRemove,
  removeLabel,
  children,
  last,
}: {
  tone: NodeTone;
  icon: LucideIcon;
  title: string;
  /** The one-line version, shown under the title. */
  summary?: ReactNode;
  badge?: string;
  /** Position in the run order, for action nodes. */
  step?: number;
  onRemove?: () => void;
  removeLabel?: string;
  children?: ReactNode;
  /** The last node draws no trailing rail. */
  last?: boolean;
}) {
  const style = TONE_STYLE[tone];

  return (
    <li className="relative flex gap-3 pb-2">
      {last ? null : (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[15px] top-8 w-px bg-[var(--border-subtle)]"
        />
      )}

      <span
        className={cn(
          "relative z-10 mt-1 flex size-8 shrink-0 items-center justify-center rounded-full",
          style.marker,
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>

      <div
        className={cn(
          "min-w-0 flex-1 rounded-[var(--card-radius)] border-l-2 border-y border-r border-[var(--border)] bg-[var(--surface)] p-3",
          style.band,
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {typeof step === "number" ? (
                <span className="text-sm text-[var(--text-subtle)]">Step {step}</span>
              ) : (
                <span className="text-sm text-[var(--text-subtle)]">{style.label}</span>
              )}
              <span className="text-sm font-medium">{title}</span>
              {badge ? <Badge tone="neutral">{badge}</Badge> : null}
            </div>
            {summary ? (
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">{summary}</p>
            ) : null}
          </div>

          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={removeLabel ?? `Remove ${title}`}
              onClick={onRemove}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        {children ? <div className="mt-3 space-y-2">{children}</div> : null}
      </div>
    </li>
  );
}

/**
 * The gap between two steps, and the only place a step gets added.
 *
 * An "Add action" button parked above a list adds to the end, which means
 * inserting in the middle is a delete-and-retype exercise. Putting the plus in
 * the gap makes position part of the gesture.
 */
export function SequenceInsert({
  options,
  onSelect,
  label = "Add a step",
}: {
  options: Array<{ value: string; label: string; description?: string }>;
  onSelect: (value: string) => void;
  label?: string;
}) {
  return (
    <li className="relative flex items-center gap-3 py-1">
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-[15px] top-0 w-px bg-[var(--border-subtle)]"
      />

      <span className="relative z-10 flex size-8 shrink-0 items-center justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* The dashed circle stays 20px — it sits on a rail between
                steps and a bigger one would read as a step itself. The
                button around it is 32px, so a thumb has something to hit. */}
            <button
              type="button"
              aria-label={label}
              className="group/insert flex size-8 items-center justify-center rounded-full"
            >
              <span className="flex size-5 items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors group-hover/insert:border-[var(--brand)] group-hover/insert:text-[var(--text)]">
                <Plus className="size-3" aria-hidden="true" />
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {options.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => onSelect(option.value)}>
                <span className="flex flex-col">
                  <span>{option.label}</span>
                  {option.description ? (
                    <span className="text-sm text-[var(--text-muted)]">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>

      <span className="h-px flex-1" />
    </li>
  );
}

export function SequenceCanvas({ children }: { children: ReactNode }) {
  return <ol className="relative">{children}</ol>;
}

/**
 * The compact version, for a list of workflows.
 *
 * Somebody scanning a list wants to know what a rule does without opening it,
 * and the sentence form ("when a lead is created, and value is more than 5000
 * → create a task") is longer than the row it has to fit in. Chips in run
 * order say the same thing in the space available.
 */
export function SequenceStrip({
  steps,
}: {
  steps: Array<{ label: string; tone: NodeTone; icon: LucideIcon }>;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {steps.map((item, index) => {
        const Icon = item.icon;
        return (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span aria-hidden="true" className="text-[var(--text-subtle)]">
                →
              </span>
            ) : null}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-sm",
                item.tone === "trigger"
                  ? "bg-[var(--brand-soft,var(--surface-subtle))] text-[var(--text)]"
                  : "bg-[var(--surface-subtle)] text-[var(--text-muted)]",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
