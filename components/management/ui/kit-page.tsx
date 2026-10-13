"use client";

import * as React from "react";

import { Kit, KitScreen } from "@/components/core";

/**
 * A Management page drawn in the core modules kit (design/core-modules): the
 * top bar with the page's mark and title and its actions, then the page
 * itself, which scrolls on its own. The surface hands it the content column
 * whole, as it does a register or a form page.
 */
export function KitPage({
  screen,
  title,
  mark,
  actions,
  width = 1040,
  children,
}: {
  /** The kit screen whose own styles it takes (`.sc-<slug>`), when it is one of the 18. */
  screen?: string;
  title: React.ReactNode;
  /** The 16px mark before the title. */
  mark?: React.ReactNode;
  actions?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}) {
  const body = (
    <section className="mn">
      <header className="tb-m">
        <h1>
          {mark}
          {title}
        </h1>
        {actions ? <div className="tb-r">{actions}</div> : null}
      </header>
      <div className="page" style={{ maxWidth: width }}>
        {children}
      </div>
    </section>
  );
  return <Kit className="kit-col">{screen ? <KitScreen slug={screen}>{body}</KitScreen> : body}</Kit>;
}

/**
 * Marks content that draws its own chrome and owns its scrolling when the
 * page is not a `KitPage` itself: a view that renders one, or its loading
 * state. The surface hands it the content column whole.
 */
export function OwnsChrome({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
