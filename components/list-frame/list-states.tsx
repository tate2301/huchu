import "./list-frame.css";

import Link from "next/link";

import { Button } from "@/components/workspace/button";
import type { ListColumn } from "@/lib/reports/types";

/**
 * Loading, no match, error and no permission (00-foundations 5.4.11). The
 * empty state is the workspace's `EmptyGuide`.
 */

/** First load: 12 rows of `--tray` bars, 40–80% of each cell. */
export function SkeletonRows({ columns, template }: { columns: ListColumn[]; template: string }) {
  return (
    <>
      {Array.from({ length: 12 }, (_, row) => (
        <div key={row} role="row" aria-hidden="true" className="cx-lf-g cx-lf-row" style={{ gridTemplateColumns: template }}>
          <div className="cx-lf-tick" />
          {columns.map((column, index) => (
            <div key={column.key} className="cx-lf-c" style={{ display: "flex", justifyContent: column.align === "end" ? "flex-end" : "flex-start" }}>
              <span className="cx-lf-skel" style={{ width: `${40 + ((row * 7 + index * 13) % 41)}%` }} />
            </div>
          ))}
          <div />
        </div>
      ))}
    </>
  );
}

/**
 * Nothing matches: the head stays; a 160px block under it. A tab that holds
 * nothing at all says so in its own `line`, with nothing to clear.
 */
export function NoMatch({ noun, line, onClear }: { noun: string; line?: string | null; onClear: () => void }) {
  if (line) {
    return (
      <div className="cx-lf-block" role="status">
        <span className="cx-lf-block__line">{line}</span>
      </div>
    );
  }
  return (
    <div className="cx-lf-block" role="status">
      <span className="cx-lf-block__line">No {noun} match these filters.</span>
      <Button onClick={onClear}>Clear the filters</Button>
    </div>
  );
}

export function LoadError({ noun, message, onRetry }: { noun: string; message: string; onRetry: () => void }) {
  return (
    <div className="cx-lf-block" role="alert">
      <span className="cx-lf-block__line">The {noun} could not be loaded.</span>
      {message ? <span className="cx-lf-block__detail">{message}</span> : null}
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}

/** No permission: "Your role cannot view <noun>.", and the way back for a page reached by a link. */
export function Refusal({
  noun,
  sentence,
  back,
}: {
  noun: string;
  /** The matrix's own refusal for another verb (`retailPermissionDenial`), in place of "Your role cannot view <noun>". */
  sentence?: string | null;
  back?: { href: string; label: string } | null;
}) {
  return (
    <div className="cx-lf-refusal" role="alert">
      <span className="cx-lf-block__line">{sentence ?? `Your role cannot view ${noun}`}.</span>
      {back ? (
        <Button asChild>
          <Link href={back.href}>Back to {back.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}
