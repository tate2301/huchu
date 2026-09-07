"use client";

import * as React from "react";

import type { LucideIcon } from "../lib/icons";

/**
 * What the top app bar should say this page is.
 *
 * The bar used to carry a breadcrumb trail, which spent its width restating
 * the sidebar — the section you are in is already lit up over there. The page
 * title and its icon are the one thing the bar could say that nothing else on
 * screen does, so that is what it says now, and the page stops repeating it in
 * its own body.
 */
export type PageIdentity = {
  title: string;
  icon?: LucideIcon;
  /**
   * Where "up" is, for a page that sits under a list. Rendered in the bar
   * immediately before the title, because that is where the page's name is —
   * a back link stranded in the body is a second header in a different place.
   */
  back?: { href: string; label: string };
};

type PageChromeContextValue = {
  actions: React.ReactNode;
  setActions: (actions: React.ReactNode) => void;
  identity: PageIdentity | null;
  setIdentity: (identity: PageIdentity | null) => void;
};

const PageChromeContext = React.createContext<PageChromeContextValue | null>(null);

function PageChromeProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = React.useState<React.ReactNode>(null);
  const [identity, setIdentity] = React.useState<PageIdentity | null>(null);

  const value = React.useMemo(
    () => ({ actions, setActions, identity, setIdentity }),
    [actions, identity],
  );

  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>;
}

function usePageChrome() {
  const context = React.useContext(PageChromeContext);
  if (!context) {
    throw new Error("usePageChrome must be used within PageChromeProvider");
  }
  return context;
}

/**
 * Registers this page's title, icon and actions with the top app bar.
 *
 * Renders nothing. Children are the page's actions — pass the buttons that
 * would once have sat in a page header and they appear in the bar next to
 * search and notifications.
 *
 * The icon is optional and usually left off: the bar falls back to the icon
 * the sidebar already shows for this route, which is the one people are
 * looking for. Pass one only where the route has no nav entry — a record page
 * under a list, say. It cannot be passed from a Server Component, because an
 * icon is a function; register from a client component when you need it.
 *
 * Safe to render on every page render even though `children` is a fresh
 * element each time: `AppShell` receives the page as a `children` prop from a
 * server layout, so its element identity survives the provider's re-render and
 * React bails out of re-rendering the page subtree. Break that and this turns
 * into a render loop.
 */
function PageChrome({
  title,
  icon,
  backHref,
  backLabel,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  /** Where "up" goes. Both this and `backLabel` are needed for a back link. */
  backHref?: string;
  backLabel?: string;
  /** The page's actions, rendered in the top app bar. */
  children?: React.ReactNode;
}) {
  const { setActions, setIdentity } = usePageChrome();

  React.useEffect(() => {
    setIdentity({
      title,
      icon,
      back: backHref && backLabel ? { href: backHref, label: backLabel } : undefined,
    });
    return () => setIdentity(null);
  }, [title, icon, backHref, backLabel, setIdentity]);

  React.useEffect(() => {
    // Left undefined, this component is only claiming the title — some other
    // component on the page owns the actions, and clearing them here would
    // race it.
    if (children === undefined) return;
    setActions(children);
    return () => setActions(null);
  }, [children, setActions]);

  return null;
}

/** Actions only, for pages whose title still comes from the route table. */
function PageActions({ children }: { children: React.ReactNode }) {
  const { setActions } = usePageChrome();

  React.useEffect(() => {
    setActions(children);
    return () => setActions(null);
  }, [children, setActions]);

  return null;
}

export { PageChromeProvider, PageChrome, PageActions, usePageChrome };
