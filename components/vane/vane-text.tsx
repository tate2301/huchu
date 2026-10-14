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

/** The text in runs: consecutive "- " lines make one list, the rest paragraphs; a blank line always starts a new run. */
function runs(text: string): Array<{ list: boolean; lines: string[] }> {
  const out: Array<{ list: boolean; lines: string[] }> = [];
  for (const block of text.trim().split(/\n{2,}/)) {
    let current: { list: boolean; lines: string[] } | null = null;
    for (const line of block.split("\n")) {
      const list = ITEM.test(line);
      if (!current || current.list !== list) {
        current = { list, lines: [] };
        out.push(current);
      }
      current.lines.push(list ? line.replace(ITEM, "") : line);
    }
  }
  return out;
}

/**
 * Vane's answer as it wrote it: paragraphs, and "- " lines as a list, even
 * straight after a sentence. Links only ever lead inside the app (a path), so
 * nothing it writes sends anyone elsewhere.
 */
export function VaneText({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
      {runs(text).map((run, index) =>
        run.list ? (
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
