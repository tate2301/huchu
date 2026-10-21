"use client";

import * as React from "react";

import { Face } from "./face";
import { Glyph } from "./glyph";
import { Teams } from "./teams-root";
import "./w-people.css";

/**
 * The workspace switcher (W7-4, W7-5): the workspaces a person is in, with how many things wait in each,
 * New workspace, and who they are. Fixture data only; it mounts once a person can belong to more than one
 * workspace (M8).
 */
export type SwitcherWorkspace = { id: string; name: string; sub: string; waiting?: number; current?: boolean; tone?: "plain" | "dark" };

export function WorkspaceSwitcher({
  workspaces,
  person,
  onSwitch,
  onNew,
  onProfile,
  onSignOut,
}: {
  workspaces: SwitcherWorkspace[];
  person: { name: string; email: string };
  onSwitch?: (id: string) => void;
  onNew?: () => void;
  onProfile?: () => void;
  onSignOut?: () => void;
}) {
  return (
    <Teams>
      <div className="wp-sw-panel" role="menu" aria-label="Workspaces">
        {workspaces.map((ws, index) => (
          <button key={ws.id} type="button" role="menuitem" className="wp-sw-row" aria-current={ws.current ? "true" : undefined} onClick={() => onSwitch?.(ws.id)}>
            <span className={ws.tone === "dark" ? "wp-ws wp-ws--b" : "wp-ws"}>{ws.name[0]}</span>
            <span>
              <b>{ws.name}</b>
              {ws.sub}
            </span>
            <span className="wp-sw-end">
              {ws.current ? <Glyph name="check" /> : ws.waiting ? <span className="wp-count" aria-label={`${ws.waiting} waiting`}>{ws.waiting}</span> : null}
              <span className="kbd">Ctrl {index + 1}</span>
            </span>
          </button>
        ))}
        <div className="wp-sw-sep" />
        <button type="button" role="menuitem" className="wp-sw-row" style={{ gridTemplateColumns: "24px minmax(0, 1fr)" }} onClick={onNew}>
          <Glyph name="plus" />
          <span>New workspace</span>
        </button>
        <div className="wp-sw-sep" />
        <div className="wp-sw-row" style={{ cursor: "default" }}>
          <Face person={{ name: person.name }} size={32} />
          <span>
            <b>{person.name}</b>
            {person.email}
          </span>
          <span />
        </div>
        <button type="button" role="menuitem" className="wp-sw-row" style={{ gridTemplateColumns: "24px minmax(0, 1fr)" }} onClick={onProfile}>
          <Glyph name="person" />
          <span>Your profile</span>
        </button>
        <button type="button" role="menuitem" className="wp-sw-row" style={{ gridTemplateColumns: "24px minmax(0, 1fr)" }} onClick={onSignOut}>
          <Glyph name="lock" />
          <span>Sign out</span>
        </button>
      </div>
    </Teams>
  );
}
