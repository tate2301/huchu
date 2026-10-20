import type { ComposedGroup, ComposedNode } from "./compose";

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
};

export const NO_PREFS: NavPrefs = { pinned: [], hidden: [], folded: [], opened: [] };

export type ArrangedNav = {
  pinned: ComposedNode[];
  groups: ComposedGroup[];
  more: ComposedNode[];
};

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/** Reads what storage held; anything that is not the shape is dropped. */
export function parsePrefs(raw: string | null): NavPrefs {
  if (!raw) return NO_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof NavPrefs, unknown>>;
    return { pinned: list(value.pinned), hidden: list(value.hidden), folded: list(value.folded), opened: list(value.opened) };
  } catch {
    return NO_PREFS;
  }
}

/** Adds or removes an id from one of the lists. */
export function toggled(prefs: NavPrefs, key: keyof NavPrefs, id: string): NavPrefs {
  const has = prefs[key].includes(id);
  const next = has ? prefs[key].filter((entry) => entry !== id) : [...prefs[key], id];
  // A node cannot be both pinned and in More.
  if (key === "pinned" && !has) return { ...prefs, pinned: next, hidden: prefs.hidden.filter((entry) => entry !== id) };
  if (key === "hidden" && !has) return { ...prefs, hidden: next, pinned: prefs.pinned.filter((entry) => entry !== id) };
  return { ...prefs, [key]: next };
}

/**
 * The composed sidebar as this person arranged it: pinned nodes lifted into
 * their own list, hidden ones gathered into More, the rest in their groups.
 * The page being looked at is never hidden, so the sidebar always shows where
 * the person is.
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
    for (const node of group.items) {
      if (pinnedIds.has(node.id)) continue;
      if (isHidden(node.id)) more.push(node);
      else items.push(node);
    }
    if (items.length > 0) rest.push({ ...group, items });
  }
  return { pinned, groups: rest, more };
}
