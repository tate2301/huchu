"use client";

import * as React from "react";

import { Button, ButtonGroup, Kbd } from "./button";
import { useShortcut } from "./shortcuts";

/**
 * A table fills its region and scrolls inside it; its head sticks to the top
 * and its footer to the bottom. Put the finding, the table and anything that
 * scrolls with it in `children`; the footer goes in `foot`.
 */
export function TableShell({
  label,
  children,
  foot,
}: {
  label: string;
  children: React.ReactNode;
  foot?: React.ReactNode;
}) {
  return (
    <div className="table-shell">
      <div className="table-scroll" tabIndex={0} aria-label={label}>
        {children}
      </div>
      {foot}
    </div>
  );
}

/** Which rows are selected, by id, and the page's select-all box. */
export function useSelection<Id extends string>(ids: readonly Id[]) {
  const [selected, setSelected] = React.useState<ReadonlySet<Id>>(() => new Set());
  // Rows that left the page leave the selection with them.
  const present = React.useMemo(() => new Set(ids), [ids]);
  const live = React.useMemo(() => new Set([...selected].filter((id) => present.has(id))), [selected, present]);
  const toggle = React.useCallback((id: Id, on?: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const clear = React.useCallback(() => setSelected(new Set()), []);
  const all = ids.length > 0 && ids.every((id) => live.has(id));
  const some = !all && ids.some((id) => live.has(id));
  const toggleAll = React.useCallback(
    () => setSelected(all ? new Set() : new Set(ids)),
    [all, ids],
  );
  return { selected: live, isSelected: (id: Id) => live.has(id), toggle, clear, all, some, toggleAll };
}

/** The select box in a table's first column. */
export function SelectCell({
  checked,
  indeterminate = false,
  onChange,
  label,
  head = false,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
  head?: boolean;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const box = (
    <label className="check">
      <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={onChange} />
    </label>
  );
  return head ? <th className="sel">{box}</th> : <td className="sel">{box}</td>;
}

export type FootSum = { label: React.ReactNode; value: React.ReactNode };

/**
 * The table's footer: the count, the sums and the pages. When rows are
 * selected, the selection row rises into it with the count, the sum and what
 * can be done with them; Esc clears it.
 */
export function TableFoot({
  range,
  sums = [],
  page,
  selection,
}: {
  /** "1 to 9 of 142". */
  range?: React.ReactNode;
  sums?: FootSum[];
  page?: { onPrevious?: () => void; onNext?: () => void };
  selection?: {
    count: number;
    sum?: FootSum;
    actions?: React.ReactNode;
    onClear: () => void;
  };
}) {
  const selectedCount = selection?.count ?? 0;
  useShortcut("Esc", () => selection?.onClear(), { enabled: selectedCount > 0 });
  return (
    <div className="table-foot" data-selected={selectedCount > 0 ? "true" : "false"}>
      {selection ? (
        <div className="foot-row foot-sel" role="region" aria-label="Selection" aria-hidden={selectedCount === 0}>
          <span>
            <b>{selectedCount}</b> selected
          </span>
          {selection.sum ? (
            <span className="foot-sum">
              {selection.sum.label} <b>{selection.sum.value}</b>
            </span>
          ) : null}
          {selection.actions ? <ButtonGroup aria-label="Do with the selection">{selection.actions}</ButtonGroup> : null}
          <div className="end">
            <Kbd>Esc</Kbd>
            <Button variant="quiet" icon="x" onClick={selection.onClear} tabIndex={selectedCount ? 0 : -1}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}
      <div className="foot-row foot-main">
        {range ? <span className="num">{range}</span> : null}
        {sums.map((sum, index) => (
          <span className="foot-sum" key={index}>
            {sum.label} <b>{sum.value}</b>
          </span>
        ))}
        {page ? (
          <div className="end">
            <ButtonGroup aria-label="Pages">
              <Button icon="back" disabled={!page.onPrevious} onClick={page.onPrevious}>
                Previous
              </Button>
              <Button iconEnd="chev" disabled={!page.onNext} onClick={page.onNext}>
                Next
              </Button>
            </ButtonGroup>
          </div>
        ) : null}
      </div>
    </div>
  );
}
