"use client";

import { SegmentedControl } from "@corelithzw/ui/components/segmented-control";
import { Kanban, ListBullets, TableRows, type LucideIcon } from "@corelithzw/ui/lib/icons";

/**
 * How you are looking at a list: as a table, as rows, or as a board.
 *
 * Every CRM list grew its own version of this control, with its own wording and
 * its own order — "Board / List" on deals, "List / Board" on people, nothing at
 * all on sites. Which meant the first control on every list page was in a
 * different place and said a different thing, and switching pages cost a read.
 *
 * One control, one order, one vocabulary, and it is always the leftmost thing
 * in the options row — because "what am I looking at" comes before "how is it
 * narrowed", which comes before "how do I find one".
 *
 * The label is dropped on narrow screens and the mark carries it, which is what
 * lets three views sit in a row that also has to hold filters and a search box.
 */

export type RecordLayout = "TABLE" | "LIST" | "BOARD";

const LAYOUT: Record<RecordLayout, { label: string; icon: LucideIcon }> = {
  TABLE: { label: "Table", icon: TableRows },
  LIST: { label: "List", icon: ListBullets },
  BOARD: { label: "Board", icon: Kanban },
};

export function LayoutSwitch<L extends RecordLayout>({
  value,
  onChange,
  options,
}: {
  value: L;
  onChange: (next: L) => void;
  /** Which arrangements this list has. A directory with no stages has no board. */
  options: readonly L[];
}) {
  return (
    <SegmentedControl<L>
      value={value}
      onValueChange={onChange}
      ariaLabel="How the records are arranged"
      options={options.map((option) => {
        const Icon = LAYOUT[option].icon;
        return {
          value: option,
          label: (
            <span className="flex items-center gap-1.5">
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {/* Readable where there is room, and never the reason the row
                  runs out of it where there is not.
                  ─────────────────────────────────────────────────────────
                  Visible below `sm` because below `sm` this is not in the
                  toolbar at all — it is stacked full width inside the view
                  sheet, where two unlabelled icons are a guess. Hidden from
                  `sm` to `lg`, which is the narrow-desktop toolbar with six
                  controls to fit. Back from `lg`, where there is room.
                  The painted label is decorative and the `sr-only` one is the
                  accessible name, so the segment is announced the same at
                  every width and never announced twice. */}
              <span aria-hidden="true" className="sm:hidden lg:inline">
                {LAYOUT[option].label}
              </span>
              <span className="sr-only">{LAYOUT[option].label}</span>
            </span>
          ),
        };
      })}
    />
  );
}
