"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type StageMenuStage = {
  id: string;
  label: string;
  /** Won and Lost: outcomes rather than steps, listed after a rule. */
  outcome?: boolean;
};

/** Typing somewhere, where a bare letter is a letter and not a shortcut. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * Where a record is in its lifecycle, as one button in the app bar that opens
 * the list of everywhere it could be.
 *
 * One button rather than every stage named inline: the bar is the record's
 * standing controls and has room for a word, not for eight. S opens it from
 * anywhere on the record, and once it is open the number beside a stage moves
 * the record there — the steps first, then the outcomes after a rule, because
 * Won and Lost are where a record ends, not the next step along.
 *
 * The dot is the record's progress: hollow at the start, filling as it moves,
 * solid once it has an outcome.
 */
export function StageMenu({
  stages,
  currentId,
  onPick,
  disabled,
  label = "Stage",
}: {
  stages: StageMenuStage[];
  currentId: string;
  onPick: (stage: StageMenuStage) => void;
  disabled?: boolean;
  /** What the stages are of, for the button's accessible name. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = stages.find((stage) => stage.id === currentId);
  const steps = useMemo(() => stages.filter((stage) => !stage.outcome), [stages]);
  const outcomes = useMemo(() => stages.filter((stage) => stage.outcome), [stages]);
  const ordered = useMemo(() => [...steps, ...outcomes], [steps, outcomes]);
  const stepIndex = steps.findIndex((stage) => stage.id === currentId);
  const progress = current?.outcome
    ? 1
    : steps.length > 1 && stepIndex >= 0
      ? stepIndex / (steps.length - 1)
      : 0;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      if (open) {
        // A number picks while the menu is up.
        const index = Number.parseInt(event.key, 10) - 1;
        const stage = Number.isFinite(index) ? ordered[index] : undefined;
        if (stage) {
          event.preventDefault();
          setOpen(false);
          if (stage.id !== currentId) onPick(stage);
        }
        return;
      }
      if ((event.key === "s" || event.key === "S") && !disabled) {
        if (document.querySelector("[role='dialog'][data-state='open'], [role='menu'][data-state='open']")) return;
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentId, disabled, onPick, open, ordered]);

  const item = (stage: StageMenuStage) => {
    const index = ordered.indexOf(stage);
    const isCurrent = stage.id === currentId;
    return (
      <DropdownMenuItem
        key={stage.id}
        onSelect={() => {
          if (!isCurrent) onPick(stage);
        }}
        className={cn(isCurrent && "font-semibold")}
      >
        <span className="inline-flex size-4 items-center justify-center" aria-hidden="true">
          {isCurrent ? <Check className="size-3.5" /> : null}
        </span>
        {stage.label}
        {index < 9 ? <DropdownMenuShortcut>{index + 1}</DropdownMenuShortcut> : null}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rec-stage-btn"
          disabled={disabled}
          aria-label={`${label}: ${current?.label ?? "None"}`}
          aria-keyshortcuts="S"
          title={`${label} (S)`}
        >
          <span
            className="rec-stage-dot"
            aria-hidden="true"
            style={{ ["--p" as string]: progress }}
            data-outcome={current?.outcome || undefined}
          />
          <span className="rec-stage-l">{current?.label ?? "No stage"}</span>
          <ChevronDown className="size-3.5 shrink-0 text-[var(--color-ink-3)]" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {steps.map(item)}
        {outcomes.length > 0 ? <DropdownMenuSeparator /> : null}
        {outcomes.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
