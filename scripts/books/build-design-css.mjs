/**
 * Books' design layer as one stylesheet, from the handover's screens
 * (design/books/html/bk-*.html): every rule their <style> blocks carry that
 * belongs to Books, in their order, scoped to a Books page (`.bkd`).
 *
 *   node scripts/books/build-design-css.mjs
 *
 * writes components/books/books-design.css. Change the design, never the output.
 *
 * - Rules every screen carries (the worksheet, the bands, `bkCss`, the edge to
 *   edge rules) are scoped to `.bkd`. A rule only some screens carry is scoped
 *   to those screens: `.bkd.sc-<slug>` (the page's `BkPage screen`).
 * - The shell's own parts (rail, panel, top bar, Vane's panel, the page
 *   skeleton, fonts, tokens) are left out: the app draws its shell, and its
 *   tokens are the same values (design/books/NOTES.md §3).
 * - The design calls its worksheet `.ws`, its table `.wt` and its main `.mn`;
 *   the kit already uses `.ws` (the workspace switcher) and `.wt` (its own
 *   worksheet frame), so they are `.bkw`, `.bkt` and `.bkm` here.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const htmlDir = join(root, "design/books/html");
const out = join(root, "components/books/books-design.css");

/** Screens that are boards about the design, not app screens. */
const BOARDS = new Set(["bk-brief", "bk-model", "bk-nav", "bk-kit"]);

/** Selectors for the shell, the Vane panel and the page skeleton: the app has its own. */
const SHELL = /(^|[\s>+~,(])(html|body|:root|\.sh|\.rl|\.rm|\.pn[\w-]*|\.pm[\w-]*|\.tb-[\w-]+|\.tl-[\w-]+|\.panel-m|\.rail-m|\.pav|\.ask[\w-]*|\.vp[\w-]*|\.vc[\w-]*|\.vn[\w-]*|\.vs|\.vd|\.vflag|\.live-d|\.live|\.ws-app|\.gi[\w-]*)(?![\w-])/;

/** Split CSS into top-level items: `{ at, rules: [{ sel, body }] }` with `at` an at-rule prelude or null. */
function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const items = [];
  let i = 0;
  const readBlock = (start) => {
    let depth = 0;
    for (let j = start; j < css.length; j += 1) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") {
        depth -= 1;
        if (depth === 0) return j;
      }
    }
    throw new Error("Unbalanced CSS");
  };
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    const close = readBlock(open);
    const inner = css.slice(open + 1, close);
    if (prelude.startsWith("@media") || prelude.startsWith("@supports")) {
      items.push({ at: prelude, rules: parse(inner).flatMap((item) => item.rules) });
    } else if (prelude.startsWith("@")) {
      items.push({ at: prelude, raw: inner, rules: [] });
    } else {
      items.push({ at: null, rules: [{ sel: prelude, body: inner.trim() }] });
    }
    i = close + 1;
  }
  return items;
}

const rename = (sel) => sel.replace(/\.ws(?=[^\w-]|$|-)/g, ".bkw").replace(/\.mn(?![\w-])/g, ".bkm").replace(/\.wt(?![\w-])/g, ".bkt");

function scope(sel, prefix) {
  return sel
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${prefix} ${rename(part)}`)
    .join(",");
}

const files = readdirSync(htmlDir)
  .filter((f) => /^bk-.*\.html$/.test(f))
  .map((f) => f.replace(/\.html$/, ""))
  .filter((slug) => !BOARDS.has(slug))
  .sort();

// Every rule of every screen, keyed by its context and text, with the screens that
// carry it, merged in the order the screens put them: a rule first seen in one
// screen goes just before the next rule that screen shares with the others, so
// a screen's own rules stay ahead of the edge to edge rules that follow them.
const order = [];
const carriers = new Map();
const entries = new Map();
for (const slug of files) {
  const html = readFileSync(join(htmlDir, `${slug}.html`), "utf8");
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  const sequence = [];
  for (const item of parse(css)) {
    if (item.at && !item.at.startsWith("@media") && !item.at.startsWith("@supports")) {
      // Keyframes the bands animate with stay; font faces go (the app loads the faces).
      if (!item.at.startsWith("@keyframes")) continue;
      const key = `${item.at}{${item.raw}}`;
      entries.set(key, { key, at: item.at, raw: item.raw });
      sequence.push(key);
      continue;
    }
    for (const rule of item.rules) {
      const parts = rule.sel.split(",").map((s) => s.trim()).filter((s) => s && !SHELL.test(` ${s}`));
      if (parts.length === 0 || !rule.body) continue;
      const sel = parts.join(",");
      const key = `${item.at ?? ""}|${sel}{${rule.body}}`;
      entries.set(key, { key, at: item.at, sel, body: rule.body });
      sequence.push(key);
    }
  }
  let pending = [];
  for (const key of sequence) {
    if (!carriers.has(key)) carriers.set(key, new Set());
    const seenBefore = carriers.get(key).size > 0;
    carriers.get(key).add(slug);
    if (!seenBefore) {
      pending.push(key);
    } else if (pending.length) {
      order.splice(order.indexOf(key), 0, ...pending);
      pending = [];
    }
  }
  order.push(...pending);
}

const lines = [
  "/* Generated by scripts/books/build-design-css.mjs from design/books/html/bk-*.html. Do not edit. */",
  "/* Books' design layer, scoped to a Books page (`.bkd`, components/books/ui/page.tsx). */",
];
let currentAt = null;
const flushAt = () => {
  if (currentAt) lines.push("}");
  currentAt = null;
};
for (const key of order) {
  const entry = entries.get(key);
  const screens = carriers.get(key);
  if (entry.raw !== undefined) {
    flushAt();
    lines.push(`${entry.at}{${entry.raw}}`);
    continue;
  }
  const shared = screens.size === files.length;
  const prefixes = shared ? [".bkd"] : [...screens].sort().map((slug) => `.bkd.sc-${slug.replace(/^bk-/, "")}`);
  const selector = prefixes.map((prefix) => scope(entry.sel, prefix)).join(",");
  if (entry.at !== currentAt) {
    flushAt();
    if (entry.at) {
      lines.push(`${entry.at}{`);
      currentAt = entry.at;
    }
  }
  lines.push(`${selector}{${entry.body}}`);
}
flushAt();
writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`wrote components/books/books-design.css: ${order.length} rules from ${files.length} screens`);
