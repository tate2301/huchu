import * as React from "react";
import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const ROW = /^\s*\|.*\|\s*$/;
const ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/;
const kindOf = (line: string) => (!line.trim() ? "blank" : ROW.test(line) ? "table" : ITEM.test(line) ? "list" : /^\s{2,}\S/.test(line) ? "more" : "text");

/**
 * Vane writes a list or a table straight under the sentence that leads into
 * it, and a link line straight under a list. Markdown reads the first as one
 * paragraph and the second as part of the last item, so a blank line goes in
 * wherever a top-level line changes from text to list to table. "•" becomes
 * "-", which Markdown knows as an item.
 */
export function tidy(text: string): string {
  const out: string[] = [];
  let previous = "blank";
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.replace(/^(\s*)•\s+/, "$1- ");
    const kind = kindOf(line);
    if (kind !== "blank" && kind !== "more" && previous !== "blank" && previous !== kind && !(previous === "more" && kind === "list")) out.push("");
    out.push(line);
    if (kind !== "more") previous = kind;
  }
  return out.join("\n");
}

const NUMERIC = /^[-+−]?(?:[$€£R]|[A-Z]{3}\s)?\s?[\d,]+(\.\d+)?\s?%?$/;

type HastNode = { type: string; tagName?: string; value?: string; children?: HastNode[]; properties?: Record<string, unknown> };
const textOf = (node: HastNode): string => (node.type === "text" ? (node.value ?? "") : (node.children ?? []).map(textOf).join(""));
const cellsOf = (row: HastNode) => (row.children ?? []).filter((cell) => cell.tagName === "td" || cell.tagName === "th");
const rowsIn = (node: HastNode): HastNode[] => (node.tagName === "tr" ? [node] : (node.children ?? []).flatMap(rowsIn));
const mark = (cell: HastNode | undefined) => {
  if (cell) cell.properties = { ...cell.properties, className: ["num"] };
};

/** A table's figures to the right, header and all: a column whose every filled cell is a figure is numeric. */
function figuresRight() {
  const walk = (node: HastNode) => {
    if (node.tagName === "table") {
      const [head, ...body] = rowsIn(node);
      if (head && body.length) {
        cellsOf(head).forEach((_, at) => {
          const column = body.map((row) => cellsOf(row)[at]).filter((cell): cell is HastNode => Boolean(cell && textOf(cell).trim()));
          if (column.length && column.every((cell) => NUMERIC.test(textOf(cell).trim()))) {
            mark(cellsOf(head)[at]);
            body.forEach((row) => mark(cellsOf(row)[at]));
          }
        });
      }
      return;
    }
    node.children?.forEach(walk);
  };
  return (tree: HastNode) => walk(tree);
}

const COMPONENTS: Components = {
  // Links lead inside the app only: a path. Anything else stays its words.
  a: ({ href, children }) => (href && href.startsWith("/") && !href.startsWith("//") ? <Link href={href} className="link">{children}</Link> : <>{children}</>),
  // Vane's headings sit inside a chat bubble: they are emphasis, not page titles.
  h1: ({ children }) => <h4>{children}</h4>,
  h2: ({ children }) => <h4>{children}</h4>,
  h3: ({ children }) => <h4>{children}</h4>,
  h4: ({ children }) => <h4>{children}</h4>,
  h5: ({ children }) => <h4>{children}</h4>,
  h6: ({ children }) => <h4>{children}</h4>,
  img: () => null,
  th: ({ children, className }) => (
    <th scope="col" className={className}>
      {children}
    </th>
  ),
  td: ({ children, className }) => <td className={className}>{children}</td>,
  table: ({ children }) => (
    <div className="vm-tw">
      <table>{children}</table>
    </div>
  ),
};

/**
 * Vane's answer as rich text: paragraphs, bold and italic, headings, lists
 * (bulleted, numbered, tasks), quotes, code, and tables with their figures
 * set to the right. No HTML is read, no image is drawn, and links only ever
 * lead inside the app (a path), so nothing it writes sends anyone elsewhere.
 */
export function VaneText({ text }: { text: string }) {
  return (
    <div className="vm-md">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[figuresRight]} components={COMPONENTS} skipHtml>
        {tidy(text)}
      </Markdown>
    </div>
  );
}
