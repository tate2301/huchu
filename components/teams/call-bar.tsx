import * as React from "react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/workspace/button";

import { WhatsAppMark } from "./brand-marks";
import { Face, Faces, Pres, type Person, type PresenceKind } from "./face";
import { Glyph, type GlyphName } from "./glyph";

/**
 * Calls on a record (K1). Props only: nothing here joins a room. Calls are never recorded, so the only
 * trace is the timeline line, who was on it and for how long.
 */

export type CallPerson = { person: Person; kind?: PresenceKind };

export function IncomingCall({
  caller,
  record,
  subject,
  onJoin,
  onDecline,
}: {
  caller: Person;
  record: string;
  subject: string;
  onJoin?: () => void;
  onDecline?: () => void;
}) {
  const first = caller.name.split(" ")[0];
  return (
    <div className="call-in">
      <Pres kind="talk">
        <Face person={caller} size={32} label={caller.name} />
      </Pres>
      <div className="call-txt">
        <div className="strong">
          {first} is calling about {record}
        </div>
        <div className="muted">{subject}</div>
      </div>
      <div className="cx-group">
        <Button icon={<Glyph name="x" size="sm" />} onClick={onDecline}>
          Not now
        </Button>
        <Button icon={<Glyph name="phone" />} onClick={onJoin}>
          Join
        </Button>
      </div>
    </div>
  );
}

export type CallAction = {
  label: string;
  icon: GlyphName;
  /** The button is showing the state it is in: "Unmute" while muted. */
  on?: boolean;
  leave?: boolean;
  onClick?: () => void;
};

/** The live call strip: who is on it, what is happening, and what can be done. */
export function CallBar({
  people,
  title,
  meta,
  actions,
  dim,
}: {
  people: CallPerson[];
  title: string;
  meta: string;
  actions: CallAction[];
  /** A poor connection dims the faces. */
  dim?: boolean;
}) {
  return (
    <div className="callbar" style={{ margin: 0 }} role="group" aria-label="Call">
      <Faces style={dim ? { opacity: 0.6 } : undefined}>
        {people.map(({ person, kind }) =>
          dim ? (
            <Face key={person.id} person={person} label={person.name} />
          ) : (
            <Pres key={person.id} kind={kind}>
              <Face person={person} label={person.name} />
            </Pres>
          ),
        )}
      </Faces>
      <div className="call-txt">
        <div className="callbar__t">{title}</div>
        <div className="callbar__m">{meta}</div>
      </div>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          className={cn("cbtn", a.leave && "cbtn--leave", a.on && "cbtn--on")}
          onClick={a.onClick}
        >
          <Glyph name={a.icon} />
          {a.label}
        </button>
      ))}
    </div>
  );
}

/** The call went wrong: what happened, what still works, one way out as a button. */
export function CallNotice({
  tone = "calm",
  icon,
  title,
  sub,
  action,
}: {
  tone?: "calm" | "warn" | "bad";
  icon: GlyphName;
  title: string;
  sub?: string;
  action: { label: string; icon?: GlyphName; whatsapp?: boolean; onClick?: () => void };
}) {
  return (
    <div className={cn("call-note", tone === "warn" && "call-note--warn")}>
      <Glyph
        name={icon}
        style={{ color: tone === "warn" ? "var(--warn)" : tone === "bad" ? "var(--bad)" : "var(--ink-3)" }}
      />
      <div className="call-txt">
        <div className="strong">{title}</div>
        {sub ? <div className="muted">{sub}</div> : null}
      </div>
      <Button
        icon={action.whatsapp ? <WhatsAppMark /> : action.icon ? <Glyph name={action.icon} /> : undefined}
        onClick={action.onClick}
      >
        {action.label}
      </Button>
    </div>
  );
}

/** The one line a call leaves on the timeline: who was on it and for how long. */
export function callLine(host: string, others: string[], minutes: number, about = "this job") {
  return { host, others, minutes, about };
}
