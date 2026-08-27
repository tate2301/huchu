/**
 * Module graph straight from source, classifying each import edge as
 * value (bundled + typechecked) or type-only (typechecked only).
 *
 * Value edges are what Turbopack walks to compile a route. Type-only edges
 * are erased by SWC but still cost `tsc`. The graphify graph merges the two,
 * which overstates compile closures, so we re-derive them here.
 *
 *   node modgraph.mjs closures [n]
 *   node modgraph.mjs cost <file>
 *   node modgraph.mjs why <src> <dst>
 *   node modgraph.mjs barrels [n]
 *   node modgraph.mjs clientboundary   # server-only code reachable from "use client"
 */
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const SKIP = new Set([
  "node_modules", ".next", ".git", ".worktrees", ".claude", ".codex", ".idea", ".vercel",
  "graphify-out", "scratch", "design", "public", "docs", "e2e",
]);
const EXTS = [".ts", ".tsx", ".mts", ".js", ".jsx"];

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue;
      walk(path.join(dir, e.name), acc);
    } else if (EXTS.some((x) => e.name.endsWith(x))) {
      acc.push(path.join(dir, e.name));
    }
  }
  return acc;
}

function rel(p) {
  return path.relative(REPO, p).split(path.sep).join("/");
}

function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = path.join(REPO, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // package
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
  for (const e of EXTS) {
    const idx = path.join(base, "index" + e);
    if (fs.existsSync(idx)) return idx;
  }
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  return null;
}

const files = walk(REPO);
const src = new Map();
for (const f of files) src.set(rel(f), fs.readFileSync(f, "utf8"));

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
const BARE_IMPORT_RE = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;
const DYNAMIC_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

const valueOut = new Map();   // file -> Set(file)  value imports
const typeOut = new Map();    // file -> Set(file)  type-only imports
const dynOut = new Map();
const pkgUse = new Map();     // package -> Set(file)
const isClient = new Set();
const isServerOnly = new Set();

const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };

for (const [f, text] of src) {
  const abs = path.join(REPO, f);
  if (/^\s*(["'])use client\1/m.test(text.slice(0, 400))) isClient.add(f);
  if (/from\s+["']@\/lib\/prisma["']|from\s+["']server-only["']/.test(text)) isServerOnly.add(f);

  for (const re of [IMPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const clause = m[1];
      const spec = m[2];
      const typeOnly = /^\s*type[\s{]/.test(clause) || (clause.trim().startsWith("{") && !/(^|[{,]\s*)(?!type\s)[A-Za-z_$]/.test(clause) );
      const isTypeKeyword = /^\s*type\b/.test(clause);
      const target = resolveSpec(spec, abs);
      if (!target) {
        const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        add(pkgUse, pkg, f);
        continue;
      }
      const t = rel(target);
      if (t === f) continue;
      if (isTypeKeyword) add(typeOut, f, t);
      else {
        // strip `type X` members; if every member was a type import, treat as type-only
        const inner = clause.match(/\{([\s\S]*)\}/);
        if (inner) {
          const members = inner[1].split(",").map((s) => s.trim()).filter(Boolean);
          const allType = members.length > 0 && members.every((s) => /^type\s/.test(s));
          const hasDefault = /^\s*[A-Za-z_$*]/.test(clause);
          if (allType && !hasDefault) { add(typeOut, f, t); continue; }
        }
        add(valueOut, f, t);
      }
    }
  }
  BARE_IMPORT_RE.lastIndex = 0;
  let b;
  while ((b = BARE_IMPORT_RE.exec(text))) {
    const target = resolveSpec(b[1], abs);
    if (target) add(valueOut, f, rel(target));
    else {
      const pkg = b[1].startsWith("@") ? b[1].split("/").slice(0, 2).join("/") : b[1].split("/")[0];
      add(pkgUse, pkg, f);
    }
  }
  DYNAMIC_RE.lastIndex = 0;
  let dm;
  while ((dm = DYNAMIC_RE.exec(text))) {
    const target = resolveSpec(dm[1], abs);
    if (target) add(dynOut, f, rel(target));
  }
}

const loc = new Map();
for (const [f, t] of src) loc.set(f, t.split("\n").length);

function closure(start, maps) {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    for (const m of maps) for (const n of m.get(cur) || []) if (!seen.has(n)) { seen.add(n); q.push(n); }
  }
  return seen;
}

const sumLoc = (s) => [...s].reduce((a, f) => a + (loc.get(f) || 0), 0);
const isRoute = (f) => f.startsWith("app/") && /\/(page|route|layout)\.tsx?$/.test(f);

const [, , cmd, a1, a2] = process.argv;

if (cmd === "closures") {
  const rows = [];
  for (const f of src.keys()) {
    if (!isRoute(f)) continue;
    const v = closure(f, [valueOut]);
    const all = closure(f, [valueOut, typeOut]);
    rows.push({ f, v: v.size, vloc: sumLoc(v), t: all.size, tloc: sumLoc(all) });
  }
  rows.sort((x, y) => y.vloc - x.vloc);
  console.log(`${rows.length} route entries`);
  console.log("value-mods  valueLOC   all-mods    allLOC  route");
  for (const r of rows.slice(0, Number(a1) || 30))
    console.log(String(r.v).padStart(10), String(r.vloc).padStart(9), String(r.t).padStart(10), String(r.tloc).padStart(9), " " + r.f);
  const med = rows.map((r) => r.vloc).sort((x, y) => x - y);
  console.log(`\nmedian value LOC per route ${med[med.length >> 1]}, p90 ${med[Math.floor(med.length * 0.9)]}, max ${med[med.length - 1]}`);
} else if (cmd === "cost") {
  const v = closure(a1, [valueOut]);
  const all = closure(a1, [valueOut, typeOut]);
  console.log(`${a1}`);
  console.log(`  value closure : ${v.size} modules, ${sumLoc(v)} LOC   (Turbopack compiles this)`);
  console.log(`  +type closure : ${all.size} modules, ${sumLoc(all)} LOC   (tsc checks this)`);
  console.log("\n  heaviest value-reachable modules:");
  [...v].map((f) => [loc.get(f) || 0, f]).sort((x, y) => y[0] - x[0]).slice(0, 25)
    .forEach(([l, f]) => console.log(`   ${String(l).padStart(6)}  ${f}`));
} else if (cmd === "why") {
  const prev = new Map([[a1, null]]);
  const q = [a1];
  while (q.length) {
    const cur = q.shift();
    if (cur === a2) break;
    for (const n of valueOut.get(cur) || []) if (!prev.has(n)) { prev.set(n, cur); q.push(n); }
  }
  if (!prev.has(a2)) { console.log("no VALUE import path (may be type-only)"); }
  else {
    const chain = [];
    for (let c = a2; c; c = prev.get(c)) chain.push(c);
    chain.reverse().forEach((f, i) => console.log("  ".repeat(i) + (i ? "-> " : "") + f));
  }
} else if (cmd === "barrels") {
  const fanin = new Map();
  for (const [f, set] of valueOut) for (const t of set) fanin.set(t, (fanin.get(t) || 0) + 1);
  const rows = [];
  for (const [f, fi] of fanin) {
    if (fi < 8) continue;
    const c = closure(f, [valueOut]);
    rows.push({ f, fi, cl: c.size, cloc: sumLoc(c), blast: fi * sumLoc(c) });
  }
  rows.sort((x, y) => y.blast - x.blast);
  console.log("   blast  importers  closure  closureLOC  module");
  for (const r of rows.slice(0, Number(a1) || 25))
    console.log(String(r.blast).padStart(9), String(r.fi).padStart(10), String(r.cl).padStart(8), String(r.cloc).padStart(11), " " + r.f);
} else if (cmd === "clientboundary") {
  const bad = [];
  for (const f of isClient) {
    const c = closure(f, [valueOut]);
    const leaks = [...c].filter((x) => isServerOnly.has(x));
    if (leaks.length) bad.push({ f, leaks });
  }
  console.log(`${isClient.size} "use client" files; ${bad.length} reach prisma/server-only through value imports`);
  bad.slice(0, Number(a1) || 25).forEach((b) => console.log(`  ${b.f}\n     -> ${b.leaks.slice(0, 4).join(", ")}`));
} else if (cmd === "pkgs") {
  const rows = [...pkgUse].map(([p, s]) => [s.size, p]).sort((x, y) => y[0] - x[0]);
  rows.slice(0, Number(a1) || 40).forEach(([n, p]) => console.log(String(n).padStart(5), p));
} else if (cmd === "stats") {
  let ve = 0, te = 0;
  for (const s of valueOut.values()) ve += s.size;
  for (const s of typeOut.values()) te += s.size;
  console.log(`${src.size} source files, ${[...loc.values()].reduce((a, b) => a + b, 0)} LOC`);
  console.log(`${ve} value import edges, ${te} type-only edges, ${[...dynOut.values()].reduce((a, s) => a + s.size, 0)} dynamic imports`);
  console.log(`${isClient.size} "use client" files, ${isServerOnly.size} server-only files`);
} else {
  console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
}
