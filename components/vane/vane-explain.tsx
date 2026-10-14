"use client";

import * as React from "react";

import { Button } from "@/components/core";
import { columnWords } from "@/lib/vane/explain";
import type { VaneJobView } from "@/lib/vane/pages";
import type { VaneCard } from "@/lib/vane/panel";

import { clock, when } from "./format";
import { PanelCard } from "./vane-panel-view";

/** Rows shown under an answer; the SQL beside them says how to read the rest. */
const SHOWN_ROWS = 8;

/** "34 of the 35 deals …. None of them …" as its first sentence and the rest, as the board sets them. */
function sentences(text: string): [string, string] {
  const at = text.search(/[.!?]\s/);
  return at < 0 ? [text, ""] : [text.slice(0, at + 1), text.slice(at + 2)];
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "number") return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  // Postgres sends numerics as text: "1432100.00" reads as 1,432,100.00.
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    const places = value.split(".")[1]?.length ?? 0;
    return Number(value).toLocaleString("en-GB", { minimumFractionDigits: places, maximumFractionDigits: places });
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const looksNumeric = (value: unknown) => typeof value === "number" || (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value));

/**
 * Vane's answer to a figure someone asked about (PageVaneReport), in the Vane
 * panel beside the report: what they asked, the answer, the rows it rests on
 * and the SQL that drew them, then any card it raised. While it works, or when
 * it could not work it out or reach the service, it says so.
 *
 * Pure: the panel feeds it the job.
 */
export function VaneExplainAnswer({
  job,
  failed,
  onRetry,
  onAct,
  onNotNow,
}: {
  job: VaneJobView | undefined;
  /** The job did not load. */
  failed: boolean;
  onRetry: () => void;
  onAct: (card: VaneCard, target?: string) => void;
  onNotNow: (card: VaneCard) => void;
}) {
  const [sqlShown, setSqlShown] = React.useState(false);

  if (failed && !job) {
    return (
      <div className="vn-st" role="status">
        <span className="vn-st-t">The answer did not load</span>
        <span className="vn-st-d">Check the connection, then try again.</span>
        <div>
          <Button icon="history" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (!job) {
    return (
      <div aria-busy="true">
        <div className="skeleton" style={{ height: 20, width: 120 }} />
        <div className="skeleton" style={{ height: 96, marginTop: 12 }} />
      </div>
    );
  }

  const question = job.question;
  const shownRows = question?.rows.slice(0, SHOWN_ROWS) ?? [];
  const [lede, rest] = sentences(job.result ?? "");
  const read = job.reads.map((entry) => `${entry.label} · ${entry.rows.toLocaleString("en-GB")} ${entry.rows === 1 ? "row" : "rows"}`).join("; ");

  return (
    <>
      <div className="vs">You asked</div>
      <div className="vx-q">{job.label}</div>
      <div className="vs">Answer</div>

      {job.status === "done" ? (
        <div className="vx-a">
          {lede ? <span className="vx-lede">{lede}</span> : <span className="vx-lede">I looked, and found nothing to say about it.</span>}
          {rest ? <span className="vx-rest">{rest}</span> : null}
          {question && shownRows.length > 0 ? (
            <div className="wt vx-rows">
              <table className="table">
                <thead>
                  <tr>
                    {question.columns.map((column) => (
                      <th key={column} className={looksNumeric(shownRows[0]?.[column]) ? "num" : undefined}>
                        {columnWords(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((row, index) => (
                    <tr key={index}>
                      {question.columns.map((column, at) => (
                        <td key={column} className={looksNumeric(row[column]) ? "num" : at === 0 ? "fill" : undefined}>
                          {cellText(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {question && question.rowCount > shownRows.length ? (
            <span className="vn-note">
              The first {shownRows.length} of {question.rowCount.toLocaleString("en-GB")} rows.
            </span>
          ) : null}
          {question ? (
            <a
              href="#vx-sql"
              className="vx-read"
              aria-expanded={sqlShown}
              onClick={(event) => {
                event.preventDefault();
                setSqlShown((shown) => !shown);
              }}
            >
              What I read: {read || "the rows above"}
            </a>
          ) : null}
          {question && sqlShown ? (
            <pre id="vx-sql" className="vn-sql">
              {question.sql}
            </pre>
          ) : null}
        </div>
      ) : job.status === "failed" ? (
        <div className="vn-st" role="status">
          <span className="vn-st-t">I could not work this out</span>
          <span className="vn-st-d">{job.error?.trim() || "It stopped without saying why."}</span>
          {job.tried.length ? (
            <dl className="attrs">
              {job.tried.map((tool, index) => (
                <React.Fragment key={`${tool.name}-${index}`}>
                  <dt>{tool.name.replace(/_/g, " ")}</dt>
                  <dd>{tool.ok ? "Answered" : "Refused or failed"}</dd>
                </React.Fragment>
              ))}
            </dl>
          ) : (
            <span className="vn-st-d">It stopped before it read anything, so there are no rows to show.</span>
          )}
          {job.finishedAt ? <span className="vn-st-n">Stopped {when(job.finishedAt)}</span> : null}
        </div>
      ) : job.status === "waiting" ? (
        <div className="vn-st" role="status">
          <span className="vn-st-t">Vane cannot work just now</span>
          <span className="vn-st-d">It could not reach the service. Your question waits and is tried again on its own.</span>
          {job.nextTry ? <span className="vn-st-n">Next try {clock(job.nextTry)}</span> : null}
        </div>
      ) : (
        <div className="vn-now" role="status">
          <span className="live-d" aria-hidden="true" />
          <span>{job.status === "running" ? "Reading the rows" : "Waiting its turn"}</span>
          <span className="muted">It answers here when it has.</span>
        </div>
      )}

      {job.cards.map((card, index) => (
        <PanelCard key={card.id} card={card} lead={index === 0} onAct={onAct} onNotNow={onNotNow} />
      ))}
    </>
  );
}
