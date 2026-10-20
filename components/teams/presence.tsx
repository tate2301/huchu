import * as React from "react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/workspace/button";

import { Face, Faces, Pres, type Person, type PresenceKind } from "./face";
import { Glyph } from "./glyph";

/** "You and Kudakwashe", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export type Here = { person: Person; kind?: PresenceKind };

/** Who is on this record: their faces, with presence marks, and one line saying so. */
export function HereRow({
  faces,
  faded,
  children,
}: {
  faces: Here[];
  /** Reconnecting: the faces dim until the channel is back. */
  faded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="here">
      <Faces style={faded ? { opacity: 0.4 } : undefined}>
        {faces.map(({ person, kind }) =>
          faded ? (
            <Face key={person.id} person={person} label={person.name} />
          ) : (
            <Pres key={person.id} kind={kind}>
              <Face person={person} label={person.name} />
            </Pres>
          ),
        )}
      </Faces>
      <span className="here__text">{children}</span>
    </div>
  );
}

/** The people on a record in the top bar: faces only, the names are in the tooltip. */
export function PresenceFaces({ faces, size = 24 }: { faces: Here[]; size?: 20 | 24 | 28 }) {
  return (
    <Faces>
      {faces.map(({ person, kind }) => (
        <Pres key={person.id} kind={kind}>
          <Face person={person} size={size} label={person.name} />
        </Pres>
      ))}
    </Faces>
  );
}

/** Someone is writing a comment. */
export function Typing({ name }: { name: string }) {
  return (
    <span className="typing">
      <span className="dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {name} is typing
    </span>
  );
}

/** A field someone else is editing: it takes a ring and their face at its edge. */
export function EditingValue({ label, value, person }: { label: string; value: React.ReactNode; person: Person }) {
  return (
    <dl className="attrs" style={{ margin: 0 }}>
      <dt>{label}</dt>
      <dd className="attrs__editing">
        {value}
        <Face person={person} size={20} label={`${person.name} is editing`} style={{ marginLeft: "auto" }} />
      </dd>
    </dl>
  );
}

/** Presence is down: a mark that says so and one way back. */
export function PresenceDown({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="here">
      <span className="face" role="img" aria-label="Can't show who's here" title="Can't show who's here">
        <Glyph name="offline" size="sm" />
      </span>
      <Button icon={<Glyph name="undo" />} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** Two people, one field: whose change stands. */
export function FieldConflict({
  person,
  at,
  label,
  theirs,
  mine,
  onKeepMine,
  onKeepTheirs,
}: {
  person: Person;
  at: string;
  label: string;
  theirs: React.ReactNode;
  mine: React.ReactNode;
  onKeepMine?: () => void;
  onKeepTheirs?: () => void;
}) {
  const first = person.name.split(" ")[0];
  return (
    <div className={cn("conflict")}>
      <div className="conflict__who">
        <Face person={person} size={24} />
        <span>
          <b className="strong">{first}</b> changed the {label} at {at}
        </span>
      </div>
      <dl className="attrs" style={{ margin: 0 }}>
        <dt>{first}&apos;s</dt>
        <dd className="num">{theirs}</dd>
        <dt>Yours</dt>
        <dd className="num">{mine}</dd>
      </dl>
      <div className="cx-group" style={{ alignSelf: "flex-start" }}>
        <Button onClick={onKeepMine}>Keep mine</Button>
        <Button onClick={onKeepTheirs}>Keep {first}&apos;s</Button>
      </div>
    </div>
  );
}
