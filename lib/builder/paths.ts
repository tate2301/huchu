/**
 * The builders take the page over (spec/shell.md, "The builder"): a report's
 * builder keeps the rail and gives the module panel's and the top bar's room
 * to its outline and its bar; arranging a report's page is the whole window,
 * its bar across the top, as the boards draw them.
 */
export type BuilderSurface = "rail" | "full";

const RAIL: RegExp[] = [/^\/reports\/c\/[^/]+\/edit\/?$/];
const FULL: RegExp[] = [/^\/reports\/(?!c\/|custom\/|built\/|insights\/)[^/]+\/arrange\/?$/];

/** Which builder surface a path is, or null for a page in the shell. */
export function builderSurface(pathname: string): BuilderSurface | null {
  if (RAIL.some((pattern) => pattern.test(pathname))) return "rail";
  if (FULL.some((pattern) => pattern.test(pathname))) return "full";
  return null;
}
