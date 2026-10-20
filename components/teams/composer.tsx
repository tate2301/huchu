import * as React from "react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/workspace/button";
import { Segmented } from "@/components/workspace/segmented";

import { Face, type Person } from "./face";
import { Glyph } from "./glyph";
import { Mention } from "./timeline/bodies";

/** The composer: for the team, or a record of what you told the client, chosen first. */
export type ComposerKind = "team" | "client";

export function Composer({
  kind,
  onKindChange,
  clientHow,
  children,
  action,
}: {
  kind: ComposerKind;
  onKindChange?: (k: ComposerKind) => void;
  /** The way the client was reached, shown beside the choice when logging contact. */
  clientHow?: string;
  /** The text so far. */
  children?: React.ReactNode;
  action: { label: string; icon: "chat" | "phone"; onClick?: () => void };
}) {
  return (
    <div className="composer" style={{ margin: 0 }}>
      {onKindChange ? (
        <div className="composer__kind">
          <Segmented
            aria-label="Kind"
            value={kind}
            onValueChange={onKindChange}
            items={[
              {
                value: "team",
                label: (
                  <>
                    <Glyph name="chat" size="sm" />
                    For the team
                  </>
                ),
              },
              {
                value: "client",
                label: (
                  <>
                    <Glyph name="phone" size="sm" />
                    Contact with the client
                  </>
                ),
              },
            ]}
          />
          {kind === "client" && clientHow ? (
            <span className="tm-sel" style={{ marginLeft: "auto" }}>
              {clientHow}
              <Glyph name="caret-down" />
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={cn("composer__text", children ? "has" : null)}>
        {children}
      </div>
      <div className="composer__foot">
        <span className="spacer" />
        <Button icon={<Glyph name={action.icon} />} onClick={action.onClick}>
          {action.label}
        </Button>
      </div>
    </div>
  );
}

/** Who can be mentioned as the writer types "@": members first, then a way to invite. */
export function MentionMenu({
  matches,
  invite,
}: {
  matches: Array<{ person: Person; role: string }>;
  invite?: { name: string };
}) {
  return (
    <div className="cx-menu" role="listbox" style={{ width: 260 }}>
      {matches.map((m, i) => (
        <button
          key={m.person.id}
          type="button"
          className="cx-menu__item"
          role="option"
          aria-selected={i === 0}
        >
          <Face person={m.person} size={24} />
          {m.person.name}
          <span className="muted" style={{ marginLeft: "auto" }}>
            {m.role}
          </span>
        </button>
      ))}
      {invite ? (
        <button
          type="button"
          className="cx-menu__item"
          role="option"
          aria-selected={false}
        >
          <Face size={24} />
          {invite.name}, not a member
          <span className="muted" style={{ marginLeft: "auto" }}>
            Invite
          </span>
        </button>
      ) : null}
    </div>
  );
}

export { Mention };

/** A comment that has not left the phone, or did not post: the line under it says which. */
export function PendingComment({
  state,
  children,
  onRetry,
}: {
  state: "waiting" | "failed";
  children: React.ReactNode;
  onRetry?: () => void;
}) {
  const failed = state === "failed";
  return (
    <div>
      <div
        className="bubble"
        style={{
          margin: 0,
          boxShadow: `inset 0 0 0 1px ${failed ? "var(--bad)" : "var(--warn-line)"}`,
        }}
      >
        {children}
      </div>
      <div className={cn("pending", failed ? "pending--bad" : "pending--warn")}>
        <Glyph name={failed ? "alert" : "wait"} size="sm" />
        {failed ? "Didn't post" : "Waiting to send"}
        {failed ? (
          <>
            <span className="spacer" />
            <Button icon={<Glyph name="undo" />} onClick={onRetry}>
              Try again
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** A comment you deleted, for a few seconds' undo. */
export function DeletedComment({
  seconds,
  onUndo,
}: {
  seconds: number;
  onUndo?: () => void;
}) {
  return (
    <div className="deleted">
      <span className="muted" style={{ flex: 1 }}>
        Your comment was deleted
      </span>
      <Button icon={<Glyph name="undo" />} onClick={onUndo}>
        Undo<span className="muted num">{seconds}</span>
      </Button>
    </div>
  );
}
