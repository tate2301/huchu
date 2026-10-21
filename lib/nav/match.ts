import { bestNavHref, type QueryLike } from "@/lib/nav-match";

import type { ComposedGroup } from "./compose";

export type ActiveNav = {
  nodeId: string;
  kidId: string | null;
  href: string;
  /** What the row says: the child's, when the page is a child. */
  label: string;
  /** The row's icon name (`NAV_ICONS`). */
  icon: string;
};

/**
 * The page being looked at, as a node and, when it is one, its child. Reuses
 * the shell's matcher (longest path wins, a query beats a plain path), with
 * children offered before their parent so a child that shares its parent's
 * address (All sales, under Sales) is the one that stands for the page.
 */
export function activeNav(groups: ComposedGroup[], pathname: string, query: QueryLike | null): ActiveNav | null {
  const targets: Array<{ href: string; nodeId: string; kidId: string | null; label: string; icon: string }> = [];
  for (const group of groups) {
    for (const node of group.items) {
      for (const kid of node.kids) targets.push({ href: kid.href, nodeId: node.id, kidId: kid.id, label: kid.label, icon: kid.icon });
      targets.push({ href: node.href, nodeId: node.id, kidId: null, label: node.label, icon: node.icon });
    }
  }
  const href = bestNavHref(targets, pathname, query);
  const hit = href ? targets.find((target) => target.href === href) : null;
  return hit ? { nodeId: hit.nodeId, kidId: hit.kidId, href: hit.href, label: hit.label, icon: hit.icon } : null;
}
