"use client";

import { useState, type ComponentProps, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChevronDown, SlidersHorizontal } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * The options row — the band between the page band and the records.
 *
 * Module-neutral, and in `components/records` for it: HR's directory wants the
 * same band over the same table, and a toolbar owned by the CRM is one HR has
 * to reach across a module boundary for. It used to live under
 * `components/crm/records`; every call site now imports it from here.
 *
 * Leads had its own header row, deals another, and people, companies and
 * sites a third — same intent, three orderings, three control heights. The
 * user's words: "the top bar area and header for kanban and lists should be
 * the same." So there is one row now, with one grammar.
 *
 * ## What order, and why that one
 *
 * The canvas puts the whole row in one sentence, read left to right:
 *
 *   [ search ] [ filter ] [ filter ] [ filter ] ···· 8 of 8 │ Columns  Export
 *
 * Search leads the narrowing controls because it is the shortest route to one
 * record and the most common reason to touch the row at all; the filters follow
 * because they are the same question asked more slowly. Which is the change the
 * user asked for — the filters used to sit on a row of their own above this one,
 * so "narrow it down" was answered in two places a band apart. Everything after
 * the spacer is about the table rather than about which records are in it — how
 * many there are, which columns are drawn — so it is pushed right and separated
 * by a hairline.
 *
 * The layout switch keeps its place at the very front, ahead of search. The
 * canvas has no such control to place, and leads already settled this one: it
 * used to sit at the far end beside the column picker, which made that page the
 * only one in the module where "which arrangement am I looking at" was answered
 * last. The rule after it is doing real work — it splits "which arrangement"
 * from "which records", two different questions that were reading as one run of
 * six buttons.
 *
 * Switching between table, list and board must not move this row — that is the
 * whole point of it. Anything that only makes sense in one layout disappears
 * from its slot rather than reshaping the row.
 *
 * ## It is a bar, not a gap with controls in it
 *
 * A fixed height and a hairline that runs the full width, pinned in the page's
 * sticky stack. That is what makes the table header below it able to pin too:
 * `--list-toolbar-h` is the offset every sticky thead in the module measures
 * from, and it only means anything if this row is actually that tall.
 *
 * ## On a phone the row is not a row
 *
 * Six controls at 36px wrap onto three lines and push the records themselves
 * below the fold, and the reader has to read six labels before they can look at
 * anything. So below `sm` the whole lot goes behind one button, and what stays
 * on screen is what somebody came for: the search box, and the records under
 * it. The button says how many filters are on — a collapsed control that hides
 * an active filter is how a list ends up looking empty for no visible reason.
 *
 * Which means a phone toolbar with no `search` is one outline button on a band
 * of its own — 60px of page spent on a control nobody came for. Every surface
 * that uses this passes a search now; a caller that genuinely has nothing to
 * search gets the button inline with whatever `end` holds rather than a band.
 */
export function ViewToolbar({
  layout,
  start,
  search,
  count,
  end,
  filterCount,
  className,
}: {
  /**
   * The layout switch. Kept out of `start` so it is always first and always
   * has the rule after it, whatever else the page passes.
   */
  layout?: ReactNode;
  /** How the records are narrowed: status, pipeline, owner. */
  start?: ReactNode;
  /** The search control. First in the row. */
  search?: ReactNode;
  /**
   * How many records are showing, and out of how many — "50 of 214".
   *
   * The artboards put it after the spacer, at the head of the display
   * controls, because it is the answer to the question the filters just
   * asked. Without it a heavily filtered list and an empty database read the
   * same from the toolbar down, and you have to scroll to the pager to find
   * out which.
   *
   * Desktop only: on a phone this row is already one button and a search box,
   * and a count there costs the search half its width.
   */
  count?: ReactNode;
  /** Display controls: column picker, card fields. */
  end?: ReactNode;
  /**
   * How many of `start`'s filters are actually narrowing anything. Only used
   * on the phone trigger, where the controls themselves are out of sight.
   */
  filterCount?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasControls = Boolean(layout || start || end);

  return (
    <div
      className={cn(
        // The hairline is what reads as "this is the toolbar, that is the
        // content" — the same seam the sidebar draws against the main pane.
        // Sticky: the row is the page's header, and a header that scrolls
        // away takes the filters and the search with it.
        //
        // It pins at `--stack-top` rather than at zero. Zero is where the page
        // band already is, so a toolbar pinned there slid underneath it (the
        // band is z 30) and took the table header — which pins at the same
        // published offset — with it. `--stack-top` is "the next free offset
        // in this scrollport", so the bar lands under whatever band is above
        // it without either of them stating a number.
        //
        // The `::before` paints the strip between the band and this bar in the
        // bar's own background, so rows do not show through the gutter as they
        // scroll past. Not a negative top margin: Tailwind's leading-minus
        // shorthand cannot negate a bare custom property — it emits a rule
        // containing a literal ellipsis, which is not CSS, and Turbopack then
        // fails the whole stylesheet, so *every* page 500s rather than this
        // one looking wrong. The horizontal bleed below is written as an
        // explicit `calc()` for the same reason.
        "sticky z-20 flex h-[var(--list-toolbar-h)] items-center gap-[7px] border-b border-[var(--border)] bg-[var(--surface-base)]",
        "before:absolute before:inset-x-0 before:bottom-full before:h-[var(--content-gutter-y)] before:bg-[var(--surface-base)] before:content-['']",
        // The bleed is what makes the hairline a seam across the page rather
        // than a rule floating inside the gutter — the same edge the app bar
        // above it draws.
        "mx-[calc(-1*var(--content-gutter-x))] px-[var(--content-gutter-x)]",
        className,
      )}
      style={{ top: "var(--stack-top, 0px)" }}
    >
      {/* Phone: one button for every control, and the search beside it. */}
      {hasControls ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 sm:hidden"
              aria-label="View and filters"
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              {filterCount ? `Filters (${filterCount})` : "View"}
            </Button>
          </SheetTrigger>
          {/* A sheet rather than a dropdown menu: these controls are
              themselves popovers and selects, and a menu that closes the
              moment one of them opens is a menu you cannot use. Bottom-
              anchored, which is where a thumb is. */}
          {/* `SheetContent` ships with no padding — call sites bring their
              own — so without this the title sits against the left edge of
              the screen and the controls run edge to edge. */}
          <SheetContent side="bottom" size="md" className="p-4 sm:hidden">
            <SheetHeader className="pb-3 text-left">
              <SheetTitle>View and filters</SheetTitle>
            </SheetHeader>
            {/* Stacked and full width — each control gets a line, which is
                the only way a nine-option filter reads on a phone. Labels go
                to the left edge: a button centres its label, which is right
                for a button you press and wrong for a row you read down.
                `.stacked-controls` in globals.css is what says so; setting
                the width from here only stretched the buttons and left every
                label centred, because the rule that turns a stretched button
                into a row keys off a class this sheet cannot put on controls
                it was handed. */}
            <div className="stacked-controls flex flex-col items-stretch gap-2">
              {layout}
              {start}
              {end}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      {layout ? (
        <div className="hidden shrink-0 items-center sm:flex">{layout}</div>
      ) : null}

      {/* The seam between "which arrangement" and "which records". Only drawn
          when there is something on both sides of it — a rule with nothing to
          separate is a tally mark. */}
      {layout && (search || start) ? (
        <span
          aria-hidden="true"
          className="mx-[3px] hidden h-[18px] w-px shrink-0 bg-[var(--border)] sm:block"
        />
      ) : null}

      {/* Search heads the narrowing controls. `ListSearch` carries its own
          250px; this box only has to let it fill the width on a phone and stop
          growing once there is room for the filters beside it. */}
      <div className="min-w-0 flex-1 sm:flex-none sm:shrink-0">{search}</div>

      {/* The filters scroll sideways rather than wrapping.
          ────────────────────────────────────────────────────────────────────
          Leads carries seven controls here — saved view, filters, stage,
          pipeline, sort — and at 1440px with a sidebar they do not fit. Wrapped
          onto three lines inside a bar with a fixed height they simply drew
          outside it, over the band above and the table header below.
          The height cannot become a floor instead: `--list-toolbar-h` is the
          offset every sticky table header in the module pins to, and a bar that
          is sometimes 44px and sometimes 150px puts those headers in the wrong
          place on exactly the pages with the most controls.
          So the chips scroll between `sm` and whatever width they happen to
          need, and collapse into the one "Filters (n)" button below `sm`. Two
          answers rather than one because they are two different problems: at
          900px there is room to reach the third chip by scrolling, at 390px
          there is not room for the first one.
          This box is also the row's spacer — it takes the slack, so the count
          and the display controls sit against the right edge. */}
      {/* The fade is the only cue that there is more to the right — a
          scrollbar is hidden here, and a control clipped mid-word reads as a
          bug rather than as an edge. It costs nothing when the row fits, since
          a short row has nothing at its right edge to fade. */}
      <div className="hidden min-w-0 flex-1 items-center gap-[7px] overflow-x-auto pr-1 sm:flex [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)]">
        {start}
      </div>

      {count ? (
        <span className="hidden shrink-0 font-mono text-xs tabular-nums text-[var(--text-subtle)] sm:inline">
          {count}
        </span>
      ) : null}

      {/* The same seam again, this time between "which records" and "how they
          are shown". */}
      {count && end ? (
        <span
          aria-hidden="true"
          className="mx-[3px] hidden h-[18px] w-px shrink-0 bg-[var(--border)] sm:block"
        />
      ) : null}

      <div className="hidden shrink-0 items-center gap-[7px] sm:flex">{end}</div>
    </div>
  );
}

/**
 * A filter, drawn the way the canvas draws it.
 *
 * "Status" alone tells you which question is being asked and leaves the answer
 * to a click; "Status Active" tells you both, and that is the difference
 * between a row of chips you have to interrogate and one you can read at a
 * glance. The label is muted, the current value is the page's strongest ink,
 * and the caret says it opens.
 *
 * 30px, from `size="sm"` — the canvas control height, and the one that leaves
 * the 44px bar a hairline of air above and below rather than filling it.
 *
 * Exported for the lists to hang their own popovers off: pass it `asChild` to
 * a `PopoverTrigger` or `DropdownMenuTrigger`.
 */
export function ViewToolbarChip({
  label,
  value,
  className,
  ...props
}: {
  /** What is being filtered — "Status", "Site", "Owner". */
  label: string;
  /** What it is filtered to — "Active", "All", "Anyone". */
  value: ReactNode;
} & Omit<ComponentProps<typeof Button>, "children" | "size" | "variant">) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("shrink-0 gap-1.5 whitespace-nowrap", className)}
      aria-label={`${label}: ${typeof value === "string" ? value : "change"}`}
      {...props}
    >
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold text-[var(--text-strong)]">{value}</span>
      <ChevronDown className="size-3 flex-none text-[var(--text-subtle)]" aria-hidden="true" />
    </Button>
  );
}
