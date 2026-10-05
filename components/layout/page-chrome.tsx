"use client";

import * as React from "react";

/**
 * What the page header says this page is (00-foundations 5.3.5).
 *
 * Back link, title, then a record's reference or a list's sub and sub link.
 * A page that sets none is named by its nav item.
 */
export type PageIdentity = {
  title: string;
  back?: { href: string; label: string };
  /** A record's reference — `PO-0003`, `SH-00242` — in mono after its name. */
  reference?: string | null;
  /** A list's one-line explanation, in `--ink-3`. */
  sub?: string | null;
  /** A link after the sub ("Edit the rules"). */
  subLink?: { href: string; label: string } | null;
};

/**
 * The page's one primary action, at the right of the header. A create action
 * carries the plus; a record verb does not. It goes to `href`, opens the sheet
 * `?sheet=<kind>` over this page, or runs `onClick`.
 */
export type PagePrimary = {
  label: string;
  icon?: "plus";
  href?: string;
  sheet?: string;
  onClick?: () => void;
};

type PageChromeContextValue = {
  actions: React.ReactNode;
  setActions: (actions: React.ReactNode) => void;
  identity: PageIdentity | null;
  setIdentity: (identity: PageIdentity | null) => void;
  primary: PagePrimary | null;
  setPrimary: (primary: PagePrimary | null) => void;
};

const PageChromeContext = React.createContext<PageChromeContextValue | null>(null);

function PageChromeProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = React.useState<React.ReactNode>(null);
  const [identity, setIdentity] = React.useState<PageIdentity | null>(null);
  const [primary, setPrimary] = React.useState<PagePrimary | null>(null);

  const value = React.useMemo(
    () => ({ actions, setActions, identity, setIdentity, primary, setPrimary }),
    [actions, identity, primary],
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
 * Registers this page's identity, actions and primary with the page header.
 *
 * Renders nothing. Children are the page's own controls (a record's action
 * group and ⋯, a dashboard's Export); `primary` is its one orange button.
 *
 * Safe to render on every page render even though `children` is a fresh
 * element each time: `AppShell` receives the page as a `children` prop from a
 * server layout, so its element identity survives the provider's re-render and
 * React bails out of re-rendering the page subtree. Break that and this turns
 * into a render loop.
 */
function PageChrome({
  title,
  reference,
  backHref,
  backLabel,
  sub,
  subLink,
  primary,
  children,
}: {
  title: string;
  reference?: string | null;
  /** Where "up" goes. Both this and `backLabel` are needed for a back link. */
  backHref?: string;
  backLabel?: string;
  sub?: string | null;
  subLink?: { href: string; label: string } | null;
  primary?: PagePrimary | null;
  /** The page's actions, rendered in the header. */
  children?: React.ReactNode;
}) {
  const { setActions, setIdentity, setPrimary } = usePageChrome();
  const subLinkHref = subLink?.href;
  const subLinkLabel = subLink?.label;

  React.useEffect(() => {
    setIdentity({
      title,
      reference,
      sub,
      subLink: subLinkHref && subLinkLabel ? { href: subLinkHref, label: subLinkLabel } : null,
      back: backHref && backLabel ? { href: backHref, label: backLabel } : undefined,
    });
    return () => setIdentity(null);
  }, [title, reference, sub, subLinkHref, subLinkLabel, backHref, backLabel, setIdentity]);

  React.useEffect(() => {
    // Left undefined, this component is only claiming the title — some other
    // component on the page owns the actions, and clearing them here would
    // race it.
    if (children === undefined) return;
    setActions(children);
    return () => setActions(null);
  }, [children, setActions]);

  React.useEffect(() => {
    if (primary === undefined) return;
    setPrimary(primary);
    return () => setPrimary(null);
  }, [primary, setPrimary]);

  return null;
}

/** Actions only, for pages whose title still comes from the nav. */
function PageActions({ children }: { children: React.ReactNode }) {
  const { setActions } = usePageChrome();

  React.useEffect(() => {
    setActions(children);
    return () => setActions(null);
  }, [children, setActions]);

  return null;
}

export { PageChromeProvider, PageChrome, PageActions, usePageChrome };
