"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";

import { Alert, Button } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { Plus } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

import { ListSearch } from "./list-search";
import { ViewToolbar } from "@/components/records/view-toolbar";
import { getApiErrorMessage } from "@/lib/api-client";

/**
 * The frame every CRM record list shares: title, search box, filters, a
 * create button, and consistent error handling. Keeping it in one place is
 * what stops people, companies, deals and sites drifting into four
 * differently-shaped pages.
 *
 * The title and the create button are registered with the top app bar rather
 * than drawn here. A page that repeats its own name below a bar that already
 * says it is spending a band of vertical space on nothing, and the rule that
 * band drew was the seam between the bar and the content.
 */
export function RecordListShell({
  title,
  search,
  onSearchChange,
  searchPlaceholder,
  searchNoun,
  layout,
  filters,
  display,
  filterCount,
  count,
  createLabel,
  onCreate,
  error,
  width = "full",
  children,
}: {
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  /**
   * What the phone's placeholder says after "Search". Defaults to the page's
   * own title, which is the right noun on every list here — pass one only
   * where the title is not what the rows are ("Collections" holding invoices).
   */
  searchNoun?: string;
  /**
   * The layout switch — `LayoutSwitch`, on every list that has more than one
   * arrangement. Separate from `filters` so the toolbar can put the rule in the
   * right place without a page having to remember to.
   */
  layout?: ReactNode;
  filters?: ReactNode;
  /** Display controls — column picker, card fields — pushed right. */
  display?: ReactNode;
  /**
   * How many of `filters` are actually narrowing the list. Only reaches the
   * phone, where the filters live behind one button and an active one would
   * otherwise be invisible.
   */
  filterCount?: number;
  /**
   * How many rows are showing, out of how many there are — "50 of 214".
   *
   * Sits in the toolbar beside the display controls, which is where the
   * artboards put it: it answers whatever the filters just asked, and belongs
   * next to the question rather than at the foot of the table.
   */
  count?: ReactNode;
  /** Omit both to get a list with no create button — quotes and invoices are
   *  raised against a deal, never from a directory of them. */
  createLabel?: string;
  onCreate?: () => void;
  error?: unknown;
  /**
   * "narrow" caps the whole surface at max-w-3xl. A register of one-line
   * items — tasks, receipts, work orders — reads as a column, and stretching
   * it across a wide screen just puts air between the title and its facts.
   */
  width?: "full" | "narrow";
  children: ReactNode;
}) {
  const actions = useMemo(
    () =>
      createLabel && onCreate ? (
        <Button
          variant="primary"
          startIcon={<Plus className="h-4 w-4" />}
          onClick={onCreate}
        >
          {createLabel}
        </Button>
      ) : null,
    [createLabel, onCreate],
  );

  return (
    <div
      className={cn(width === "narrow" && "max-w-3xl")}
      // The next rung of the sticky stack, handed down for the table header to
      // pin at. It has to be published here rather than on the toolbar: the
      // toolbar is the table's sibling, not its ancestor, so nothing it
      // declares reaches the thead. And it cannot be written straight onto
      // `--stack-top`, because a custom property defined in terms of itself is
      // a cycle and resolves to nothing — hence the relay through
      // `--stack-next`, the same one the accounting shells use.
      style={
        {
          "--stack-next": "calc(var(--stack-top, 0px) + var(--list-toolbar-h))",
        } as CSSProperties
      }
    >
      <PageChrome title={title}>{actions}</PageChrome>

      <ViewToolbar
        layout={layout}
        start={filters}
        search={
          <ListSearch
            value={search}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            noun={searchNoun ?? title.toLowerCase()}
          />
        }
        count={count}
        end={display}
        filterCount={filterCount}
      />

      {error ? (
        <Alert
          tone="danger"
          title={`Unable to load ${title.toLowerCase()}`}
          className="mt-4"
        >
          {getApiErrorMessage(error)}
        </Alert>
      ) : null}

      {/* Flush against the toolbar, with no gap of its own.
          The toolbar's hairline is the seam between the controls and the
          records, and the artboards run the column header straight off the
          underside of it. A gap here put a strip of page between two sticky
          bands, and rows slid through it as they scrolled. */}
      <div style={{ "--stack-top": "var(--stack-next)" } as CSSProperties}>{children}</div>
    </div>
  );
}
