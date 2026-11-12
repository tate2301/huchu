"use client";

import * as React from "react";

import {
  FormPage,
  KitPage,
  OwnsChrome,
  RecordHeader,
  RegisterLayout,
  SettingsSurface,
} from "@/components/management/ui";
import settingsStyles from "@/components/management/ui/settings.module.css";
import { useShellNavIfAny } from "@/components/layout/shell-nav";

const embeddedClass = settingsStyles.embedded;

export type SettingsFrameProps = {
  /**
   * The screen. A `<RegisterLayout />` or a `<FormPage />` is passed straight
   * through as the surface's content column and draws its own chrome.
   * Anything else is wrapped in the record column and given the title line
   * below, which is how a page that has not been rebuilt yet still gets a
   * rule-3 header instead of the band this shell used to draw.
   */
  children: React.ReactNode;
  /** The fallback title line's text. Ignored once children draw their own. */
  title?: string;
  /** The fallback title line's one verb. Ignored once children draw their own. */
  actions?: React.ReactNode;
  /**
   * Counts for the rail, keyed by nav entry id (`users`, `job-grades`, …).
   *
   * A prop, not a query. `Rail.dc.html` draws a figure beside most entries,
   * but resolving twenty-three of them would mean twenty-three new requests
   * fired from the shell on every settings page — new data fetching, which
   * this refactor does not do. A page that has already loaded a figure can
   * hand it over; the rest render without one, which the rail supports.
   */
  railCounts?: Record<string, number>;
  /** Entry ids with something needing attention — the amber dot. */
  railAttention?: string[];
};

/**
 * Management and account preferences, as one surface over the app.
 *
 * ## Why there is one shell now and not two
 *
 * There were two: this one, and `PreferencesShell`. They drew the same grid
 * with different chrome — one put the section name and its verb in a sticky
 * band, the other teleported both into the app bar through `PageChrome`, and
 * Branding and Templates managed to use the management shell from inside a
 * `/preferences` route, so the rail changed out from under you mid-surface.
 * `PreferencesShell` now calls this, and both keep their own exported name so
 * no call site had to move.
 *
 * ## Why the band is gone
 *
 * Rule 4. A title is followed by its rule and then its content; a strip under
 * the heading repeating facts the fields already carry is a band spent on
 * nothing. The section's name and its one verb moved into the record header,
 * where the thing they act on is. `PageChrome` is gone for the same reason —
 * there is no app bar under the surface, so a title registered into it is a title
 * drawn behind a scrim.
 *
 * ## Why it is a page
 *
 * Management is a full-page takeover (design/core-modules/spec/shell.md):
 * `AppShell` renders these routes bare (`isSettingsSurfacePath`), so the
 * surface is the only UI on screen, and leaving it (Back, Close or Esc)
 * navigates to the workspace's landing screen.
 *
 * Presentation only: no query, no mutation and no gate lives here. The rail's
 * entries arrive already filtered by the same two predicates that guarded
 * them before, and every route still gates itself on the server exactly as it
 * did.
 */
export function SettingsFrame({
  children,
  title,
  actions,
  railCounts,
}: SettingsFrameProps) {
  // The figures this page has already loaded ride on its rows in the sidebar.
  const setCounts = useShellNavIfAny()?.setManagementCounts;
  const countsKey = railCounts ? JSON.stringify(railCounts) : "";
  React.useEffect(() => {
    if (!setCounts || !countsKey) return;
    setCounts(JSON.parse(countsKey) as Record<string, number>);
  }, [countsKey, setCounts]);

  /*
    Management is the sidebar's one sanctioned swap (Mgmt-Users.dc.html): the
    shell draws Management's tree where the sidebar was and the app bar over
    the page, so this draws the page column alone. Leaving is the sidebar's
    row back to the workspace. The surface still marks its paint scope, which
    every settings control reads its tokens from.
  */
  return (
    <SettingsSurface open onOpenChange={noop} rail={null} className={embeddedClass}>
      <SettingsContent title={title} actions={actions}>
        {children}
      </SettingsContent>
    </SettingsSurface>
  );
}

const noop = () => {};

/**
 * The surface's second grid child.
 *
 * A register manages its own two scrollers, so it is handed the row whole. A
 * form page has one column and no scroller of its own, so the row scrolls for
 * it. Both cases need the row bounded, which is what `min-h-0` buys.
 */
function SettingsContent({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  /* `some`, not "the only child": a converted page is routinely a register
     beside a `Sheet` or a `Dialog` that creates the record. Those portal out
     and occupy no row, so what decides is whether the screen itself is one of
     the two layouts that draw their own header and own their own scrolling. */
  const drawsOwnChrome = React.Children.toArray(children).some(
    (child) =>
      React.isValidElement(child) &&
      (child.type === RegisterLayout || child.type === FormPage || child.type === KitPage || child.type === OwnsChrome),
  );

  return (
    <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-y-auto max-[1099px]:block max-[1099px]:overflow-visible">
      {drawsOwnChrome ? (
        children
      ) : (
        /* The record column's own padding, for a page still composing its
           body itself. `title` becomes a real record header rather than the
           band it used to be, so an unconverted page reads the same way a
           converted one does. */
        <div style={{ padding: "24px 40px 40px" }}>
          {title ? <RecordHeader title={title} action={actions} /> : null}
          {children}
        </div>
      )}
    </div>
  );
}

export type ManagementShellProps = {
  /** The fallback title line. A converted page puts its own `RecordHeader` in `children` instead. */
  title?: string;
  /** The fallback title line's verb. */
  actions?: React.ReactNode;
  railCounts?: Record<string, number>;
  railAttention?: string[];
  children: React.ReactNode;
};

/**
 * The management entry point into the surface. See {@link SettingsFrame}.
 *
 * It used to carry `area` and `description` as well. Neither was read: the
 * rail is the whole surface's and is not scoped to an area, and rule 1
 * deleted the descriptions. A prop that is declared, passed and never read is
 * a prop the next reader has to go and check, so both are gone from the type
 * and from the call sites that were still handing them over.
 */
export function ManagementShell(props: ManagementShellProps) {
  return (
    <SettingsFrame
      title={props.title}
      actions={props.actions}
      railCounts={props.railCounts}
      railAttention={props.railAttention}
    >
      {props.children}
    </SettingsFrame>
  );
}
