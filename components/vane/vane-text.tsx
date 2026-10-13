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

/**
 * Vane's answer as it wrote it: paragraphs, and "- " lines as a list. Links
 * only ever lead inside the app (a path), so nothing it writes sends anyone
 * elsewhere.
 */
export function VaneText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-•]\s+/.test(line))) {
          return (
            <ul key={index} style={{ margin: 0, paddingLeft: "var(--space-16)" }}>
              {lines.map((line, at) => (
                <li key={at}>
                  <Line text={line.replace(/^\s*[-•]\s+/, "")} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} style={{ margin: 0 }}>
            {lines.map((line, at) => (
              <React.Fragment key={at}>
                {at > 0 ? <br /> : null}
                <Line text={line} />
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}
