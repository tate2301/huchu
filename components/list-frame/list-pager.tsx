"use client";

import { ChevronLeftIcon, ChevronRight, ChevronUpIcon } from "@/lib/icons";
import { LIST_PAGE_SIZES } from "@/lib/reports/types";
import { formatCount } from "@/lib/workspace/format";

import { pageButtons } from "./model";

/**
 * The pager (00-foundations 5.4.9, Paging board): three slots so the page
 * buttons never move — where you are and rows per page; the pages, the
 * current one in solid ink (G1); Back to top once the table has scrolled more
 * than its own height. It scrolls the table, not the window.
 */
export function ListPager({
  page,
  pages,
  size,
  total,
  shown,
  hints,
  scrolled,
  onPage,
  onSize,
  onTop,
}: {
  page: number;
  pages: number;
  size: number;
  total: number | null;
  /** Rows on this page. */
  shown: number;
  /** ≤720px: "Rows per page" and "Back to top" lose their words. */
  hints: boolean;
  scrolled: boolean;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
  onTop: () => void;
}) {
  const from = total ? (page - 1) * size + 1 : 0;
  const to = total ? (page - 1) * size + shown : 0;
  return (
    <nav aria-label="Pages" className="cx-lf-pager" data-toast-floor="">
      <div className="cx-lf-pager__side">
        <span style={{ whiteSpace: "nowrap" }}>
          {total === null ? (
            <>
              <span className="cx-lf-pager__fig">—</span> of <span className="cx-lf-pager__fig">—</span>
            </>
          ) : total === 0 ? (
            <>
              <span className="cx-lf-pager__fig">0</span> of <span className="cx-lf-pager__fig">0</span>
            </>
          ) : (
            <>
              <span className="cx-lf-pager__fig">
                {formatCount(from)}–{formatCount(to)}
              </span>{" "}
              of <span className="cx-lf-pager__fig">{formatCount(total)}</span>
            </>
          )}
        </span>
        <label>
          {hints ? <span className="cx-lf-sr">Rows per page</span> : "Rows per page"}
          <select value={size} onChange={(event) => onSize(Number(event.target.value))}>
            {LIST_PAGE_SIZES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      {total ? (
        <div className="cx-lf-pages" role="group" aria-label="Pages">
          <button
            type="button"
            className="cx-lf-page cx-lf-page--arrow"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeftIcon aria-hidden />
          </button>
          {pageButtons(page, pages).map((entry, index) =>
            entry === "gap" ? (
              <span key={`gap-${index}`} className="cx-lf-page cx-lf-page--gap" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                className="cx-lf-page"
                aria-label={`Page ${entry}`}
                aria-current={entry === page ? "page" : undefined}
                onClick={() => entry !== page && onPage(entry)}
              >
                {entry}
              </button>
            ),
          )}
          <button
            type="button"
            className="cx-lf-page cx-lf-page--arrow"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight aria-hidden />
          </button>
        </div>
      ) : null}
      <div className="cx-lf-pager__side cx-lf-pager__side--end">
        {scrolled ? (
          <button type="button" className="cx-lf-btn" aria-label="Back to top" onClick={onTop}>
            {hints ? null : "Back to top"}
            <ChevronUpIcon aria-hidden />
          </button>
        ) : null}
      </div>
    </nav>
  );
}
