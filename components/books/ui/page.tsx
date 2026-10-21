import * as React from "react";

import { Button, Icon, Kit, type IconName } from "@/components/core";

import { Figures } from "./amt";

import "../books-design.css";
import "./books-ui.css";

/**
 * A Books page in the app's shell, drawn with the design's own layer
 * (components/books/books-design.css, from design/books/html): edge to edge
 * under the top bar, bands split by hairlines, nothing inset or centred.
 * `screen` is the design's slug without `bk-` (`bills`, `money`), so a rule
 * only that screen carries applies here. The accountant's path (Tax, Close
 * the month, Ledger) draws its worksheets `dense`, 32px rows.
 */
export function BkPage({
  screen,
  children,
  scroll = true,
}: {
  screen: string;
  children: React.ReactNode;
  /** False on a list: its tabs and tools stay put and only `BkScroll` scrolls. */
  scroll?: boolean;
}) {
  return (
    <Kit className="kit-main">
      <div className={`bkd sc-${screen}`} data-screen={screen}>
        <div className="bkm">
          <div className="bkw">{scroll ? <div className="bkw-scroll">{children}</div> : children}</div>
        </div>
      </div>
    </Kit>
  );
}

/** The part of a list that scrolls (`.bkw-scroll`): the table and its notes, under the tabs and tools. */
export function BkScroll({ children }: { children: React.ReactNode }) {
  return <div className="bkw-scroll">{children}</div>;
}

/** The finding a page opens with (`.k-find`): one 20px line, the fact in ink, what is behind it muted. */
export function BkFinding({ fact, rest }: { fact: React.ReactNode; rest?: React.ReactNode }) {
  const node = (part: React.ReactNode) => (typeof part === "string" ? <Figures text={part} /> : part);
  return (
    <div className="k-find">
      <p>
        <b>{node(fact)}</b>
        {rest ? (
          <>
            {" "}
            <span>{node(rest)}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

export type BkTone = "done" | "info" | "warn" | "bad" | "draft" | "void";

/** A state: a dot and a word (`.st.k-st-*`). */
export function St({ tone, children }: { tone: BkTone; children: React.ReactNode }) {
  return <span className={`st k-st-${tone}`}>{children}</span>;
}

/**
 * A warning or a refusal, one line, with its action at the end
 * (`.k-note.is-warn|is-bad`). The UI never explains itself, so these are the
 * only notes a Books page carries (design/books/spec/books.md, Density).
 */
export function BkNote({ tone, icon = "warn", children, action }: { tone: "warn" | "bad"; icon?: IconName; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={`k-note is-${tone}`} data-note={tone} role={tone === "bad" ? "alert" : "status"}>
      <Icon name={icon} />
      <span>{children}</span>
      {action}
    </div>
  );
}

/** A section head (`.k-sh`): its title, and a count or a total at the right. */
export function BkSectionHead({ title, sum, children }: { title: React.ReactNode; sum?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="k-sh">
      <h2>{title}</h2>
      {sum !== undefined && sum !== null ? <span className="k-sum">{sum}</span> : null}
      {children}
    </div>
  );
}

/** A section's foot line (`.k-foot`): an icon and one fact. */
export function BkFoot({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <p className="k-foot">
      <Icon name={icon} />
      <span>{children}</span>
    </p>
  );
}

/** The empty state of a band or a list: one line in place of rows, and what to do. */
export function BkEmpty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="k-empty" data-band="row">
      <span>{children}</span>
      {action}
    </div>
  );
}

/** A Books page that did not load: one line with Try again. */
export function BkError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <BkNote tone="bad" action={<Button onClick={onRetry} icon="history">Try again</Button>}>
      <b>{what} didn&rsquo;t load.</b> Check the connection.
    </BkNote>
  );
}

/** A band or a list on its way (`.k-load`): its rows' height in hairlines, nothing that jumps. */
export function BkLoading({ rows = 8 }: { rows?: number }) {
  return (
    <div className="k-load" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  );
}
