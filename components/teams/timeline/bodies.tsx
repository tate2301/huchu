import * as React from "react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/workspace/button";

import { Glyph, type GlyphName } from "../glyph";
import { WhatsAppMark } from "../brand-marks";
import { Face, Faces, type Person } from "../face";

/**
 * What an event carries (K3): the bodies that sit under a row's line. A row takes at most one.
 * All presentational: they take props and know nothing of where the data came from.
 */

export function Bubble({
  children,
  size,
  className,
}: {
  children: React.ReactNode;
  size?: "sm";
  className?: string;
}) {
  return (
    <div className={cn("bubble", className)} style={size === "sm" ? { fontSize: "var(--tm-t-sm)" } : undefined}>
      {children}
    </div>
  );
}

export function Mention({ children }: { children: React.ReactNode }) {
  return <span className="tm-mention">{children}</span>;
}

/** Documents, photos and places an event points at, as chips. */
export function Attachments({ children }: { children: React.ReactNode }) {
  return <div className="attach">{children}</div>;
}

export function FileChip({ icon, children, meta }: { icon: GlyphName; children: React.ReactNode; meta?: string }) {
  return (
    <span className="file">
      <Glyph name={icon} style={{ color: "var(--ink-3)" }} />
      {children}
      {meta ? <span className="muted">{meta}</span> : null}
    </span>
  );
}

/** A record the event made or changed: its title, what it is about, its figure and state. */
export function RecordCard({
  icon = "receipt",
  title,
  sub,
  amount,
  state,
}: {
  icon?: GlyphName;
  title: React.ReactNode;
  sub?: React.ReactNode;
  amount?: React.ReactNode;
  state?: React.ReactNode;
}) {
  return (
    <div className="tl-card">
      <span className="tl-card__mark">
        <Glyph name={icon} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="tl-card__t">{title}</div>
        {sub ? <div className="tl-card__s">{sub}</div> : null}
      </div>
      {amount || state ? (
        <div className="tl-card__end">
          {amount ? <span className="tl-card__amt">{amount}</span> : null}
          {state}
        </div>
      ) : null}
    </div>
  );
}

/** The state of a record as a word with its dot. Colour only where someone has to act. */
export type StateTone = "calm" | "info" | "ok" | "warn" | "bad" | "wait";

export function State({ tone = "calm", children }: { tone?: StateTone; children: React.ReactNode }) {
  return <span className={cn("state", `state--${tone}`)}>{children}</span>;
}

/** A payment against what is owed: the amount, how it was paid, and a bar for how much of the total. */
export function MoneyCard({
  amount,
  how,
  percent,
  left,
  right,
}: {
  amount: React.ReactNode;
  how?: React.ReactNode;
  /** 0 to 100. Omit for no bar. */
  percent?: number;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="tl-money">
      <div className="tl-money__row">
        <span className="tl-money__big">{amount}</span>
        {how ? <span>{how}</span> : null}
      </div>
      {percent != null ? (
        <div className="tl-prog">
          <i style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      {left || right ? (
        <div className="tl-money__row" style={{ fontSize: "var(--tm-t-cap)" }}>
          <span>{left}</span>
          <span className="spacer" />
          <span>{right}</span>
        </div>
      ) : null}
    </div>
  );
}

export type PhotoTone = "a" | "b" | "c" | "d" | "plan";

/** Photos as tiles; the last can say how many more there are. */
export function Photos({ tones, more }: { tones: PhotoTone[]; more?: number }) {
  return (
    <div className="tl-media">
      {tones.map((tone, i) => (
        <span key={`${tone}-${i}`} className={cn("tl-ph", `tl-ph--${tone}`)} />
      ))}
      {more ? <span className="tl-ph tl-ph--more">+{more}</span> : null}
    </div>
  );
}

/** A place: a map tile with the pin, what it is, and how long someone was there. */
export function PlaceCard({ title, lines, compact }: { title: React.ReactNode; lines: React.ReactNode[]; compact?: boolean }) {
  return (
    <div className="tl-map" style={compact ? { gridTemplateColumns: "88px minmax(0, 1fr)" } : undefined}>
      <span className="tl-map__tile" style={compact ? { height: 56 } : undefined}>
        <span className="tl-map__pin" />
      </span>
      <div className="tl-map__b">
        <span className="tl-map__t">{title}</span>
        {lines.map((line, i) => (
          <span key={i} className="tl-map__s">
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

/** What was agreed on a call. Calls are never recorded: the summary is typed by a person. */
export function CallSummary({ children }: { children: React.ReactNode }) {
  return (
    <div className="tl-call">
      <div className="tl-call__sum">{children}</div>
    </div>
  );
}

/** A thread from WhatsApp, as the client sees it. */
export function WhatsAppThread({ messages }: { messages: Array<{ text: string; time: string; out?: boolean }> }) {
  return (
    <div className="tl-wa">
      {messages.map((m) => (
        <span key={m.time + m.text} className={cn("tl-wa__m", m.out && "tl-wa__m--out")}>
          {m.text}
          <span className="tl-wa__t">{m.time}</span>
        </span>
      ))}
    </div>
  );
}

/** An email thread: the subject, then each message. */
export function MailThread({
  subject,
  messages,
}: {
  subject: string;
  messages: Array<{ person: Person; time: string; text: string; incoming?: boolean }>;
}) {
  return (
    <div className="tl-mail">
      <div className="tl-mail__h">
        <Glyph name="mail" />
        <span className="tl-mail__subj">{subject}</span>
      </div>
      {messages.map((m) => (
        <div key={m.time} className={cn("tl-mail__msg", m.incoming && "tl-mail__msg--in")}>
          <Face person={m.person} size={24} />
          <div>
            <div className="tl-mail__who">{m.person.name}</div>
            <div className="tl-mail__txt">{m.text}</div>
          </div>
          <span className="ev__time">{m.time}</span>
        </div>
      ))}
    </div>
  );
}

/** The lines of a sale or a bill: quantity, item, unit, line total, then one total row. */
export function Lines({
  rows,
  total,
}: {
  rows: Array<[qty: React.ReactNode, item: React.ReactNode, unit: React.ReactNode, amount: React.ReactNode]>;
  total: [label: React.ReactNode, amount: React.ReactNode];
}) {
  return (
    <div className="tl-lines">
      {rows.map((r, i) => (
        <div key={i} className="tl-lines__r">
          <span>{r[0]}</span>
          <span>{r[1]}</span>
          <span>{r[2]}</span>
          <span>{r[3]}</span>
        </div>
      ))}
      <div className="tl-lines__r tl-lines__r--total">
        <span>{total[0]}</span>
        <span>{total[1]}</span>
      </div>
    </div>
  );
}

/** A stage moving from one to the next. */
export function StagePath({ from, to }: { from: React.ReactNode; to: React.ReactNode }) {
  return (
    <div className="tl-stage">
      <State tone="calm">{from}</State>
      <Glyph name="caret-right" size="sm" style={{ color: "var(--faint)" }} />
      <State tone="info">{to}</State>
    </div>
  );
}

/** A value from one thing to another. */
export function Diff({ from, to }: { from: React.ReactNode; to: React.ReactNode }) {
  return (
    <div className="diff">
      <s>{from}</s>
      <Glyph name="caret-right" size="sm" style={{ color: "var(--faint)" }} />
      <ins>{to}</ins>
    </div>
  );
}

export type StackChange = { field: string; from: React.ReactNode; to: React.ReactNode };

/** One person's several changes in one go: a stack until opened. */
export function ChangeStack({
  title,
  changes,
  open,
  onToggle,
}: {
  title: React.ReactNode;
  changes: StackChange[];
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className={cn("tl-stack", open && "tl-stack--open")}>
      <div className="tl-stack__top">
        <span className="strong">{title}</span>
        <span className="spacer" />
        <button className="rollup" type="button" style={{ margin: 0 }} onClick={onToggle} aria-expanded={!!open}>
          {open ? "Hide" : `Show ${changes.length} changes`}
          <Glyph name="caret-down" size="sm" style={open ? { transform: "rotate(180deg)" } : undefined} />
        </button>
      </div>
      {open ? (
        <div className="tl-stack__list">
          {changes.map((c) => (
            <div key={c.field} className="tl-stack__item">
              <span className="tl-stack__k">{c.field}</span>
              <Diff from={c.from} to={c.to} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Machine events of one kind in a day, as a table: the first few and a line for the rest. */
export function RollTable({
  rows,
  foot,
}: {
  rows: Array<[code: string, time: string, how: string, amount: string]>;
  foot?: React.ReactNode;
}) {
  return (
    <div className="tl-roll">
      {rows.map((r) => (
        <div key={r[0]} className="tl-roll__r">
          <span className="code">{r[0]}</span>
          <span>{r[1]}</span>
          <span>{r[2]}</span>
          <span>{r[3]}</span>
        </div>
      ))}
      {foot ? <div className="tl-roll__foot">{foot}</div> : null}
    </div>
  );
}

/** "Show 14 sales": the control that opens a roll-up. */
export function RollToggle({
  children,
  open,
  onToggle,
}: {
  children: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button className="rollup" type="button" onClick={onToggle} aria-expanded={!!open}>
      {children}
      <Glyph name="caret-down" size="sm" style={open ? { transform: "rotate(180deg)" } : undefined} />
    </button>
  );
}

/** A row's buttons: what can be done with this event. */
export function EventActions({
  children,
  center,
}: {
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div className="ev__acts" style={center ? { justifyContent: "center" } : undefined}>
      {children}
    </div>
  );
}

export function EventButton({
  icon,
  whatsapp,
  primary,
  quiet,
  kbd,
  children,
  onClick,
}: {
  icon?: GlyphName;
  whatsapp?: boolean;
  primary?: boolean;
  quiet?: boolean;
  kbd?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Button
      variant={primary ? "primary" : quiet ? "ghost" : "secondary"}
      icon={whatsapp ? <WhatsAppMark mono={primary} /> : icon ? <Glyph name={icon} /> : undefined}
      onClick={onClick}
    >
      {children}
      {kbd ? <span className="kbd">{kbd}</span> : null}
    </Button>
  );
}

/** A failed send: what happened, in a line, and what still works. */
export function Failure({ children, still }: { children: React.ReactNode; still?: React.ReactNode }) {
  return (
    <>
      <div className="tl-fail">
        <Glyph name="warning" />
        {children}
      </div>
      {still ? (
        <div className="muted" style={{ marginTop: 2 }}>
          {still}
        </div>
      ) : null}
    </>
  );
}

export function PrivateTag() {
  return (
    <span className="tl-private">
      <Glyph name="lock" />
      Owner and admins
    </span>
  );
}

/** A message held back until quiet hours end. */
export function HeldNote({ children, onSendNow }: { children: React.ReactNode; onSendNow?: () => void }) {
  return (
    <div className="tl-held">
      <Glyph name="moon" />
      {children}
      <Button variant="ghost" onClick={onSendNow} style={{ height: 22, padding: "0 6px", fontSize: "var(--tm-t-cap)" }}>
        Send now
      </Button>
    </div>
  );
}

/** Who has seen it. */
export function Seen({ people }: { people: Person[] }) {
  return (
    <span className="seen">
      <Faces>
        {people.map((p) => (
          <Face key={p.id} person={p} size={18} label={p.name} />
        ))}
      </Faces>
      Seen by {people.map((p) => p.name).join(", ")}
    </span>
  );
}

export function Sending() {
  return <span className="tl-spin" role="img" aria-label="Sending" />;
}
