"use client";

import { useMemo, type ReactNode } from "react";

import { Alert, Button } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { Plus } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { ListSearch } from "./list-search";
import { ViewToolbar } from "./view-toolbar";
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
  /** Display controls — column picker, card fields — right-aligned with search. */
  display?: ReactNode;
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
    <div className={cn("space-y-4", width === "narrow" && "max-w-3xl")}>
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
        end={display}
      />

      {error ? (
        <Alert tone="danger" title={`Unable to load ${title.toLowerCase()}`}>
          {getApiErrorMessage(error)}
        </Alert>
      ) : null}

      {children}
    </div>
  );
}
