"use client";

import { Refusal } from "@/components/list-frame/list-states";
import { useShellNav } from "@/components/layout/shell-nav";

/** Where this person's workspace starts, named as its nav item is: "Back to Shifts". */
export function useHomeLink(): { href: string; label: string } {
  const nav = useShellNav();
  const home = [...nav.rail.areas, ...(nav.rail.management ? [nav.rail.management] : [])]
    .flatMap((area) => area.items)
    .find((item) => item.href === nav.homeHref);
  return { href: nav.homeHref, label: home?.label ?? "your start page" };
}

/**
 * What a retail page shows to a role its nav item does not admit
 * (00-foundations 5.3.4, 5.4.11): "Your role cannot view <the page>." and the
 * way back to where this person's workspace starts. The page's own server
 * refuses too; this keeps the page from drawing a table and buttons the
 * person cannot use.
 */
export function RoleRefusal() {
  const nav = useShellNav();
  const home = useHomeLink();
  return <Refusal noun={(nav.pageLabel ?? "this page").toLowerCase()} back={home} />;
}
