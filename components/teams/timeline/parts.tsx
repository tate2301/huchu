import * as React from "react";

import { Button } from "@/components/workspace/button";
import { Segmented } from "@/components/workspace/segmented";
import { cn } from "@/lib/utils";

import { Glyph, type GlyphName } from "../glyph";

/** The top of a timeline: comment, or log contact with the client, with the facts of the contact beside the words. */
export type PostKind = "comment" | "contact";

export type PostPick = { icon: GlyphName; label: string; value: string };

export function PostBox({
  kind,
  onKindChange,
  children,
  picks,
  action,
}: {
  kind: PostKind;
  onKindChange?: (k: PostKind) => void;
  /** The words so far. */
  children?: React.ReactNode;
  /** Only when logging contact: how, with whom, when, and when to follow up. */
  picks?: PostPick[];
  action: { label: string; icon: GlyphName; kbd?: string; onClick?: () => void };
}) {
  return (
    <div className="tl-post">
      <div className="tl-post__top">
        <Segmented
          aria-label="Kind"
          value={kind}
          onValueChange={onKindChange}
          items={[
            {
              value: "comment",
              label: (
                <>
                  <Glyph name="chat" size="sm" />
                  Comment
                </>
              ),
            },
            {
              value: "contact",
              label: (
                <>
                  <Glyph name="handshake" size="sm" />
                  Log contact with the client
                </>
              ),
            },
          ]}
        />
      </div>
      <div className={cn("tl-post__text", children ? "has" : null)}>{children}</div>
      {kind === "contact" && picks?.length ? (
        <div className="tl-post__meta">
          {picks.map((p) => (
            <span key={p.label} className="tl-pick">
              <Glyph name={p.icon} />
              {p.label} <b>{p.value}</b>
              <Glyph name="caret-down" />
            </span>
          ))}
        </div>
      ) : null}
      <div className="tl-post__foot">
        <Button variant="ghost" iconOnly aria-label="Add a document" icon={<Glyph name="clip" />} />
        <Button variant="ghost" iconOnly aria-label="Mention someone" icon={<Glyph name="at" />} />
        <span className="spacer" />
        <Button variant="primary" icon={<Glyph name={action.icon} />} onClick={action.onClick}>
          {action.label}
          {action.kbd ? <span className="kbd">{action.kbd}</span> : null}
        </Button>
      </div>
    </div>
  );
}

/** Filter the timeline by kind: each kind with its count, one pressed. */
export function KindFilter({
  kinds,
  value,
  onChange,
}: {
  kinds: Array<{ id: string; label: string; count: number }>;
  value: string;
  onChange?: (id: string) => void;
}) {
  return (
    <div className="tl-filter">
      {kinds.map((k) => (
        <button key={k.id} type="button" className="chip" aria-pressed={k.id === value} onClick={() => onChange?.(k.id)}>
          {k.label}
          <span className="chip__n">{k.count}</span>
        </button>
      ))}
    </div>
  );
}

/** Rows on their way: a face, two lines, a time. */
export function RowSkeleton({ widths }: { widths: Array<[number, number]> }) {
  return (
    <>
      {widths.map(([a, b], i) => (
        <div key={i} className="tl-sk">
          <span className="sk sk--g" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
            <span className="sk" style={{ width: `${a}%` }} />
            <span className="sk" style={{ width: `${b}%` }} />
          </div>
          <span className="sk" style={{ marginTop: 6 }} />
        </div>
      ))}
    </>
  );
}

/** Nothing here yet, or nothing under this filter: a fact, and the way on. */
export function TimelineEmpty({
  icon,
  title,
  actions,
}: {
  icon: GlyphName;
  title: string;
  actions: Array<{ label: string; icon?: GlyphName; onClick?: () => void }>;
}) {
  return (
    <div className="tl-empty">
      <span className="ev__g" style={{ width: 40, height: 40 }}>
        <Glyph name={icon} />
      </span>
      <div className="tl-empty__t">{title}</div>
      <div className="ev__acts" style={{ justifyContent: "center" }}>
        {actions.map((a) => (
          <Button key={a.label} icon={a.icon ? <Glyph name={a.icon} /> : undefined} onClick={a.onClick}>
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** "edited 10:15" beside a comment's line. */
export function EditedTag({ children }: { children: React.ReactNode }) {
  return (
    <a className="tl-edited" href="#">
      {children}
    </a>
  );
}

/** The Pabasa mark: the module's own tile in a heading or a row. */
export function PabasaMark({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M5 3h4v8l7-8h5l-8 8.6L21 21h-5l-5.5-6.6L9 16.3V21H5z" />
    </svg>
  );
}

/** The Tender mark. */
export function TenderMark({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M3 20V5l5 6 4-6 4 6 5-6v15h-4v-7l-5 6-5-6v7z" />
    </svg>
  );
}

/** What a timeline is of: the module's mark, the record, and a fact about the span. */
export function TimelineHead({
  title,
  sub,
  module = "pabasa",
  icon,
  style,
}: {
  title: string;
  sub?: string;
  /** Pabasa has its own green, Tender its own orange; every other module is ink with its glyph. */
  module?: "pabasa" | "tender" | "other";
  icon?: GlyphName;
  style?: React.CSSProperties;
}) {
  const fill = module === "pabasa" ? "var(--ok)" : module === "tender" ? "var(--action-fill)" : "var(--ink-2)";
  return (
    <div className="tl-head" style={style}>
      <span className="tl-head__mark" style={{ background: fill, color: "var(--on-sel)" }}>
        {icon ? <Glyph name={icon} size="sm" /> : module === "tender" ? <TenderMark /> : <PabasaMark />}
      </span>
      <span className="tl-head__t">{title}</span>
      {sub ? <span className="tl-head__s">{sub}</span> : null}
    </div>
  );
}
