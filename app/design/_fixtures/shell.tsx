"use client";

import * as React from "react";

import { Button, Icon, Kbd, VaneMark, type IconName } from "@/components/core";
import { VaneButtonView } from "@/components/vane/vane-button-view";

/**
 * The kit's shell for the fixture screens (design/core-modules/tools/boards/ck.py
 * `rail`, `panel`, `topbar`): the rail, the module panel and the top bar as the
 * boards draw them, around a screen. The app's own shell needs a signed-in
 * workspace's navigation, so the fixtures draw this one; it has the same
 * measures (components/layout/workspace-rail).
 */

const RAIL: Array<[IconName, string]> = [
  ["pipeline", "Pipeline"],
  ["visits", "Site visits"],
  ["showroom", "Showroom"],
  ["books", "Books"],
  ["reports", "Reports"],
  ["docs", "Documents"],
];

export type PanelRow =
  | { label: string; icon: IconName; count?: number; on?: boolean }
  | { label: string; dot: true; meta?: string; on?: boolean };

export type PanelGroup = { title: string; add?: boolean; rows: PanelRow[] };

function Row({ row }: { row: PanelRow }) {
  return (
    <a className={row.on ? "pn is-on" : "pn"} href={`#${row.label}`} aria-current={row.on ? "page" : undefined}>
      {"dot" in row ? <span className="pn-dot" /> : <Icon name={row.icon} />}
      <span className="truncate">{row.label}</span>
      {"count" in row && row.count !== undefined ? <span className="pn-n">{row.count}</span> : null}
      {"meta" in row && row.meta ? <span className="pn-m">{row.meta}</span> : null}
    </a>
  );
}

/** The rail alone, beside a screen that takes the rest of the page (a builder). */
export function FixtureRail({ module }: { module: string }) {
  return (
    <nav className="rail-m" aria-label="Modules">
      <span className="ws-tile" aria-label="Floorcode">
        <Icon name="ws" />
      </span>
      {RAIL.map(([icon, label]) => (
        <a
          key={label}
          className={label === module ? "rm is-on" : "rm"}
          href={`#${label}`}
          aria-label={label}
          aria-current={label === module ? "page" : undefined}
        >
          <Icon name={icon} />
        </a>
      ))}
      <span className="grow" />
      <a className={module === "Vane" ? "rm is-on" : "rm"} href="#vane" aria-label="Vane">
        <VaneMark size={20} />
      </a>
      <a className="rm" href="#settings" aria-label="Management">
        <Icon name="gear" />
      </a>
      <span className="me" aria-label="James Nyabadza">
        <Icon name="person" />
      </span>
    </nav>
  );
}

export function FixtureShell({
  module,
  panelTitle,
  rows,
  groups = [],
  title,
  titleIcon,
  actions,
  vaneCount = 5,
  vaneOpen = false,
  side,
  children,
}: {
  module: string;
  panelTitle: string;
  rows: PanelRow[];
  groups?: PanelGroup[];
  title: string;
  titleIcon: IconName;
  actions?: React.ReactNode;
  vaneCount?: number;
  vaneOpen?: boolean;
  /** A column on the right of the page: an `aside.cm-vane`, which the kit docks as the shell's fourth column. */
  side?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="sh">
      <FixtureRail module={module} />
      <aside className="panel-m" aria-label={panelTitle}>
        <div className="pm-h">
          <b>{panelTitle}</b>
          <Button variant="quiet" iconOnly icon="panel" label="Hide the panel" />
        </div>
        <label className="input-wrap pm-find">
          <Icon name="search" />
          <input type="search" aria-label={`Search ${panelTitle}`} placeholder="Search" />
          <Kbd>/</Kbd>
        </label>
        <div className="pm-body">
          {rows.map((row) => (
            <Row key={row.label} row={row} />
          ))}
          {groups.map((group) => (
            <div className="pg" key={group.title}>
              <div className="pg-h">
                <Icon name="down" />
                <span>{group.title}</span>
                {group.add ? (
                  <Button variant="quiet" iconOnly icon="plus" label={`Add to ${group.title}`} className="pg-add" />
                ) : null}
              </div>
              {group.rows.map((row) => (
                <Row key={row.label} row={row} />
              ))}
            </div>
          ))}
        </div>
        <div className="pm-foot">
          <Row row={{ label: "Help", icon: "help" }} />
        </div>
      </aside>
      <main className="mn">
        <header className="tb-m">
          <h1>
            <Icon name={titleIcon} />
            {title}
          </h1>
          <div className="tb-r">
            <label className="input-wrap tb-find">
              <Icon name="search" />
              <input type="search" aria-label="Search everything" placeholder="Search everything" />
              <Kbd>Ctrl K</Kbd>
            </label>
            <Button variant="quiet" iconOnly icon="bell" label="Notifications" />
            <VaneButtonView open={vaneOpen} count={vaneCount} working />
            {actions}
          </div>
        </header>
        {children}
      </main>
      {side}
    </div>
  );
}
