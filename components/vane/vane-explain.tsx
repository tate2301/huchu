"use client";

import * as React from "react";

import { Button, Icon, VaneMark } from "@/components/core";
import { columnWords, type VaneExplainView } from "@/lib/vane/explain";

import { VaneText } from "./vane-text";

/** Rows shown under an answer; the note under them says how many there are in all. */
const SHOWN_ROWS = 8;

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "number") return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  // Postgres sends numerics as text: "1432100.00" reads as 1,432,100.00.
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    const places = value.split(".")[1]?.length ?? 0;
    return Number(value).toLocaleString("en-GB", {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    });
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const looksNumeric = (value: unknown) => typeof value === "number" || (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value));

/** "34 of the 35 deals …" as its first sentence, and the rest. */
function sentences(text: string): [string, string] {
  const at = text.search(/[.!?]\s/);
  return at < 0 ? [text, ""] : [text.slice(0, at + 1), text.slice(at + 2)];
}

/**
 * Vane's answer to a figure someone pressed Explain on (PageVaneReport), in
 * the Vane panel beside the report, as the panel's conversation reads: what
 * they asked in their bubble, then Vane's answer beside its mark, with the
 * rows it rests on and, under What I read, the SQL that drew them. While it
 * works, waits or could not work it out, Vane says so in the same place. A
 * card it raises is on For you, as every card is.
 *
 * Pure: the panel feeds it the job.
 */
export function VaneExplainAnswer({
  job,
  failed,
  onRetry,
}: {
  job: VaneExplainView | undefined;
  /** The answer did not load. */
  failed: boolean;
  onRetry: () => void;
}) {
  const [sqlShown, setSqlShown] = React.useState(false);

  if (!job) {
    return failed ? (
      <p role="alert" className="vm-err">
        <Icon name="warn" />
        <span>
          The answer did not load. Check the connection, then{" "}
          <Button variant="quiet" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </span>
      </p>
    ) : (
      <div className="skeleton" style={{ height: 96 }} aria-busy="true" />
    );
  }

  const asked = job.asked;
  const shown = asked?.rows.slice(0, SHOWN_ROWS) ?? [];
  const [lede, rest] = sentences(job.result ?? "");
  const read = [job.read.join(", "), asked ? `${asked.rowCount.toLocaleString("en-GB")} ${asked.rowCount === 1 ? "row" : "rows"}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="vx" aria-label="Vane's answer">
      <div className="vs">You asked</div>
      <div className="vm vm-me">
        <div className="vm-b">{job.question}</div>
      </div>
      <div className="vs">Answer</div>

      {job.status === "done" ? (
        <>
          <div className="vm vm-it">
            <VaneMark size={20} />
            <div className="vm-c">
              <div className="vm-b">
                <span className="vx-lede">{lede || "I looked, and found nothing to say about it."}</span>
                {rest ? <VaneText text={rest} /> : null}
              </div>
            </div>
          </div>
          {asked && shown.length > 0 ? (
            <div className="wt vx-rows">
              <table className="table">
                <thead>
                  <tr>
                    {asked.columns.map((column) => (
                      <th key={column} className={looksNumeric(shown[0]?.[column]) ? "num" : undefined}>
                        {columnWords(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row, index) => (
                    <tr key={index}>
                      {asked.columns.map((column, at) => (
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
          {asked && asked.rowCount > shown.length ? (
            <span className="muted vx-note">
              The first {shown.length} of {asked.rowCount.toLocaleString("en-GB")} rows.
            </span>
          ) : null}
          {asked ? (
            <button
              type="button"
              className="link vx-read"
              aria-expanded={sqlShown}
              aria-controls="vx-sql"
              onClick={() => setSqlShown((on) => !on)}
            >
              <Icon name="eye" />
              <span>What I read: {read}</span>
            </button>
          ) : null}
          {asked && sqlShown ? (
            <pre id="vx-sql" className="vx-sql">
              {asked.sql}
            </pre>
          ) : null}
        </>
      ) : job.status === "failed" ? (
        <div className="vm vm-it" role="status">
          <VaneMark size={20} />
          <div className="vm-c">
            <div className="vm-b">
              <p>I could not work this out. {job.error?.trim() || "It stopped without saying why."}</p>
              <p className="muted">
                {job.tried.length
                  ? `I tried ${job.tried.map((tool) => `${tool.name.replace(/_/g, " ")} (${tool.ok ? "answered" : "refused or failed"})`).join(", ")}.`
                  : "I stopped before I read anything, so there are no rows to show."}
                {job.finishedAt ? ` Stopped at ${clock(job.finishedAt)}.` : ""}
              </p>
            </div>
          </div>
        </div>
      ) : job.status === "waiting" ? (
        <div className="vm vm-it" role="status">
          <VaneMark size={20} />
          <div className="vm-c">
            <div className="vm-b">
              I cannot work just now: I could not reach the service. Your question waits
              {job.nextTry ? `, and I try again at ${clock(job.nextTry)}` : ", and I try again on my own"}.
            </div>
          </div>
        </div>
      ) : (
        <div className="vm vm-it vm-w" role="status" aria-live="polite">
          <VaneMark size={20} />
          <span className="vm-b">{job.status === "running" ? "Reading the rows…" : "Waiting my turn…"}</span>
        </div>
      )}
    </section>
  );
}
