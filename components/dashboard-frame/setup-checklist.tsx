import "./setup-checklist.css";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/workspace/button";
import { Check } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * SetupChecklist (00-foundations 5.12.1; the left card of the Guided board):
 * "Finish setting up" at the top of the Overview, owner only, until every
 * item is done.
 *
 * The card draws what the checklist endpoint says (`GET
 * /api/v2/retail/setup/checklist`, owned by the setup area, 99-coverage
 * C-15): each item's label, why and call to action come from the server. A
 * done item is struck through with its why saying what was done, and carries
 * no button. The status circle is a toggle only when the page passes
 * `onTick`, and then only for items not done by their data.
 */

export type SetupChecklistItem = {
  key: string;
  label: string;
  why: string;
  done: boolean;
  /** Ticked by hand rather than by data: the circle can untick it. */
  byHand?: boolean;
  href: string;
  cta: string;
};

export function SetupChecklist({
  done,
  total,
  items,
  onHide,
  onTick,
  className,
}: {
  done: number;
  total: number;
  items: SetupChecklistItem[];
  onHide: () => void;
  onTick?: (item: SetupChecklistItem) => void;
  className?: string;
}) {
  const titleId = React.useId();
  const share = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <section className={cn("cx-sc", className)} aria-labelledby={titleId}>
      <div className="cx-sc__head">
        <div className="cx-sc__heading">
          <h2 id={titleId} className="cx-sc__title">
            Finish setting up
          </h2>
          <span className="cx-sc__progress">
            <span
              className="cx-sc__track"
              role="progressbar"
              aria-label="Setup done"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              <span className="cx-sc__fill" style={{ width: `${share}%` }} />
            </span>
            <span className="cx-sc__count">
              <span className="cx-sc__figure">{done}</span> of <span className="cx-sc__figure">{total}</span>
            </span>
          </span>
        </div>
        <Button variant="ghost" className="cx-sc__hide" onClick={onHide}>
          Hide until tomorrow
        </Button>
      </div>
      <ul className="cx-sc__items">
        {items.map((item) => (
          <li key={item.key} className={cn("cx-sc__item", item.done && "cx-sc__item--done")}>
            <StatusCircle item={item} onTick={onTick} />
            <span className="cx-sc__text">
              <span className="cx-sc__label">{item.label}</span>
              <span className="cx-sc__why">{item.why}</span>
            </span>
            {item.done ? null : (
              <Link className="cx-sc__cta" href={item.href}>
                {item.cta}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <p className="cx-sc__foot">
        This card sits at the top of the overview until everything is ticked, then it goes for good. Nothing on it
        stops you selling.
      </p>
    </section>
  );
}

function StatusCircle({ item, onTick }: { item: SetupChecklistItem; onTick?: (item: SetupChecklistItem) => void }) {
  const mark = item.done ? <Check aria-hidden /> : null;
  const className = cn("cx-sc__circle", item.done && "cx-sc__circle--done");
  const byData = item.done && !item.byHand;
  if (!onTick || byData) {
    return (
      <span className={className} role="img" aria-label={item.done ? "Done" : "To do"}>
        {mark}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-pressed={item.done}
      aria-label={item.label}
      onClick={() => onTick(item)}
    >
      {mark}
    </button>
  );
}

/** While the checklist loads: the card's head and seven grey rows. */
export function SetupChecklistSkeleton({ rows = 7, className }: { rows?: number; className?: string }) {
  return (
    <section className={cn("cx-sc", className)} aria-busy="true" aria-label="Finish setting up">
      <div className="cx-sc__head">
        <div className="cx-sc__heading">
          <span className="cx-sc__skel" style={{ width: 140, height: 14 }} />
          <span className="cx-sc__skel" style={{ width: "70%", height: 6 }} />
        </div>
      </div>
      <ul className="cx-sc__items" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="cx-sc__item">
            <span className="cx-sc__circle" />
            <span className="cx-sc__text">
              <span className="cx-sc__skel" style={{ width: `${40 + ((index * 13) % 30)}%`, height: 10 }} />
              <span className="cx-sc__skel" style={{ width: `${30 + ((index * 17) % 30)}%`, height: 8 }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
