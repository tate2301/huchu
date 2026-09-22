"use client";

import * as React from "react";
import Link from "next/link";

import { Plus, Search, SearchX, Warning, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

import styles from "./settings.module.css";

/**
 * What the list is currently able to show.
 *
 *   - `ready`      — rows.
 *   - `loading`    — the first load. Skeleton rows; `children` is ignored.
 *   - `empty`      — there is nothing, and no search narrowing it. The empty
 *                    panel carries the one verb that fixes it.
 *   - `no-matches` — there *is* something, the search just does not match it.
 *                    The search field stays open with its text in it.
 *   - `failed`     — a refresh failed. The rows already on screen stay, muted,
 *                    under a banner with Retry — a list that empties itself
 *                    because a poll failed is a list that lies.
 */
export type ListColumnState = "ready" | "loading" | "empty" | "no-matches" | "failed";

export type ListColumnSearch = {
  value: string;
  onChange: (value: string) => void;
  /** Controlled open state. Omit both to let the column manage it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
};

export type ListColumnProps = {
  /** Plural, as the heading reads: "Job grades", "Sections", "Users". */
  title: string;
  /**
   * Singular, lower case, for the labelled verb and the empty state: "job
   * grade". `aria-label` becomes "New job grade" — rule 2 wants the button
   * labelled with the thing it makes, not with "New".
   */
  noun: string;
  count?: number;
  state?: ListColumnState;
  /**
   * The column header line — rule 6. `{ row: "Section", value: "People" }`.
   * Omit it only for a list whose rows carry no value column at all.
   */
  columns?: { row: string; value?: string };
  search?: ListColumnSearch;
  /**
   * A filter row, drawn between the header row and the column header line —
   * `Audit.dc.html`'s row of selects, in a register. The caller draws it,
   * because what a list filters on is the caller's own domain; this layer only
   * says where it sits.
   */
  filters?: React.ReactNode;
  /** The primary verb. Pass one of the two. */
  onNew?: () => void;
  newHref?: string;
  /** Overrides "No job grades" in the empty panel. */
  emptyLabel?: string;
  /** Shown in the empty panel's tile. Defaults to a plus. */
  emptyIcon?: React.ComponentType<{ className?: string }>;
  /** Called by the failed banner's Retry. */
  onRetry?: () => void;
  /** Overrides "Couldn't refresh". */
  failureLabel?: string;
  /** The rows. `<ListRow />`s, in an order the caller decides. */
  children?: React.ReactNode;
  className?: string;
};

/**
 * The list column: its own heading, its own verb, its own states.
 *
 * The heading row is the list's top edge, so per rule 2 the list's verb lives
 * there and nowhere else — this is the seam that stopped the old master-data
 * page drawing its New button twice, once in a page band and once inside the
 * empty state. The empty panel's button is the same action, not a second one:
 * when there is nothing on screen there is no list for a header to sit on.
 *
 * Search collapses to an icon button and expands over the title, because a
 * search field parked open above an eight-row list is a control asking to be
 * used for no reason.
 */
export function ListColumn({
  title,
  noun,
  count,
  state = "ready",
  columns,
  search,
  filters,
  onNew,
  newHref,
  emptyLabel,
  emptyIcon,
  onRetry,
  failureLabel = "Couldn’t refresh",
  children,
  className,
}: ListColumnProps) {
  const [openInternally, setOpenInternally] = React.useState(false);
  const searchOpen =
    search?.open ?? (openInternally || state === "no-matches" || Boolean(search?.value));

  const setSearchOpen = React.useCallback(
    (next: boolean) => {
      setOpenInternally(next);
      search?.onOpenChange?.(next);
    },
    [search],
  );

  const newLabel = `New ${noun}`;
  const EmptyIcon = emptyIcon ?? Plus;

  return (
    <div className={cn(styles.list, className)}>
      <div className={styles.listHead}>
        {search && searchOpen ? (
          <SearchField
            search={search}
            noun={noun}
            onClose={() => {
              search.onChange("");
              setSearchOpen(false);
            }}
          />
        ) : (
          <>
            <h2 className={styles.listTitle}>{title}</h2>
            {typeof count === "number" ? (
              <span className={styles.listCount}>{count}</span>
            ) : null}
            <span className={styles.spacer} />
            {search ? (
              <button
                type="button"
                aria-label={`Search ${title.toLowerCase()}`}
                className={styles.iconButton}
                onClick={() => setSearchOpen(true)}
              >
                <Search />
              </button>
            ) : null}
          </>
        )}
        <NewButton label={newLabel} onNew={onNew} href={newHref} />
      </div>

      {filters}

      {state === "failed" ? (
        <div role="alert" className={styles.failure}>
          <Warning />
          <span className={styles.failureText}>{failureLabel}</span>
          {onRetry ? (
            <button type="button" className={styles.failureRetry} onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {state === "empty" ? (
        <div className={styles.placeholder}>
          <span className={styles.placeholderTile}>
            <EmptyIcon />
          </span>
          <p className={styles.placeholderText}>
            {emptyLabel ?? `No ${title.toLowerCase()}`}
          </p>
          <NewButton
            label={newLabel}
            onNew={onNew}
            href={newHref}
            className={styles.placeholderButton}
            showLabel
          />
        </div>
      ) : null}

      {state === "no-matches" ? (
        <div className={styles.placeholder}>
          <span className={styles.placeholderTile}>
            <SearchX />
          </span>
          <p className={styles.placeholderText}>No matches</p>
          <button
            type="button"
            className={cn(styles.button, styles.placeholderButton)}
            onClick={() => {
              search?.onChange("");
              setSearchOpen(false);
            }}
          >
            <X />
            Clear
          </button>
        </div>
      ) : null}

      {state === "loading" ? (
        <div
          className={styles.listBody}
          role="status"
          aria-label={`Loading ${title.toLowerCase()}`}
        >
          {SKELETON_WIDTHS.map((width, index) => (
            <div key={index} className={styles.skeletonRow} aria-hidden="true">
              <span className={styles.skeletonBar} style={{ width: 40 }} />
              <span
                className={styles.skeletonBar}
                style={{ flexGrow: 1, maxWidth: width }}
              />
              <span className={styles.spacer} />
              <span className={styles.skeletonBar} style={{ width: 18 }} />
            </div>
          ))}
        </div>
      ) : null}

      {state === "ready" || state === "failed" ? (
        <ul className={styles.listBody} data-stale={state === "failed" ? "true" : "false"}>
          {columns ? (
            <li className={styles.listColumns} aria-hidden="true">
              <span className={styles.listColumnRow}>{columns.row}</span>
              {columns.value ? (
                <span className={styles.listColumnValue}>{columns.value}</span>
              ) : null}
            </li>
          ) : null}
          {children}
        </ul>
      ) : null}
    </div>
  );
}

/** The skeleton's name bars vary so six rows do not read as one grey block. */
const SKELETON_WIDTHS = [116, 142, 104, 130, 96, 124];

function NewButton({
  label,
  onNew,
  href,
  className,
  showLabel,
}: {
  label: string;
  onNew?: () => void;
  href?: string;
  className?: string;
  showLabel?: boolean;
}) {
  if (!onNew && !href) return null;

  const classes = cn(styles.button, styles.buttonPrimary, className);
  const body = (
    <>
      <Plus />
      {showLabel ? label : "New"}
    </>
  );

  // `aria-label` names the thing even when the visible label is just "New".
  if (href) {
    return (
      <Link href={href} aria-label={label} className={classes}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" aria-label={label} className={classes} onClick={onNew}>
      {body}
    </button>
  );
}

function SearchField({
  search,
  noun,
  onClose,
}: {
  search: ListColumnSearch;
  noun: string;
  onClose: () => void;
}) {
  const id = React.useId();

  return (
    <div className={styles.searchWrap}>
      <Search />
      <label htmlFor={id} className={styles.srOnly}>
        {`Search ${noun}s`}
      </label>
      <input
        id={id}
        type="search"
        autoFocus
        className={styles.searchInput}
        value={search.value}
        placeholder={search.placeholder}
        onChange={(event) => search.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      />
    </div>
  );
}

export type ListRowProps = {
  /** The row's name. One line, truncated — never wrapped. */
  name: string;
  /** The 44px mono code column. */
  code?: string;
  /** A 30px avatar or initials tile, instead of a code. Raises the row to 50px. */
  mark?: React.ReactNode;
  /** Right-aligned. A number renders mono and tabular; pass a node for anything else. */
  value?: React.ReactNode;
  /** A 6px amber dot before the value: this row needs attention. */
  attention?: boolean;
  attentionLabel?: string;
  selected?: boolean;
  href?: string;
  onSelect?: () => void;
  className?: string;
};

/** One row of a `<ListColumn />`. */
export function ListRow({
  name,
  code,
  mark,
  value,
  attention,
  attentionLabel = "Needs attention",
  selected,
  href,
  onSelect,
  className,
}: ListRowProps) {
  const body = (
    <>
      {mark ? <span className={styles.listRowMark}>{mark}</span> : null}
      {code ? <span className={styles.listRowCode}>{code}</span> : null}
      <span style={{ flexGrow: 1, minWidth: 0 }}>
        <span className={styles.listRowName}>{name}</span>
      </span>
      {attention ? (
        <span
          className={styles.railAttention}
          role="img"
          aria-label={attentionLabel}
        />
      ) : null}
      {value !== undefined && value !== null ? (
        <span className={styles.listRowValue}>{value}</span>
      ) : null}
    </>
  );

  const classes = cn(styles.listRow, className);
  const markAttr = mark ? "true" : "false";

  return (
    <li>
      {href ? (
        <Link
          href={href}
          data-mark={markAttr}
          aria-current={selected ? "true" : undefined}
          className={classes}
        >
          {body}
        </Link>
      ) : (
        <button
          type="button"
          data-mark={markAttr}
          aria-current={selected ? "true" : undefined}
          className={classes}
          onClick={onSelect}
        >
          {body}
        </button>
      )}
    </li>
  );
}
