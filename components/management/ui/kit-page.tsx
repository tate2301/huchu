"use client";

import * as React from "react";

import { Kit, KitScreen } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";

/**
 * A Management page drawn in the core modules kit (design/core-modules): the
 * title, mark and actions live in the app bar, not a second title row. The
 * page scrolls on its own. The surface hands it the content column
 * whole, as it does a register or a form page.
 */
export function KitPage({
  screen,
  title,
  mark,
  actions,
  width = 1040,
  flush = false,
  children,
}: {
  /** The kit screen whose own styles it takes (`.sc-<slug>`), when it is one of the 18. */
  screen?: string;
  title: string;
  /** The 16px mark before the title. */
  mark?: React.ReactNode;
  actions?: React.ReactNode;
  width?: number;
  /** A list page: tools, finding and lists edge to edge, with no settings column. */
  flush?: boolean;
  children: React.ReactNode;
}) {
  const body = (
    <section className="mn">
      <PageChrome title={title} icon={mark}>
        {actions ? <Kit contents>{actions}</Kit> : null}
      </PageChrome>
      {flush ? (
        children
      ) : (
        <div className="page" style={{ maxWidth: width }}>
          {children}
        </div>
      )}
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
