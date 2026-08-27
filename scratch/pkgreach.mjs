/**
 * Which node_modules packages does each route's value-closure actually reach?
 * Turbopack compile cost is dominated by these, not by app LOC.
 */
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const SKIP = new Set(["node_modules", ".next", ".git", ".worktrees", ".claude", ".codex",
  ".idea", ".vercel", "graphify-out", "scratch", "design", "public", "docs", "e2e"]);
const EXTS = [".ts", ".tsx", ".mts", ".js", ".jsx"];

function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(d, e.name), acc); }
    else if (EXTS.some((x) => e.name.endsWith(x))) acc.push(path.join(d, e.name));
  }
  return acc;
}
const rel = (p) => path.relative(REPO, p).split(path.sep).join("/");
function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = path.join(REPO, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
  for (const e of EXTS) { const i = path.join(base, "index" + e); if (fs.existsSync(i)) return i; }
  return null;
}

const src = new Map();
for (const f of walk(REPO)) src.set(rel(f), fs.readFileSync(f, "utf8"));

const IMP = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
const BARE = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;
const out = new Map();   // file -> Set(local file)
const pkgs = new Map();  // file -> Set(package spec)
const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };

for (const [f, text] of src) {
  const abs = path.join(REPO, f);
  IMP.lastIndex = 0;
  let m;
  while ((m = IMP.exec(text))) {
    const clause = m[1], spec = m[2];
    if (/^\s*type\b/.test(clause)) continue;
    const inner = clause.match(/\{([\s\S]*)\}/);
    if (inner && !/^\s*[A-Za-z_$*]/.test(clause)) {
      const mem = inner[1].split(",").map((s) => s.trim()).filter(Boolean);
      if (mem.length && mem.every((s) => /^type\s/.test(s))) continue;
    }
    const t = resolveSpec(spec, abs);
    if (t) { if (rel(t) !== f) add(out, f, rel(t)); }
    else add(pkgs, f, spec);
  }
  BARE.lastIndex = 0;
  let b;
  while ((b = BARE.exec(text))) {
    const t = resolveSpec(b[1], abs);
    if (t) add(out, f, rel(t)); else add(pkgs, f, b[1]);
  }
}

// how many real files does each package spec drag in?
function pkgFileCount(spec) {
  const root = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
  const dir = path.join(REPO, "node_modules", root);
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const st = [dir];
  while (st.length) {
    const d = st.pop();
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.isDirectory()) { if (e.name !== "node_modules") st.push(path.join(d, e.name)); }
      else if (/\.(js|mjs|cjs|jsx)$/.test(e.name)) n++;
    }
  }
  return n;
}

function closure(start) {
  const seen = new Set([start]); const q = [start];
  while (q.length) { const c = q.shift(); for (const n of out.get(c) || []) if (!seen.has(n)) { seen.add(n); q.push(n); } }
  return seen;
}

const cmd = process.argv[2];
if (cmd === "route") {
  const f = process.argv[3];
  const c = closure(f);
  const specs = new Set();
  for (const x of c) for (const s of pkgs.get(x) || []) specs.add(s);
  const roots = new Map();
  for (const s of specs) {
    const r = s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0];
    if (r.startsWith("node:") || r === "next" || r === "react" || r === "react-dom") continue;
    if (!roots.has(r)) roots.set(r, new Set());
    roots.get(r).add(s);
  }
  console.log(`${f}: ${c.size} app modules -> ${roots.size} npm packages`);
  const rows = [...roots].map(([r, ss]) => [pkgFileCount(r), r, [...ss].join(" ")]).sort((a, b) => b[0] - a[0]);
  console.log(`${"pkgFiles".padStart(9)}  package`);
  for (const [n, r, ss] of rows) console.log(`${String(n).padStart(9)}  ${r}   ${ss.length > 60 ? ss.slice(0, 60) + "…" : ss}`);
  console.log(`\nTOTAL js files reachable in node_modules: ${rows.reduce((a, r) => a + r[0], 0)}`);
} else if (cmd === "iconusers") {
  // routes whose closure includes lib/icons.tsx
  let hit = 0, miss = 0;
  const missed = [];
  for (const f of src.keys()) {
    if (!f.startsWith("app/") || !/\/(page|route|layout)\.tsx?$/.test(f)) continue;
    if (closure(f).has("lib/icons.tsx")) hit++; else { miss++; if (missed.length < 15) missed.push(f); }
  }
  console.log(`routes reaching lib/icons.tsx: ${hit}   not reaching: ${miss}`);
  console.log("sample NOT reaching (good compile-time control group):");
  missed.forEach((f) => console.log("  " + f));
}
