"use client";

import * as React from "react";

import { Button } from "@/components/workspace/button";
import { cn } from "@/lib/utils";

import { WhatsAppMark } from "./brand-marks";
import { Face, type Person } from "./face";
import { Glyph, type GlyphName } from "./glyph";
import { INVITE_WAYS_OUT, addMemberLabel, fullLine, seatLine, seatState, type InviteStatus } from "./seats";
import { Teams } from "./teams-root";
import { State } from "./timeline/bodies";

/**
 * People (K2): the seat meter, member rows with their state, invite rows with their way out, the invite
 * form, permissions in sentences, the screens an invited person lands on, and ownership.
 */

/** Five dashes for five seats: ink for members, grey for invites still holding one. */
export function SeatMeter({ used, held = 0, limit }: { used: number; held?: number; limit: number }) {
  const members = Math.max(0, used - held);
  return (
    <span className="meter" role="img" aria-label={seatLine(used, limit)}>
      {Array.from({ length: limit }, (_, i) => (
        <i key={i} className={i < members ? "used" : i < used ? "held" : undefined} />
      ))}
    </span>
  );
}

/** "4 of 5 seats used", in warning on the last seat. */
export function Seats({ used, held, limit, short }: { used: number; held?: number; limit: number; short?: boolean }) {
  const state = seatState(used, limit);
  return (
    <Teams>
      <div className="seats">
        <SeatMeter used={used} held={held} limit={limit} />
        <span className={cn("seats__t", state === "last" && "seats__t--warn")}>{short ? `${used} of ${limit}` : seatLine(used, limit)}</span>
      </div>
    </Teams>
  );
}

/** Every seat is taken: the owner can add one; an admin can ask the owner. */
export function SeatsFull({
  limit,
  viewer,
  owner,
  onAdd,
  onAsk,
}: {
  limit: number;
  viewer: "owner" | "admin";
  owner: Person;
  onAdd?: () => void;
  onAsk?: () => void;
}) {
  const first = owner.name.split(" ")[0];
  return (
    <Teams>
      <div className="seats-full">
        <div style={{ flex: 1 }}>
          <div className="strong">{fullLine(limit)}</div>
          {viewer === "admin" ? <div className="muted">Only {first} can add more</div> : null}
        </div>
        {viewer === "owner" ? (
          <Button variant="primary" icon={<Glyph name="user-plus" />} onClick={onAdd}>
            {addMemberLabel(limit)}
          </Button>
        ) : (
          <Button icon={<Face person={owner} size={20} />} onClick={onAsk}>
            Ask {first}
          </Button>
        )}
      </div>
    </Teams>
  );
}

export type MemberRowProps = {
  person?: Person;
  name: string;
  sub: React.ReactNode;
  /** The end of the row: a state, or a way out. */
  end?: React.ReactNode;
  faded?: boolean;
  /** A problem in the sub-line: the one place a member row takes colour. */
  problem?: boolean;
};

/** One member: face, name, a line of facts, and at the end a state or one way out. */
export function MemberRow({ person, name, sub, end, faded, problem }: MemberRowProps) {
  return (
    <Teams>
      <div className="mrow mrow--framed" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
        <div className={cn("mrow__who", faded && "mrow__who--faded")}>
          <Face person={person} size={32} />
          <div>
            <div className="mrow__name">{name}</div>
            <div className="mrow__sub" style={problem ? { color: "var(--bad)" } : undefined}>
              {sub}
            </div>
          </div>
        </div>
        {end}
      </div>
    </Teams>
  );
}

/** What each state of an invite shows, and what it offers. */
export type InviteRowProps = {
  status: InviteStatus;
  name: string;
  /** "+263 77 412 0938 · cashier". */
  contact: string;
  /** "11:30", "24 Oct": when it became this state. */
  at?: string;
  via?: "whatsapp" | "email";
  onWay?: (way: string) => void;
};

const WAY_ICON: Record<string, GlyphName> = {
  Resend: "retry",
  "Send the other way": "mail",
  "Send again": "retry",
};

export function InviteRow({ status, name, contact, at, via = "whatsapp", onWay }: InviteRowProps) {
  const ways = INVITE_WAYS_OUT[status];
  const [first] = ways;
  const person = name.split(" ")[0];
  const sub =
    status === "not_delivered"
      ? `${via === "whatsapp" ? "WhatsApp" : "Email"} couldn't deliver to ${contact.split(" · ")[0]}`
      : contact;
  const end =
    status === "sent" ? (
      <div className="cx-group">
        {ways.map((w) => (
          <Button key={w} icon={w === "Resend" ? <Glyph name="retry" /> : undefined} onClick={() => onWay?.(w)}>
            {w}
          </Button>
        ))}
      </div>
    ) : status === "not_delivered" ? (
      <Button icon={<Glyph name={WAY_ICON[first] ?? "mail"} />} onClick={() => onWay?.(first)}>
        {first === "Send the other way" ? (via === "whatsapp" ? "Send by email" : "Send on WhatsApp") : first}
      </Button>
    ) : status === "accepted" ? (
      <State tone="ok">Joined {at}</State>
    ) : status === "expired" ? (
      <Button icon={<Glyph name="retry" />} onClick={() => onWay?.(first)}>
        {first}
      </Button>
    ) : (
      <State tone="calm">Revoked {at}</State>
    );
  return (
    <MemberRow
      name={name}
      sub={sub}
      problem={status === "not_delivered"}
      faded={status === "revoked"}
      end={
        status === "revoked" ? (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--tm-s3)" }}>
            {end}
            <Button icon={<WhatsAppMark />} onClick={() => onWay?.(first)}>
              {first.replace("Invite again", `Invite ${person} again`)}
            </Button>
          </div>
        ) : status === "expired" ? (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--tm-s3)" }}>
            <State tone="calm">Expired {at}</State>
            {end}
          </div>
        ) : (
          end
        )
      }
    />
  );
}

/** Invite someone: who, as what, where, and how many seats it leaves. */
export function InviteForm({
  workspace,
  contact,
  onContact,
  role,
  place,
  seats,
  onSend,
  problem,
}: {
  workspace: string;
  contact: string;
  onContact?: (v: string) => void;
  role: string;
  place: string;
  seats: React.ReactNode;
  onSend?: () => void;
  /** The contact is already a member: the line that says so replaces the rest. */
  problem?: React.ReactNode;
}) {
  return (
    <Teams>
      <div className="invite-form">
        <div className="strong" style={{ fontSize: "var(--tm-t-lead)" }}>
          Invite someone to {workspace}
        </div>
        <label className="cx-field">
          <span className="cx-label">Email or phone number</span>
          <input
            className="cx-input"
            value={contact}
            onChange={(e) => onContact?.(e.target.value)}
            aria-label="Email or phone number"
            aria-invalid={!!problem}
            style={problem ? { borderColor: "var(--bad)" } : undefined}
          />
          {problem ? <span className="cx-hint" style={{ color: "var(--bad)" }}>{problem}</span> : null}
        </label>
        <div className="invite-form__two">
          <label className="cx-field">
            <span className="cx-label">Role</span>
            <span className="tm-sel" style={{ height: 36 }}>
              {role}
              <Glyph name="caret-down" />
            </span>
          </label>
          <label className="cx-field">
            <span className="cx-label">Shop</span>
            <span className="tm-sel" style={{ height: 36 }}>
              {place}
              <Glyph name="caret-down" />
            </span>
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--tm-s3)" }}>
          <span className="seats">{seats}</span>
          <span className="spacer" />
          <Button variant="primary" icon={<WhatsAppMark mono />} onClick={onSend}>
            Send on WhatsApp
          </Button>
        </div>
      </div>
    </Teams>
  );
}

export type Grant = "default" | "allowed" | "denied";

/** A permission in a sentence, with three states. "Role default" is a state of its own, so a role change still moves them. */
export function PermissionRow({
  label,
  roleDefault,
  value,
  first,
  last,
  onChange,
}: {
  label: string;
  roleDefault: "yes" | "no";
  value: Grant;
  first?: boolean;
  last?: boolean;
  onChange?: (v: Grant) => void;
}) {
  return (
    <div className="prow" style={{ paddingTop: first ? 0 : undefined, borderBottom: last ? 0 : undefined, paddingBottom: last ? 0 : undefined }}>
      <div className="prow__t">{label}</div>
      <div className="tri" role="group" aria-label={label}>
        <button type="button" className="is-default" aria-pressed={value === "default"} onClick={() => onChange?.("default")}>
          Role default: {roleDefault}
        </button>
        <button type="button" aria-pressed={value === "allowed"} onClick={() => onChange?.("allowed")}>
          Allowed
        </button>
        <button type="button" aria-pressed={value === "denied"} onClick={() => onChange?.("denied")}>
          Denied
        </button>
      </div>
    </div>
  );
}

/** A limit where the work is: its reason, and who can do it. */
export function LimitNotice({
  title,
  detail,
  ask,
}: {
  title: string;
  detail: string;
  ask: { person: Person; onAsk?: () => void };
}) {
  return (
    <Teams>
      <div className="notice notice--plain">
        <Glyph name="lock" />
        <div style={{ flex: 1 }}>
          <div className="notice__t">{title}</div>
          <div className="notice__b">{detail}</div>
        </div>
        <Button icon={<Face person={ask.person} size={20} />} onClick={ask.onAsk}>
          Ask {ask.person.name.split(" ")[0]}
        </Button>
      </div>
    </Teams>
  );
}

/** What an invited person lands on when the link does not open the door. */
export function JoinProblem({
  icon,
  title,
  sub,
  action,
}: {
  icon: GlyphName;
  title: string;
  sub?: string;
  action: { label: string; icon?: GlyphName; onClick?: () => void };
}) {
  return (
    <div className="join-problem">
      <Glyph name={icon} style={{ color: "var(--ink-3)" }} />
      <div style={{ flex: 1 }}>
        <div className="strong">{title}</div>
        {sub ? <div className="muted">{sub}</div> : null}
      </div>
      <Button icon={action.icon ? <Glyph name={action.icon} /> : undefined} onClick={action.onClick}>
        {action.label}
      </Button>
    </div>
  );
}

/** The invite, as the person invited sees it. */
export function JoinCard({
  mark,
  title,
  sub,
  action,
  onJoin,
}: {
  mark: React.ReactNode;
  title: string;
  sub?: string;
  action: string;
  onJoin?: () => void;
}) {
  return (
    <Teams>
      <div className="join-card">
        {mark}
        <div className="strong" style={{ fontSize: "var(--tm-t-h3)" }}>
          {title}
        </div>
        {sub ? <div className="muted">{sub}</div> : null}
        <Button variant="primary" size="field" icon={<Glyph name="check" />} onClick={onJoin} style={{ height: 40, paddingInline: 16, alignSelf: "center" }}>
          {action}
        </Button>
      </div>
    </Teams>
  );
}

/** An offer of ownership in Needs you: who, what moves, until when, and the two answers. */
export function OwnershipOffer({
  from,
  workspace,
  moves,
  until,
  onAccept,
  onDecline,
}: {
  from: Person;
  workspace: string;
  moves: string;
  until: string;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  return (
    <Teams>
      <div className="irow irow--card" style={{ padding: "var(--tm-s3) var(--tm-s4)" }}>
        <Face person={from} label={from.name} />
        <div>
          <div className="irow__t">
            <b>{from.name}</b> offered you ownership of <b>{workspace}</b>
          </div>
          <div className="irow__m">
            {moves} · open until {until}
          </div>
          <div className="irow__acts">
            <Button icon={<Glyph name="crown" />} onClick={onAccept}>
              Become the owner
            </Button>
            <Button variant="ghost" onClick={onDecline}>
              Decline
            </Button>
          </div>
        </div>
      </div>
    </Teams>
  );
}

/** Asked twice: the dialog that makes ownership move, and a button that names what it does. */
export function OwnershipAsk({
  workspace,
  from,
  onCancel,
  onConfirm,
}: {
  workspace: string;
  from: string;
  onCancel?: () => void;
  onConfirm?: () => void;
}) {
  return (
    <Teams>
      <div className="ask-twice">
        <div className="strong" style={{ fontSize: "var(--tm-t-lead)" }}>
          Become the owner of {workspace}?
        </div>
        <div className="muted">On the bill from {from}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--tm-s2)" }}>
          <Button onClick={onCancel}>Not yet</Button>
          <Button variant="primary" icon={<Glyph name="crown" />} onClick={onConfirm}>
            Become the owner
          </Button>
        </div>
      </div>
    </Teams>
  );
}
