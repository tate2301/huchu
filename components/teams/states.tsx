"use client";

import * as React from "react";

import { Button } from "@/components/workspace/button";
import { cn } from "@/lib/utils";

import { WhatsAppMark } from "./brand-marks";
import { Face, type Person } from "./face";
import { Glyph, type GlyphName } from "./glyph";
import { Teams } from "./teams-root";

/**
 * The states with no board of their own until K9: ownership declined or withdrawn, an invite that no longer
 * works, an import paused, undone or refused, fiscal receipts, and a setup that is done. Each says what
 * happened and what still works, and offers one way out as a button.
 */

/** A shortcut shown on a button that answers to it. */
function Key({ children }: { children: React.ReactNode }) {
  return <span className="kbd">{children}</span>;
}

export function OwnershipDeclined({
  person,
  role,
  declinedAt,
  offeredAt,
  offeredBy,
  onOfferAgain,
}: {
  person: Person;
  role: string;
  declinedAt: string;
  offeredAt: string;
  offeredBy: string;
  onOfferAgain?: () => void;
}) {
  const first = person.name.split(" ")[0];
  return (
    <Teams>
      <div className="k9-row">
        <Face person={person} size={32} />
        <div className="k9-grow">
          <div className="strong">{person.name}</div>
          <div className="muted">
            {role} · declined ownership {declinedAt}
          </div>
        </div>
        <Button icon={<Glyph name="crown" />} onClick={onOfferAgain}>
          Offer again
        </Button>
      </div>
      <div className="k9-hist">
        <span>Offered by {offeredBy}</span>
        <span>{offeredAt}</span>
        <span>Declined by {first}</span>
        <span>{declinedAt}</span>
      </div>
    </Teams>
  );
}

export function OwnershipWithdrawn({
  by,
  workspace,
  offeredAt,
  withdrawnAt,
}: {
  by: Person;
  workspace: string;
  offeredAt: string;
  withdrawnAt: string;
}) {
  return (
    <Teams>
      <div className="irow irow--plain">
        <Face size={28} />
        <div style={{ minWidth: 0 }}>
          <div className="irow__t">
            <b>{by.name}</b> withdrew the offer of ownership of <b>{workspace}</b>
          </div>
          <div className="irow__m">
            <Glyph name="crown" size="sm" />
            Offered {offeredAt} · withdrawn {withdrawnAt}
            <span className="spacer" />
            {withdrawnAt}
          </div>
        </div>
      </div>
    </Teams>
  );
}

/** An invite opened after it was revoked. */
export function InviteGone({
  mark,
  title,
  sub,
  action,
  onAsk,
}: {
  mark: React.ReactNode;
  title: string;
  sub: string;
  action: string;
  onAsk?: () => void;
}) {
  return (
    <Teams>
      <div className="k9-join">
        {mark}
        <div className="k9-join__t">{title}</div>
        <div className="muted">{sub}</div>
        <Button variant="primary" icon={<WhatsAppMark mono />} onClick={onAsk}>
          {action}
          <Key>Enter</Key>
        </Button>
      </div>
    </Teams>
  );
}

type ImportFileProps = { kind: "xls" | "file" | "locked"; name: string; sub: string };

function ImportFile({ kind, name, sub }: ImportFileProps) {
  const icon: GlyphName = kind === "xls" ? "table" : kind === "locked" ? "lock" : "doc";
  return (
    <div className="k9-file">
      <span className={cn("fl__mark", kind === "xls" && "fl__mark--xls")}>
        <Glyph name={icon} size="sm" />
      </span>
      <div className="k9-grow">
        <div className="strong">{name}</div>
        <div className="muted">{sub}</div>
      </div>
    </div>
  );
}

/** An import that stopped partway: where, when, and a button that carries on from the next row. */
export function ImportPaused({
  name,
  total,
  unit,
  at,
  time,
  onCarryOn,
}: {
  name: string;
  total: number;
  unit: string;
  at: number;
  time: string;
  onCarryOn?: () => void;
}) {
  return (
    <Teams>
      <ImportFile kind="xls" name={name} sub={`${total} ${unit}`} />
      <div className="k9-prog">
        <div className="track">
          <i style={{ width: `${Math.round((at / total) * 100)}%`, background: "var(--warn-dot)" }} />
        </div>
        <div className="k9-prog__l">
          <span className="k9-warn">
            <Glyph name="offline" size="sm" />
            Paused at {at} of {total} · {time}
          </span>
        </div>
      </div>
      <Button variant="primary" icon={<Glyph name="retry" />} onClick={onCarryOn}>
        Carry on from {at + 1}
        <Key>Enter</Key>
      </Button>
    </Teams>
  );
}

/** An import someone undid: what was removed, and a way to import again. */
export function ImportUndone({
  name,
  by,
  time,
  icon,
  noun,
  samples,
  removed,
  onAgain,
}: {
  name: string;
  by: string;
  time: string;
  icon: GlyphName;
  noun: string;
  samples: number;
  removed: number;
  onAgain?: () => void;
}) {
  return (
    <Teams>
      <ImportFile kind="xls" name={name} sub={`Undone by ${by} · ${time}`} />
      <dl className="kv" style={{ margin: 0 }}>
        <dt>
          <Glyph name={icon} />
          {noun}
        </dt>
        <dd>{samples} samples</dd>
        <dt>
          <Glyph name="undo" />
          Removed
        </dt>
        <dd>{removed} imported</dd>
      </dl>
      <Button icon={<Glyph name="upload" />} onClick={onAgain}>
        Import again
      </Button>
    </Teams>
  );
}

/** A file that cannot be read: what is wrong with it, and one way out. */
export function ImportRefused({
  name,
  size,
  problem,
  onChoose,
}: {
  name: string;
  size: string;
  problem: string;
  onChoose?: () => void;
}) {
  return (
    <Teams>
      <ImportFile kind="file" name={name} sub={size} />
      <div className="k9-bad">
        <Glyph name="alert" size="sm" />
        {problem}
      </div>
      <Button icon={<Glyph name="upload" />} onClick={onChoose}>
        Choose another file
      </Button>
    </Teams>
  );
}

/** A file locked with a password. */
export function ImportLocked({
  name,
  onOpen,
  value = "",
}: {
  name: string;
  onOpen?: (password: string) => void;
  value?: string;
}) {
  const [password, setPassword] = React.useState(value);
  return (
    <Teams>
      <ImportFile kind="locked" name={name} sub="Locked with a password" />
      <label className="k9-field">
        <span className="k9-field__l">Password for this file</span>
        <input
          className="k9-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Password for this file"
        />
      </label>
      <Button icon={<Glyph name="lock" />} onClick={() => onOpen?.(password)}>
        Open and import
        <Key>Enter</Key>
      </Button>
    </Teams>
  );
}

export type SetupItemState = "open" | "done" | "wait" | "bad" | "skipped";

/** One step of setup, with a live sub-line and the one thing to do about it. */
export function SetupItem({
  state,
  title,
  sub,
  action,
}: {
  state: SetupItemState;
  title: string;
  sub?: string;
  action?: { label: string; icon?: GlyphName; quiet?: boolean; onClick?: () => void };
}) {
  return (
    <div className={cn("ci", state === "done" && "ci--done", state === "wait" && "ci--wait")}>
      <span
        className="ci__mark"
        style={
          state === "bad"
            ? { boxShadow: "none", background: "var(--bad)" }
            : state === "skipped"
              ? { background: "var(--tray)" }
              : undefined
        }
      >
        {state === "done" ? <Glyph name="check" size="sm" /> : state === "bad" ? <Glyph name="x" size="sm" /> : null}
      </span>
      <div>
        <div className="ci__t">{title}</div>
        {sub ? (
          <div className="ci__s" style={state === "bad" ? { color: "var(--bad)" } : undefined}>
            {sub}
          </div>
        ) : null}
      </div>
      {action ? (
        <Button variant={action.quiet ? "ghost" : "secondary"} icon={action.icon ? <Glyph name={action.icon} /> : undefined} onClick={action.onClick}>
          {action.label}
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}

/** Setup is finished: what was done, as ticks, and one button to put the checklist away. */
export function SetupDone({
  mark,
  title,
  done,
  items,
  onHide,
}: {
  mark: React.ReactNode;
  title: string;
  done: number;
  items: string[];
  onHide?: () => void;
}) {
  return (
    <Teams>
      <div className="k9-ws">
        {mark}
        <span className="strong">{title}</span>
        <span className="spacer" />
        <span className="muted num">
          {done} of {done}
        </span>
      </div>
      <div className="track" style={{ margin: "2px 0 4px", width: "100%" }}>
        <i style={{ width: "100%" }} />
      </div>
      <div className="k9-done">
        {items.map((label) => (
          <span key={label} className="k9-chip">
            <span className="ci__mark">
              <Glyph name="check" size="sm" />
            </span>
            {label}
          </span>
        ))}
      </div>
      <div className="k9-row" style={{ justifyContent: "flex-end" }}>
        <Button icon={<Glyph name="x" size="sm" />} onClick={onHide}>
          Hide the checklist
        </Button>
      </div>
    </Teams>
  );
}

/** The steps of setup, as one list. */
export function SetupList({ children }: { children: React.ReactNode }) {
  return <div className="tm-check">{children}</div>;
}
