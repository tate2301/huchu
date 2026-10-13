import { z } from "zod";

import { hasRole } from "@/lib/roles";

/**
 * Saved views (design/core-modules/spec/routes.md §0): a page's address kept
 * under a name in its module's panel. Pure: what a view is, how its address is
 * read and written, and who may change it. The store is `./store.ts`.
 */

/** A saved view as the panel is told about it. */
export type SavedViewRecord = {
  id: string;
  path: string;
  name: string;
  query: string;
  /** Everyone in the workspace sees it ("shared"); otherwise only whoever saved it ("you"). */
  isShared: boolean;
  /** Saved by the person asking. */
  mine: boolean;
  /** The person asking may rename or delete it. */
  canChange: boolean;
};

/** Roles that may rename or delete a view somebody else shared. */
export const SAVED_VIEW_MANAGER_ROLES = ["SUPERADMIN", "MANAGER"] as const;

const MAX_PATH = 300;
const MAX_QUERY = 2000;

/**
 * A page's address without its query or hash: `/books/invoices`. Null for
 * anything that is not a path inside the app.
 */
export function viewPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const path = raw.split(/[?#]/)[0]?.trim() ?? "";
  if (!path.startsWith("/") || path.startsWith("//") || path.length > MAX_PATH) return null;
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/**
 * The query string a view keeps: without the `?`, without empty values, and
 * without the address's one-off parts (an open sheet or drawer, a page number)
 * so the view opens on the list rather than on whatever was open when it was
 * saved.
 */
const TRANSIENT = new Set(["sheet", "drawer", "action", "page"]);

export function viewQuery(raw: string | null | undefined): string {
  const params = new URLSearchParams((raw ?? "").replace(/^\?/, ""));
  const kept = new URLSearchParams();
  for (const [key, value] of params) {
    if (!value || TRANSIENT.has(key)) continue;
    kept.append(key, value);
  }
  return kept.toString().slice(0, MAX_QUERY);
}

/** Where a view opens: its page with its query. */
export function viewHref(view: Pick<SavedViewRecord, "path" | "query">): string {
  return view.query ? `${view.path}?${view.query}` : view.path;
}

/** The view that is the address being looked at, if one is. */
export function currentView<T extends Pick<SavedViewRecord, "path" | "query">>(
  views: readonly T[],
  path: string,
  search: string,
): T | null {
  const query = viewQuery(search);
  return views.find((view) => view.path === path && view.query === query) ?? null;
}

/** Whoever saved it; a manager, once it is shared. */
export function canChangeView(
  view: { createdById: string; isShared: boolean },
  person: { id: string; role: string | null | undefined },
): boolean {
  if (view.createdById === person.id) return true;
  return view.isShared && hasRole(person.role, [...SAVED_VIEW_MANAGER_ROLES]);
}

/** Yours first, then the shared ones, each A to Z. */
export function orderViews<T extends Pick<SavedViewRecord, "name" | "mine">>(views: readonly T[]): T[] {
  return [...views].sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name, "en-GB"));
}

const name = z.string().trim().min(1, "Give the view a name").max(120, "Keep the name under 120 characters");

export const savedViewInputSchema = z.object({
  name,
  /** The address being looked at, query and all: `/books/invoices?show=overdue`. */
  href: z.string().min(1).max(MAX_PATH + MAX_QUERY + 1),
  isShared: z.boolean().default(false),
});

export const savedViewPatchSchema = z.object({ name });
