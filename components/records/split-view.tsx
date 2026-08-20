"use client";

import type { ReactNode } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { ArrowLeft } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * A list beside the one thing in it you are looking at.
 *
 * The record page's sections are all registers: tasks, documents, visits. You
 * open one to find something, and then you want to *work* on it — change a due
 * date, read the outcome, tick it off — and every one of those cost a dialog
 * that covered the list you were reading. Which meant losing your place in the
 * list to change one field of one row, and doing it again for the next row.
 *
 * The split is the answer the whole industry landed on: the register stays, and
 * the thing you picked opens beside it. Move to the next row and the panel
 * follows; nothing is covered and nothing is lost.
 *
 * ## Why a container query and not a breakpoint
 *
 * This does not know how wide the page is, and must not care. A section renders
 * in the middle column of a three-column record page on a desktop, full width
 * on a phone, and inside a 22rem rail if somebody ever puts one there. A
 * `md:` breakpoint would put two panes into 400px because the *window* is wide,
 * which is exactly the failure the record page's own columns already avoid.
 * `@2xl` is 42rem of *this element*, which is the number that actually decides
 * whether two panes fit.
 *
 * Worth knowing what that means in practice on a record page: with the standing
 * info column open, a 1440px desktop leaves the middle column about 29rem and
 * this stays a drilldown. Collapse the info column — the chevron at the top of
 * it — and the same section is a split. That is the correct trade rather than a
 * bug: a record cannot show its properties, its section list, a register *and*
 * a detail pane in 1440 pixels, and the one the reader can give up is the one
 * they choose.
 *
 * ## Below that width it is a drilldown, not a sheet
 *
 * Same state, no portal: the list gives way to the detail and a back arrow
 * returns. A sheet would need the width measured in JavaScript, and would put a
 * second scrolling surface over a page that already scrolls — the thing that
 * makes a phone's back gesture ambiguous.
 */
export function SplitView({
  list,
  detail,
  detailTitle,
  onClose,
  placeholder = "Pick one to see it here.",
  className,
}: {
  /** The register. Always rendered; hidden only while a narrow pane drills in. */
  list: ReactNode;
  /** The chosen item, or nothing when none is chosen. */
  detail?: ReactNode;
  /** What the drilled-in view calls itself, beside the back arrow. */
  detailTitle?: string;
  onClose?: () => void;
  /** What the empty half says while nothing is picked. */
  placeholder?: string;
  className?: string;
}) {
  const open = Boolean(detail);

  return (
    <div className={cn("@container", className)}>
      <div className="@2xl:grid @2xl:grid-cols-[minmax(0,1fr)_18rem] @2xl:items-start">
        <div className={cn("min-w-0 @2xl:pr-4", open && "hidden @2xl:block")}>{list}</div>

        {open ? (
          <div className="min-w-0 @2xl:border-l @2xl:border-[var(--border-subtle)] @2xl:pl-4">
            {/* The header exists only in the drilled-in view: side by side, the
                panel is obviously the thing you clicked and does not need to
                introduce itself. */}
            <div className="mb-3 flex items-center gap-2 @2xl:hidden">
              <IconButton aria-label="Back to the list" onClick={onClose}>
                <ArrowLeft />
              </IconButton>
              {detailTitle ? (
                <h4 className="min-w-0 truncate text-sm font-semibold text-[var(--text-strong)]">
                  {detailTitle}
                </h4>
              ) : null}
            </div>
            {detail}
          </div>
        ) : (
          // Only wide enough to be worth saying. On a narrow pane the list is
          // already filling the space and a "pick one" note under it would be
          // an instruction for a layout the reader cannot see.
          <div className="hidden @2xl:flex @2xl:min-h-40 @2xl:items-center @2xl:justify-center @2xl:border-l @2xl:border-[var(--border-subtle)] @2xl:pl-4">
            <p className="text-center text-sm text-[var(--text-subtle)]">{placeholder}</p>
          </div>
        )}
      </div>
    </div>
  );
}
