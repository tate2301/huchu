import * as React from "react";

import { cn } from "@/lib/utils";

import { VaneMark } from "@/components/core/vane-mark";

import { GmailMark, WhatsAppMark } from "../brand-marks";
import { Face, type Person } from "../face";
import { Glyph, type GlyphName } from "../glyph";

/**
 * The timeline row (K3): a mark, one line (who, did what, to what, from where), a time, then at most one body.
 * Three densities: compact is the line alone, standard adds the body, expanded gives it room.
 */
export type Density = "compact" | "standard" | "expanded";

/** What the row says happened to it. A person's words are never rolled up; these only dress one row. */
export type RowState = "new" | "sending" | "failed" | "removed" | "private" | "outside" | "vane" | "held";

export type MarkTone = "ok" | "info" | "warn" | "bad" | "ink" | "line";

const TONE_CLASS: Record<MarkTone, string> = {
  ok: "ev__g--ok",
  info: "ev__g--info",
  warn: "ev__g--warn",
  bad: "ev__g--bad",
  ink: "ev__g--ink",
  line: "ev__g--line",
};

/** A glyph in a circle, tinted by what happened. A colour here means a problem or a result, never decoration. */
export function MarkIcon({ name, tone, small }: { name: GlyphName; tone?: MarkTone; small?: boolean }) {
  return (
    <span className={cn("ev__g", tone && TONE_CLASS[tone])}>
      <Glyph name={name} size={small ? "sm" : undefined} />
    </span>
  );
}

/** A person's face as the mark. */
export function MarkFace({ person }: { person: Person }) {
  return <Face person={person} className="ev__g" label={person.name} />;
}

/** An outside product's mark in a ring: WhatsApp, Gmail. */
export function MarkBrand({ brand }: { brand: "whatsapp" | "gmail" }) {
  return (
    <span className="ev__g ev__g--line">{brand === "whatsapp" ? <WhatsAppMark /> : <GmailMark />}</span>
  );
}

/** A workspace by its own tile: the product's colour behind its mark. */
export function MarkWorkspace({ children }: { children: React.ReactNode }) {
  return <span className="ev__g ev__g--ws">{children}</span>;
}

export function MarkVane() {
  return (
    <span className="ev__g" style={{ background: "none" }}>
      <VaneMark size={24} />
    </span>
  );
}

export type TimelineRowProps = {
  mark: React.ReactNode;
  /** The line: `<b>` for who, plain words for what, `<Src>` for where from. */
  children: React.ReactNode;
  time?: React.ReactNode;
  density?: Density;
  state?: RowState;
  /** Under the line, running to the right edge. Not shown in compact. */
  body?: React.ReactNode;
  className?: string;
};

export function TimelineRow({ mark, children, time, density = "standard", state, body, className }: TimelineRowProps) {
  return (
    <div
      className={cn(
        "ev",
        density === "compact" && "ev--compact",
        density === "expanded" && "ev--x",
        state && `ev--${state}`,
        className,
      )}
    >
      {mark}
      <div className="ev__line">{children}</div>
      <span className="ev__time">{time}</span>
      {body && density !== "compact" ? <div className="tl-body">{body}</div> : null}
    </div>
  );
}

/** Where it came from: "by WhatsApp", "from his phone", "client portal". */
export function Src({ children }: { children: React.ReactNode }) {
  return <span className="ev__src">· {children}</span>;
}

/** A day's heading and how many events sit under it. */
export function Day({ label, count, first }: { label: string; count?: number; first?: boolean }) {
  return (
    <div className="day" style={first ? { paddingTop: "var(--tm-s2)" } : undefined}>
      {label}
      {count != null ? <span className="muted">· {count}</span> : null}
    </div>
  );
}

/** A reference to another record. */
export function Ref({ children, href = "#" }: { children: React.ReactNode; href?: string }) {
  return (
    <a className="u" href={href}>
      {children}
    </a>
  );
}
