import * as React from "react";
import Link from "next/link";

const LINK = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;

/** A line of Vane's words, with its [words](/path) links as links inside the app. Anything else stays text. */
function Line({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <Link key={match.index} href={match[2]} className="link">
        {match[1]}
      </Link>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

const ITEM = /^\s*[-•]\s+/;
const ROW = /^\s*\|.*\|\s*$/;
const RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

type Run = { kind: "text" | "list" | "table"; lines: string[] };

/** A table's cells: "| a | b |" → ["a", "b"]. */
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
const numeric = (value: string) => /^[-+]?[$€£]?\s?[\d,]+(\.\d+)?%?$/.test(value);

/** The text in runs: "- " lines make a list, "| a | b |" lines a table, the rest paragraphs; a blank line always starts a new run. */
function runs(text: string): Run[] {
  const out: Run[] = [];
  for (const block of text.trim().split(/\n{2,}/)) {
    const blockRuns: Run[] = [];
    for (const line of block.split("\n")) {
      const last: Run | undefined = blockRuns[blockRuns.length - 1];
      const kind: Run["kind"] = ROW.test(line) || (last?.kind === "table" && RULE.test(line)) ? "table" : ITEM.test(line) ? "list" : "text";
      const run: Run = last && last.kind === kind ? last : { kind, lines: [] };
      if (run !== last) blockRuns.push(run);
      run.lines.push(kind === "list" ? line.replace(ITEM, "") : line);
    }
    out.push(...blockRuns);
  }
  return out;
}

function Table({ lines }: { lines: string[] }) {
  const rows = lines.filter((line) => !RULE.test(line)).map(cells);
  const [head, ...body] = rows;
  if (!head) return null;
  const numericColumn = head.map((_, at) => body.length > 0 && body.every((row) => !row[at] || numeric(row[at]!)));
  return (
    <table>
      <thead>
        <tr>
          {head.map((cell, at) => (
            <th key={at} scope="col" className={numericColumn[at] ? "num" : undefined}>
              <Line text={cell} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, index) => (
          <tr key={index}>
            {head.map((_, at) => (
              <td key={at} className={numericColumn[at] ? "num" : undefined}>
                <Line text={row[at] ?? ""} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Vane's answer as it wrote it: paragraphs, "- " lines as a list (even
 * straight after a sentence), and "| a | b |" lines as a table, numbers
 * set to the right. Links only ever lead inside the app (a path), so
 * nothing it writes sends anyone elsewhere.
 */
export function VaneText({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
      {runs(text).map((run, index) =>
        run.kind === "table" ? (
          <Table key={index} lines={run.lines} />
        ) : run.kind === "list" ? (
          <ul key={index} style={{ margin: 0, paddingLeft: "var(--space-24)", listStyle: "disc", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {run.lines.map((line, at) => (
              <li key={at}>
                <Line text={line} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index} style={{ margin: 0 }}>
            {run.lines.map((line, at) => (
              <React.Fragment key={at}>
                {at > 0 ? <br /> : null}
                <Line text={line} />
              </React.Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
