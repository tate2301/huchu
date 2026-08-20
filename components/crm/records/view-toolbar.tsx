"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SlidersHorizontal } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * The options row — the band between the app bar and the records.
 *
 * Leads had its own header row, deals another, and people, companies and
 * sites a third — same intent, three orderings, three control heights. The
 * user's words: "the top bar area and header for kanban and lists should be
 * the same." So there is one row now, with one grammar, read left to right:
 *
 *   what you are looking at (the layout) │ how it is narrowed (filters)
 *   → …spacer… → how you find one (search) → what is shown (columns)
 *
 * The rule after the layout switch is doing real work: it splits the row into
 * "which arrangement" and "which records", which are different questions that
 * used to sit in one undifferentiated run of six buttons.
 *
 * Switching between table, list and board must not move this row — that is the
 * whole point of it. Anything that only makes sense in one layout (a sort
 * button on a board, say) disappears from its slot rather than reshaping the
 * row.
 *
 * ## It is a bar, not a gap with controls in it
 *
 * A fixed height and a hairline that runs the full width, pinned to the top of
 * the scrollport. That is what makes the table header below it able to pin too:
 * `--list-toolbar-h` is the offset every sticky thead in the module measures
 * from, and it only means anything if this row is actually that tall.
 *
 * ## On a phone the row is not a row
 *
 * Six controls at 36px wrap onto three lines and push the records themselves
 * below the fold, and the reader has to read six labels before they can look at
 * anything. So below `sm` the whole lot goes behind one button, and what stays
 * on screen is what somebody came for: the search box, and the records under
 * it.
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
  end,
  className,
}: {
  /**
   * The layout switch. Kept out of `start` so it is always first and always
   * has the rule after it, whatever else the page passes.
   */
  layout?: ReactNode;
  /** How the records are narrowed: status, pipeline, owner. */
  start?: ReactNode;
  /** The search control, right-aligned with the display controls. */
  search?: ReactNode;
  /** Display controls: column picker, card fields. */
  end?: ReactNode;
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
        // A sticky element pins to the scrollport's *padding* edge, and `main`
        // keeps a gutter of top padding — so the bar comes to rest a gutter's
        // worth below the app bar, and the rows scrolling past show through
        // the strip between them. The `::before` paints that strip in the
        // bar's own background, which is the one fix that does not involve
        // arguing with where sticky decides to stop.
        //
        // Not a negative top margin. Tailwind's leading-minus shorthand cannot
        // negate a bare custom property — it emits a rule containing a literal
        // ellipsis, which is not CSS, and Turbopack then fails the whole
        // stylesheet, so *every* page 500s rather than this one looking wrong.
        // The horizontal bleed below is written as an explicit `calc()` for
        // the same reason.
        "sticky top-0 z-10 flex h-[var(--list-toolbar-h)] items-center gap-2 border-b border-[var(--border-subtle)] bg-surface-base",
        "before:absolute before:inset-x-0 before:bottom-full before:h-[var(--content-gutter-y)] before:bg-surface-base before:content-['']",
        // The bleed is what makes the hairline a seam across the page rather
        // than a rule floating inside the gutter — the same edge the app bar
        // above it draws.
        "mx-[calc(-1*var(--content-gutter-x))] px-[var(--content-gutter-x)]",
        className,
      )}
    >
      {/* Phone: one button for every control, and the search beside it. */}
      {hasControls ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="sm:hidden" aria-label="View and filters">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              View
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

      {/* The left half scrolls sideways rather than wrapping.
          ────────────────────────────────────────────────────────────────────
          Leads carries seven controls here — saved view, filters, stage,
          pipeline, sort — and at 1440px with a sidebar they do not fit. Wrapped
          onto three lines inside a bar with a fixed height they simply drew
          outside it, over the app bar above and the table header below.
          The height cannot become a floor instead: `--list-toolbar-h` is the
          offset every sticky table header in the module pins to, and a bar that
          is sometimes 52px and sometimes 150px puts those headers in the wrong
          place on exactly the pages with the most controls.
          So the controls scroll and the two things somebody came for — search,
          and what is shown — stay outside the scroller, pinned right. */}
      {/* The fade is the only cue that there is more to the right — a
          scrollbar is hidden here, and a control clipped mid-word reads as a
          bug rather than as an edge. It costs nothing when the row fits, since
          a short row has nothing at its right edge to fade. */}
      <div className="hidden min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-1 sm:flex [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)]">
        {layout ? <div className="flex shrink-0 items-center">{layout}</div> : null}

        {/* The seam between "which arrangement" and "which records". Only drawn
            when there is something on both sides of it — a rule with nothing to
            separate is a tally mark. */}
        {layout && start ? (
          <span
            aria-hidden="true"
            className="h-5 w-px shrink-0 bg-[var(--border-subtle)]"
          />
        ) : null}

        <div className="flex shrink-0 items-center gap-2">{start}</div>
      </div>

      {/* Search stays out of the sheet: it is how you find one record, which
          is the most common reason to touch this row at all. */}
      <div className="min-w-0 flex-1 sm:flex-none sm:shrink-0">{search}</div>

      <div className="hidden shrink-0 items-center gap-2 sm:flex">{end}</div>
    </div>
  );
}
