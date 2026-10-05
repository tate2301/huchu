import type { NavSection } from "@/lib/navigation";

/** The query of the page being looked at; `URLSearchParams` or Next's read-only one. */
type QueryLike = { get(name: string): string | null };

/**
 * Whether a nav item stands for this page.
 *
 * A plain item matches its path and anything under it. An item with a query
 * (`/retail/reports?area=selling`) matches its path exactly **and** every
 * param it names (00-foundations 5.3.3).
 */
export function matchesNavHref(href: string, pathname: string, query: QueryLike | null) {
  if (href === "/") return pathname === "/";
  const [path, search] = href.split("?");
  if (!search) return pathname === path || pathname.startsWith(`${path}/`);
  if (pathname !== path) return false;
  for (const [name, value] of new URLSearchParams(search)) {
    if (query?.get(name) !== value) return false;
  }
  return true;
}

/**
 * The current item: the longest matching path, an item with a query beating
 * the plain one on the same path.
 */
export function getActiveNavHref(sections: NavSection[], pathname: string, query: QueryLike | null) {
  let best: { href: string; score: number } | null = null;
  for (const item of sections.flatMap((section) => section.items)) {
    if (!matchesNavHref(item.href, pathname, query)) continue;
    const [path, search] = item.href.split("?");
    const score = path.length + (search ? 1000 : 0);
    if (!best || score > best.score) best = { href: item.href, score };
  }
  return best?.href ?? null;
}
