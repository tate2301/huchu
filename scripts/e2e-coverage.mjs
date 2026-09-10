/**
 * How much of the app the e2e suite actually reaches.
 *
 *   node scripts/e2e-coverage.mjs            # pages, by cluster
 *   node scripts/e2e-coverage.mjs --gaps     # every uncovered page
 *   node scripts/e2e-coverage.mjs --api      # API routes, from a recorded run
 *   node scripts/e2e-coverage.mjs --components   # components, by import reachability
 *   node scripts/e2e-coverage.mjs --json
 *
 * ## What counts as a covered page
 *
 * A page is covered when some spec under `e2e/` names a path that resolves to
 * it. Paths are read as string literals — `"/schools/students"`, and template
 * literals with an interpolation reduced to a wildcard, so
 * `` `/crm/deals/${id}` `` covers `/crm/deals/[id]`.
 *
 * This is deliberately a *reachability* measure, not an assertion-quality one.
 * It answers "is there any spec that would notice if this page started
 * throwing", which is the question the coverage gaps were raised against. A
 * route with a `sweepTests` entry gets a real health check; a route that only
 * appears in a screenshot spec gets less. Both count here, and the difference
 * is the reason `sweepTests` exists.
 *
 * Route groups — `(shell)` — are stripped, because they are a filesystem
 * device and not part of any URL. Getting that wrong understates portal
 * coverage badly: every parent, student and teacher portal page lives in one.
 *
 * ## API routes are counted differently, and have to be
 *
 * Nothing in `e2e/` names an API path — the pages call them. So `--api` is a
 * *dynamic* measure: `e2e/_support/api-coverage.ts` appends every `/api/**`
 * request the browser makes to `e2e-coverage/api-hits.log` while the suite
 * runs, and this reads that back. It reports what the last recorded run
 * touched rather than what the suite could touch, and it says nothing at all
 * until a run has happened. That is the right shape for the question: an
 * endpoint no page calls during a full sweep is untested however many specs
 * exist.
 *
 * ## And components a third way again
 *
 * Nothing names a component and nothing requests one over the wire — a
 * component is reached by being *imported*. So `--components` walks the import
 * graph out from every covered page and its layouts. Read that as a ceiling:
 * "imported by a page some spec visits" is a much weaker claim than
 * "exercised", and the gap between the two is exactly the gap between a route
 * sweep and an interaction test.
 */

import { globSync, readFileSync } from "node:fs";

const pages = globSync("app/**/page.tsx")
  .map((file) =>
    file
      .replaceAll("\\", "/")
      .replace(/^app/, "")
      .replace(/\/page\.tsx$/, "")
      // Route groups are filesystem-only: /portal/parent/(shell)/fees is /portal/parent/fees.
      .replace(/\/\([^)]+\)/g, ""),
  )
  .map((route) => route || "/")
  .sort();

const specs = globSync("e2e/**/*.ts").filter((file) => !file.includes(".worktrees"));

/** Every path literal any spec mentions, with interpolations widened to `*`. */
const mentioned = new Set();
for (const file of specs) {
  const source = readFileSync(file, "utf8");
  for (const [, path] of source.matchAll(/["'`](\/[A-Za-z0-9_\-/[\]${}.*]*)["'`]/g)) {
    mentioned.add(path.replace(/\$\{[^}]*\}/g, "*").replace(/\/+$/, "") || "/");
  }
}

/** A page is hit if some mentioned path matches it segment for segment. */
function matchesPage(mention, page) {
  const a = mention.split("/");
  const b = page.split("/");
  if (a.length !== b.length) return false;
  return b.every((segment, index) => {
    const other = a[index];
    if (segment.startsWith("[")) return true; // dynamic page: any value reaches it
    if (other === "*") return true; // interpolated mention
    return segment === other;
  });
}

const covered = new Set();
for (const page of pages) {
  for (const mention of mentioned) {
    if (matchesPage(mention, page)) {
      covered.add(page);
      break;
    }
  }
}

/** Cluster by the first segment — or the first two, where that is the module. */
function clusterOf(route) {
  const parts = route.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  if (parts[0] === "portal" || parts[0] === "management" || parts[0] === "preferences") {
    return `/${parts.slice(0, 2).join("/")}`;
  }
  return `/${parts[0]}`;
}

const clusters = new Map();
for (const page of pages) {
  const key = clusterOf(page);
  const entry = clusters.get(key) ?? { total: 0, covered: 0, gaps: [] };
  entry.total += 1;
  if (covered.has(page)) entry.covered += 1;
  else entry.gaps.push(page);
  clusters.set(key, entry);
}

const rows = [...clusters].sort(
  (a, b) => b[1].gaps.length - a[1].gaps.length || a[0].localeCompare(b[0]),
);

if (process.argv.includes("--api")) {
  reportApi();
} else if (process.argv.includes("--components")) {
  reportComponents();
} else if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      { total: pages.length, covered: covered.size, clusters: Object.fromEntries(rows) },
      null,
      2,
    ),
  );
} else {
  const percent = ((covered.size / pages.length) * 100).toFixed(0);
  console.log(`${covered.size} of ${pages.length} pages covered (${percent}%)`);
  console.log("");
  console.log("cluster                      covered  total    gap");
  for (const [name, entry] of rows) {
    console.log(
      `${name.padEnd(28)} ${String(entry.covered).padStart(7)} ` +
        `${String(entry.total).padStart(6)} ${String(entry.gaps.length).padStart(6)}`,
    );
  }
  if (process.argv.includes("--gaps")) {
    console.log("");
    console.log("--- uncovered ---");
    for (const [name, entry] of rows) {
      if (entry.gaps.length === 0) continue;
      console.log("");
      console.log(`${name} (${entry.gaps.length})`);
      for (const gap of entry.gaps) console.log(`  ${gap}`);
    }
  }
}

/* ── API routes ───────────────────────────────────────────────────────── */

function reportApi() {
  const routes = globSync("app/api/**/route.ts")
    .map((file) => file.replaceAll("\\", "/").replace(/^app/, "").replace(/\/route\.ts$/, ""))
    .sort();

  let called;
  try {
    /*
      Split on whitespace and keep the paths. Each line is "GET /api/…", so
      the method falls out on its own — and a torn line from a worker that
      died mid-write leaves a fragment that simply does not start with /api/.
    */
    called = readFileSync("e2e-coverage/api-hits.log", "utf8")
      .split(/\s+/)
      .filter((token) => token.startsWith("/api/"));
  } catch {
    console.log("No e2e-coverage/api-hits.log yet — run the suite once so it can be recorded.");
    return;
  }

  const seen = new Set(called);
  const hit = new Set();
  for (const route of routes) {
    for (const path of seen) {
      if (matchesApi(path, route)) {
        hit.add(route);
        break;
      }
    }
  }

  const misses = routes.filter((route) => !hit.has(route));
  const percent = ((hit.size / routes.length) * 100).toFixed(0);
  console.log(
    `${hit.size} of ${routes.length} API routes called (${percent}%), ` +
      `over ${called.length} recorded requests`,
  );
  console.log("");

  const byGroup = new Map();
  for (const route of misses) {
    const key = route.split("/").slice(0, 4).join("/");
    byGroup.set(key, (byGroup.get(key) ?? 0) + 1);
  }
  console.log("uncalled, by group");
  for (const [group, count] of [...byGroup].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${group}`);
  }

  if (process.argv.includes("--gaps")) {
    console.log("");
    console.log("--- uncalled ---");
    for (const route of misses) console.log(`  ${route}`);
  }
}

/** Same segment-for-segment match as pages, with catch-all segments added. */
function matchesApi(called, route) {
  const a = called.split("/");
  const b = route.split("/");
  for (let index = 0; index < b.length; index += 1) {
    const segment = b[index];
    // A catch-all swallows every remaining segment, including none of them.
    if (segment.startsWith("[...") || segment.startsWith("[[...")) return true;
    if (index >= a.length) return false;
    if (segment.startsWith("[")) continue; // dynamic: any value
    if (segment !== a[index]) return false;
  }
  return a.length === b.length;
}

/* ── Components ───────────────────────────────────────────────────────── */

/**
 * Which components a covered page can reach, following imports.
 *
 * Neither of the other two measures works here. Nothing names a component the
 * way a spec names a path, and nothing requests one over the wire the way a
 * page requests an endpoint — a component is reached by being imported.
 *
 * So this walks the import graph from every covered page (and the layouts
 * above it) and counts what it arrives at under `components/`.
 *
 * ## Read it as a ceiling, not as coverage
 *
 * "Imported by a page some spec visits" is a much weaker claim than "exercised".
 * A dialog behind a button nobody clicks, a tab nobody opens, an error state
 * nothing provokes — all are imported, all count here, and none is tested. The
 * number says where the suite *cannot* reach; it does not promise that what it
 * can reach it actually exercises.
 *
 * The gap between this and the truth is exactly the gap between a route sweep
 * and an interaction test, and it is the same gap the API measure shows between
 * its GET and mutation rows.
 */
function reportComponents() {
  const EXT = [".tsx", ".ts", "/index.tsx", "/index.ts", ".jsx", ".js"];

  const resolve = (spec, fromFile) => {
    let base;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) {
      const dir = fromFile.split("/").slice(0, -1);
      for (const part of spec.split("/")) {
        if (part === ".") continue;
        else if (part === "..") dir.pop();
        else dir.push(part);
      }
      base = dir.join("/");
    } else return null; // a package, not ours
    for (const ext of EXT) {
      const candidate = base.endsWith(ext) ? base : base + ext;
      if (sourceOf(candidate) !== null) return candidate;
    }
    return null;
  };

  const cache = new Map();
  function sourceOf(file) {
    if (cache.has(file)) return cache.get(file);
    let text = null;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      text = null;
    }
    cache.set(file, text);
    return text;
  }

  const importsOf = (file) => {
    const text = sourceOf(file);
    if (text === null) return [];
    const specs = [];
    // `import … from "x"`, `export … from "x"`, and `import("x")`.
    for (const [, spec] of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const resolved = resolve(spec, file);
      if (resolved) specs.push(resolved);
    }
    return specs;
  };

  /*
    The route the meter reports has route groups stripped, so it no longer
    matches a directory. Map each back to the file it came from.
  */
  const fileForRoute = new Map();
  for (const file of globSync("app/**/page.tsx")) {
    const normalized = file.replaceAll("\\", "/");
    const route =
      normalized.replace(/^app/, "").replace(/\/page\.tsx$/, "").replace(/\/\([^)]+\)/g, "") || "/";
    if (!fileForRoute.has(route)) fileForRoute.set(route, normalized);
  }

  const reach = (routes) => {
    const seen = new Set();
    const queue = [];
    for (const route of routes) {
      const pageFile = fileForRoute.get(route);
      if (!pageFile) continue;
      const dir = pageFile.replace(/\/page\.tsx$/, "");
      queue.push(pageFile);
      const parts = dir.split("/");
      for (let index = parts.length; index >= 1; index -= 1) {
        const layout = `${parts.slice(0, index).join("/")}/layout.tsx`;
        if (sourceOf(layout) !== null) queue.push(layout);
      }
    }
    while (queue.length > 0) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      for (const next of importsOf(file)) if (!seen.has(next)) queue.push(next);
    }
    return seen;
  };

  /*
    Colocated unit tests are not components. Seven `*.test.tsx` files live
    beside the components they test, and counting them made the "reached by no
    page" list read as seven more dead components than there are — a test file
    is *supposed* to be unreachable from a route.
  */
  const components = globSync("components/**/*.tsx")
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => !/\.(test|spec)\.tsx$/.test(f));
  const fromCovered = reach([...covered]);
  const fromAll = reach(pages);

  const reachable = components.filter((c) => fromCovered.has(c));
  const reachableAtAll = components.filter((c) => fromAll.has(c));
  const orphans = components.filter((c) => !fromAll.has(c));

  const pct = (n) => `${((n / components.length) * 100).toFixed(0)}%`;
  console.log(`${components.length} components under components/`);
  console.log("");
  console.log(`  reachable from a COVERED page   ${String(reachable.length).padStart(4)}  ${pct(reachable.length)}`);
  console.log(`  reachable from ANY page         ${String(reachableAtAll.length).padStart(4)}  ${pct(reachableAtAll.length)}`);
  console.log(`  reached by no page at all       ${String(orphans.length).padStart(4)}  ${pct(orphans.length)}`);
  console.log("");
  console.log("Read the first row as a ceiling. 'Imported by a page a spec visits' is");
  console.log("weaker than 'exercised': a dialog behind an unclicked button counts here");
  console.log("and is not tested. The third row is the more actionable number — those");
  console.log("components are unreachable from any route, so they are dead, lazy-loaded");
  console.log("outside the import graph, or used only by another orphan.");

  if (process.argv.includes("--gaps")) {
    console.log("");
    console.log("--- reached by no page ---");
    for (const orphan of orphans) console.log(`  ${orphan}`);
  }
}
