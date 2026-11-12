import type { ComposedGroup, ComposedNode } from "./compose";

/** A page that is not a registry node (a record, a saved view), kept in Pinned. */
export type PinnedPage = { href: string; label: string; icon?: string | null };

/** What a person has done to their own sidebar. Ids are registry ids. */
export type NavPrefs = {
  /** Nodes kept in Pinned, in the order they were pinned. */
  pinned: string[];
  /** Nodes moved into More. */
  hidden: string[];
  /** Groups drawn folded to their label. */
  folded: string[];
  /** Nodes drawn with their children open. */
  opened: string[];
  /** The person's own order inside a group, by group id. Pages they have not placed keep the registry's order after. */
  order: Record<string, string[]>;
  /** Records and views kept in Pinned, after the pinned nodes. */
  pages: PinnedPage[];
};

export type NavListKey = "pinned" | "hidden" | "folded" | "opened";

export const NO_PREFS: NavPrefs = { pinned: [], hidden: [], folded: [], opened: [], order: {}, pages: [] };

export type ArrangedNav = {
  pinned: ComposedNode[];
  pages: PinnedPage[];
  groups: ComposedGroup[];
  more: ComposedNode[];
};

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

function orders(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(value as Record<string, unknown>)) {
    const clean = list(ids);
    if (clean.length > 0) out[key] = clean;
  }
  return out;
}

function pages(value: unknown): PinnedPage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { href, label, icon } = entry as Record<string, unknown>;
    if (typeof href !== "string" || !href.startsWith("/") || typeof label !== "string" || !label) return [];
    return [{ href, label, icon: typeof icon === "string" ? icon : null }];
  });
}

/** Reads what storage held; anything that is not the shape is dropped. */
export function parsePrefs(raw: string | null): NavPrefs {
  if (!raw) return NO_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof NavPrefs, unknown>>;
    return {
      pinned: list(value.pinned),
      hidden: list(value.hidden),
      folded: list(value.folded),
      opened: list(value.opened),
      order: orders(value.order),
      pages: pages(value.pages),
    };
  } catch {
    return NO_PREFS;
  }
}

/** Adds or removes an id from one of the lists. */
export function toggled(prefs: NavPrefs, key: NavListKey, id: string): NavPrefs {
  const has = prefs[key].includes(id);
  const next = has ? prefs[key].filter((entry) => entry !== id) : [...prefs[key], id];
  // A node cannot be both pinned and in More.
  if (key === "pinned" && !has) return { ...prefs, pinned: next, hidden: prefs.hidden.filter((entry) => entry !== id) };
  if (key === "hidden" && !has) return { ...prefs, hidden: next, pinned: prefs.pinned.filter((entry) => entry !== id) };
  return { ...prefs, [key]: next };
}

/** Pins a record or a view, or takes it out of Pinned when it is there. */
export function toggledPage(prefs: NavPrefs, page: PinnedPage): NavPrefs {
  const has = prefs.pages.some((entry) => entry.href === page.href);
  return { ...prefs, pages: has ? prefs.pages.filter((entry) => entry.href !== page.href) : [...prefs.pages, page] };
}

/** The person's order for one group. */
export function reordered(prefs: NavPrefs, groupId: string, ids: string[]): NavPrefs {
  return { ...prefs, order: { ...prefs.order, [groupId]: ids } };
}

/** The workspace's order back: every group as the registry has it, nothing hidden. */
export function workspaceOrder(prefs: NavPrefs): NavPrefs {
  return { ...prefs, order: {}, hidden: [] };
}

/** A group's nodes in the person's order: the ones they placed first, the rest as the registry has them. */
export function inOrder(nodes: readonly ComposedNode[], order: readonly string[] | undefined): ComposedNode[] {
  if (!order || order.length === 0) return [...nodes];
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...nodes].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

/**
 * The composed sidebar as this person arranged it: their order inside each
 * group, pinned nodes lifted into their own list, hidden ones gathered into
 * More, the rest in their groups. The page being looked at is never hidden,
 * so the sidebar always shows where the person is.
 */
export function arrange(groups: ComposedGroup[], prefs: NavPrefs, activeNodeId: string | null): ArrangedNav {
  const byId = new Map<string, ComposedNode>();
  for (const group of groups) for (const node of group.items) byId.set(node.id, node);
  const pinned = prefs.pinned.map((id) => byId.get(id)).filter((node): node is ComposedNode => Boolean(node));
  const pinnedIds = new Set(pinned.map((node) => node.id));
  const isHidden = (id: string) => prefs.hidden.includes(id) && id !== activeNodeId;
  const more: ComposedNode[] = [];
  const rest: ComposedGroup[] = [];
  for (const group of groups) {
    const items: ComposedNode[] = [];
    for (const node of inOrder(group.items, prefs.order[group.id])) {
      if (pinnedIds.has(node.id)) continue;
      if (isHidden(node.id)) more.push(node);
      else items.push(node);
    }
    if (items.length > 0) rest.push({ ...group, items });
  }
  return { pinned, pages: prefs.pages, groups: rest, more };
}
