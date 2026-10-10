import type { NavSection } from "@/lib/navigation";

/** The query of the page being looked at; `URLSearchParams` or Next's read-only one. */
export type QueryLike = { get(name: string): string | null };

/**
 * Whether a nav item stands for this page.
 *
 * A plain item matches its path and anything under it. An item with a query
 * (`/retail/reports?area=selling`) matches its path exactly **and** every
 * param it names (00-foundations 5.3.3).
 */
export function matchesNavHref(href: string, pathname: string, query: QueryLike | null, exact = false) {
  if (href === "/") return pathname === "/";
  const [path, search] = href.split("?");
  if (!search) return pathname === path || (!exact && pathname.startsWith(`${path}/`));
  if (pathname !== path) return false;
  for (const [name, value] of new URLSearchParams(search)) {
    if (query?.get(name) !== value) return false;
  }
  return true;
}

/** What matching needs of a nav item. */
export type NavTarget = { href: string; exact?: boolean };

/**
 * The href that stands for this page: the longest matching path, an item
 * with a query beating the plain one on the same path.
 */
export function bestNavHref(targets: Iterable<NavTarget>, pathname: string, query: QueryLike | null) {
  let best: { href: string; score: number } | null = null;
  for (const { href, exact } of targets) {
    if (!matchesNavHref(href, pathname, query, exact)) continue;
    const [path, search] = href.split("?");
    const score = path.length + (search ? 1000 : 0);
    if (!best || score > best.score) best = { href, score };
  }
  return best?.href ?? null;
}

/**
 * The current item among the ones this person sees.
 *
 * `known` are destinations that exist but may be hidden from them (another
 * role's page, a module item the tenant cannot use yet). When one of those is
 * the better match, the page is that item's and nothing visible is current:
 * a manager on Insights › Money is not on Overview because `/retail` happens
 * to be a prefix of the path.
 */
export function getActiveNavHref(
  sections: NavSection[],
  pathname: string,
  query: QueryLike | null,
  known: Iterable<NavTarget> = [],
) {
  const items = sections.flatMap((section) => section.items);
  const visible = new Set(items.map((item) => item.href));
  const best = bestNavHref([...items, ...known], pathname, query);
  return best && visible.has(best) ? best : null;
}
