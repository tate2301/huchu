import {
  GROUP_LABEL,
  NAV_NODES,
  PRODUCT_GROUPS,
  SHARED_GROUP_ORDER,
  type NavGroupId,
  type NavKid,
  type NavNode,
} from "./registry";

/** `lock` is the plan's price where the workspace does not have the page: it shows once, locked, and opens what the plan adds. */
export type ComposedKid = NavKid & { href: string; lock?: string };
export type ComposedNode = Omit<NavNode, "kids"> & { href: string; kids: ComposedKid[]; lock?: string };
export type ComposedGroup = { id: NavGroupId; label: string; items: ComposedNode[] };

export type ComposeArgs = {
  /**
   * Whether this person may open an address: the workspace has the feature
   * for it and their role may reach it. The existing checks, asked of the
   * address (`gate.ts`). The server still refuses on its own; hiding a row is
   * never the check.
   */
  canOpen: (href: string) => boolean;
  /** The product groups the workspace runs, in the order it wants them. */
  products?: readonly NavGroupId[];
  /** A trade's own words for a node or a child, by id. */
  labels?: Record<string, string>;
  groupLabels?: Partial<Record<NavGroupId, string>>;
  nodes?: readonly NavNode[];
  /** The price of the plan a page needs, where the workspace is without it (`gate.ts`, Books' $10 and $99 pages). */
  lockOf?: (href: string) => string | undefined;
};

/** The first address a page has that this person may open, or null. */
function resolve(node: NavKid, canOpen: (href: string) => boolean): string | null {
  for (const candidate of node.live ?? [node.href]) {
    if (canOpen(candidate)) return candidate;
  }
  return null;
}

/**
 * The sidebar for one person: ordered groups, the nodes they may open, each
 * with the children they may open.
 *
 * Nothing is greyed out: a page the workspace has not bought, or the person
 * may not open, is not in the result. A parent shows when it opens or when
 * any child does. One visible child adds nothing, so the parent opens it and
 * the child is dropped. A group with nothing in it is dropped.
 */
export function composeNav({ canOpen, products = PRODUCT_GROUPS, labels = {}, groupLabels = {}, nodes = NAV_NODES, lockOf }: ComposeArgs): ComposedGroup[] {
  const order: NavGroupId[] = ["top", ...products.filter((id) => PRODUCT_GROUPS.includes(id)), ...SHARED_GROUP_ORDER];
  const groups: ComposedGroup[] = [];
  for (const id of order) {
    const items: ComposedNode[] = [];
    for (const node of nodes) {
      if (node.group !== id) continue;
      const kids: ComposedKid[] = [];
      for (const kid of node.kids ?? []) {
        const href = resolve(kid, canOpen);
        if (href) kids.push({ ...kid, href, label: labels[kid.id] ?? kid.label, lock: lockOf?.(href) });
      }
      const own = resolve(node, canOpen);
      if (!own && kids.length === 0) continue;
      const href = own ?? kids[0]!.href;
      // A level whose every page is locked is one locked row at its dearest price, not a folder of them.
      const every = kids.length > 0 && kids.every((kid) => kid.lock);
      const lock = every ? kids.map((kid) => kid.lock!).sort().at(-1) : kids.length === 0 ? lockOf?.(href) : undefined;
      items.push({ ...node, href, label: labels[node.id] ?? node.label, kids: kids.length > 1 && !every ? kids : [], lock });
    }
    if (items.length > 0) groups.push({ id, label: groupLabels[id] ?? GROUP_LABEL[id], items });
  }
  return groups;
}
