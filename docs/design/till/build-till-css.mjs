// The till's stylesheet, from the three sheets the "Tender till" canvas is drawn with:
// tokens.css (generated from tokens.json), kit.css (the saas-design reference kit) and till.css
// (the till's own parts). Scoped under one `.tl` root so none of it reaches the back office.
//
//   node docs/design/till/build-till-css.mjs
//
// writes components/retail/till/till.css. Change the sources, never the output.
//
// Four steps:
//
// 1. Scope. Every kit selector is prefixed with `.tl.tl.tl`: the same added specificity everywhere,
//    so the kit keeps the order its own rules were written to win in. `:root`, `html` and `body`
//    become the `.tl` element itself. Rules for the canvas's board frames are dropped: a board is
//    not a screen. The output is unlayered, so it already outranks the app's layered sheets.
//
// 2. Reset. The app's global sheets use some of the kit's class names unscoped (.btn, .menu, .input,
//    .table, .row, .grow…), mostly from the design-system package `@corelithzw/react/styles.css`,
//    which app/globals.css imports. Those sheets are found the way the browser gets them: every
//    stylesheet app/layout.tsx imports, and every stylesheet those `@import`, followed. Inside `.tl`,
//    each property one of their kit-named rules sets is first put back to `unset`, so a property the
//    kit leaves alone does not leak in. Tailwind's utilities are generated, not a file, and are not
//    reset: the till uses few of their names (`truncate`, `grow`) and the kit's rules mean the same.
//
// 3. Share. The till's colours are the Tender palette. Where a till token holds the same value as a
//    Tender role (app/themes/roles.css) in both the light theme and Tender dark, the till reads the
//    role instead of keeping its own copy, and its dark block drops the line. A token whose value
//    differs from the role's keeps its own, and the build lists them.
//
// 4. Theme. Dark is an explicit choice (the person's appearance, set on <html> as
//    `data-theme="tender-dark"` before the first paint; see the end of app/globals.css), so the
//    prefers-color-scheme block is dropped and the till's dark tokens apply under Tender dark,
//    whether <html> or the till's own root says it.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const requireFromRoot = createRequire(path.join(root, "package.json"));
const postcss = createRequire(path.join(root, "node_modules/.pnpm/node_modules/"))("postcss");

const sources = ["tokens.css", "kit.css", "till.css"].map((file) => fs.readFileSync(path.join(here, file), "utf8"));
const css = postcss.parse(sources.join("\n"));
const KIT = ".tl.tl.tl";
const DARK = ['.tl[data-theme="tender-dark"]', '[data-theme="tender-dark"] .tl'];

function scope(selector) {
  const s = selector.trim();
  if (s === ":root" || s === "html" || s === "body") return ".tl";
  if (s.startsWith(":root")) return `.tl${s.slice(":root".length)}`;
  if (s.startsWith("html ") || s.startsWith("body ")) return `${KIT} ${s.slice(5)}`;
  if (s.startsWith("*")) return `.tl ${s}`;
  return `${KIT} ${s}`;
}

/* ── 2. The app's global sheets, as the root layout loads them ─────────────── */

/** A stylesheet specifier from `from`, or null when it is not a CSS file on disk (Tailwind's entry, a URL). */
function resolveSheet(specifier, from) {
  if (/^(url\(|https?:)/.test(specifier)) return null;
  try {
    const file = specifier.startsWith(".") ? path.resolve(path.dirname(from), specifier) : requireFromRoot.resolve(specifier);
    return file.endsWith(".css") && fs.existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

function globalSheets() {
  const layout = path.join(root, "app/layout.tsx");
  const queue = [...fs.readFileSync(layout, "utf8").matchAll(/^import\s+["']([^"']+)["'];/gm)]
    .map((match) => resolveSheet(match[1], layout))
    .filter(Boolean);
  const seen = new Set();
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    postcss.parse(fs.readFileSync(file, "utf8")).walkAtRules("import", (rule) => {
      const specifier = rule.params.match(/^(?:url\()?["']?([^"')\s]+)/)?.[1];
      const next = specifier ? resolveSheet(specifier, file) : null;
      if (next) queue.push(next);
    });
  }
  return [...seen];
}

const classesOf = (selector) => (selector.match(/\.[a-zA-Z][\w-]*/g) || []).map((name) => name.slice(1));
const kitClasses = new Set();
css.walkRules((rule) => rule.selectors.forEach((selector) => classesOf(selector).forEach((name) => kitClasses.add(name))));

const resets = postcss.root();
const resetFrom = [];
for (const file of globalSheets()) {
  let count = 0;
  postcss.parse(fs.readFileSync(file, "utf8")).walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
    const selectors = rule.selectors.filter((selector) => {
      const names = classesOf(selector);
      return names.length > 0 && names.every((name) => kitClasses.has(name));
    });
    if (!selectors.length) return;
    const props = new Set();
    rule.walkDecls((decl) => {
      if (!decl.prop.startsWith("--")) props.add(decl.prop);
    });
    if (!props.size) return;
    count += selectors.length;
    resets.append(postcss.rule({ selectors: selectors.map((selector) => `.tl.tl ${selector}`), nodes: [...props].map((prop) => postcss.decl({ prop, value: "unset" })) }));
  });
  if (count) resetFrom.push(`${path.relative(root, file)} (${count})`);
}

/* ── 3. Tokens shared with the Tender theme ────────────────────────────────── */

/** Each till colour token and the Tender role that means the same thing. */
const ROLE_OF = {
  "--color-ink": "--ink",
  "--color-ink-2": "--ink-2",
  "--color-muted": "--ink-3",
  "--color-faint": "--faint",
  "--color-surface": "--surface",
  "--color-ground": "--ground",
  "--color-fill": "--tray",
  "--color-line": "--line",
  "--color-rule": "--line-strong",
  "--color-accent": "--action-fill",
  "--color-danger": "--bad",
  "--color-danger-tint": "--bad-soft",
  "--color-warning": "--warn",
  "--color-warning-tint": "--warn-soft",
  "--color-success": "--ok",
  "--color-success-tint": "--ok-soft",
  "--color-info": "--info",
  "--color-info-tint": "--info-soft",
  "--color-hover": "--hover",
  "--color-pressed": "--active",
  "--color-scrim": "--scrim",
};

const same = (a, b) => a?.replace(/\s+/g, "").toLowerCase() === b?.replace(/\s+/g, "").toLowerCase();
const declsOf = (rule) => new Map(rule ? rule.nodes.filter((node) => node.type === "decl").map((decl) => [decl.prop, decl.value]) : []);

const roles = postcss.parse(fs.readFileSync(path.join(root, "app/themes/roles.css"), "utf8"));
const roleRule = (selector) => roles.nodes.find((node) => node.type === "rule" && node.selectors.some((s) => s.trim() === selector));
const tender = declsOf(roleRule(':root[data-theme="tender"]'));
const tenderDark = declsOf(roleRule(':root[data-theme="tender-dark"]'));

const tokens = css.nodes.find((node) => node.type === "rule" && node.selector === ":root");
const darkTokens = css.nodes.find((node) => node.type === "rule" && node.selector === ':root[data-theme="dark"]');
const light = declsOf(tokens);
const dark = declsOf(darkTokens);

const shared = [];
const ownColours = [];
for (const [token, role] of Object.entries(ROLE_OF)) {
  // A token the dark block leaves alone keeps its light value in the dark too.
  const darkValue = dark.get(token) ?? light.get(token);
  if (same(light.get(token), tender.get(role)) && same(darkValue, tenderDark.get(role))) {
    tokens.walkDecls(token, (decl) => {
      decl.value = `var(${role})`;
    });
    darkTokens?.walkDecls(token, (decl) => decl.remove());
    shared.push(`${token} → ${role}`);
  } else {
    ownColours.push(token);
  }
}

/* ── 1 and 4. Scope, theme ─────────────────────────────────────────────────── */

// Where the kit starts: the first rule after the tokens. Found before the selectors are rewritten.
const firstKitRule = css.nodes.find((node) => node.type === "rule" && !node.selector.startsWith(":root"));

css.walkAtRules("media", (rule) => {
  if (rule.params.includes("prefers-color-scheme")) rule.remove();
});
css.walkAtRules("font-face", (rule) => rule.remove());
css.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
  if (rule === darkTokens) {
    rule.selectors = DARK;
    return;
  }
  const kept = rule.selectors.filter((selector) => !/\.frame\b|\.frame-phone\b/.test(selector));
  if (kept.length === 0) {
    rule.remove();
    return;
  }
  rule.selectors = kept.map(scope);
});
css.walkAtRules("media", (rule) => {
  if (!rule.nodes?.length) rule.remove();
});

// The resets go after the tokens and before the kit, so the kit's own values land on top of them.
if (firstKitRule) firstKitRule.before(resets.nodes.map((node) => node.clone()));
else css.append(resets.nodes.map((node) => node.clone()));

const out = path.join(root, "components/retail/till/till.css");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  `/* Generated by docs/design/till/build-till-css.mjs from tokens.css, kit.css and till.css. Do not edit. */\n${css.toString()}`,
);
console.log(`wrote ${path.relative(root, out)}`);
console.log(`reset the kit's class names from: ${resetFrom.join(", ") || "nothing"}`);
console.log(`shared with the Tender theme: ${shared.length} (${shared.join(", ")})`);
console.log(`the till's own colours, unlike the role's: ${ownColours.join(", ") || "none"}`);
