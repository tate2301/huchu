// The core modules' stylesheet, from the kit the Huchu Core Modules canvas is drawn with
// (design/core-modules/boards/assets/core.css: tokens, the saas-design reference kit, the shell and
// every page's parts). Scoped under one `.ck` root so none of it reaches a page not built from it.
//
//   node design/core-modules/build/build-kit-css.mjs
//
// writes components/core/kit.css. Change the source, never the output. The till does the same for
// Tender (docs/design/till/build-till-css.mjs); this follows it step for step.
//
// 1. Scope. Every kit selector is prefixed with `.ck.ck.ck`: the same added specificity everywhere,
//    so the kit keeps the order its own rules were written to win in. `:root`, `html` and `body`
//    become the `.ck` element itself, without their backgrounds: a `.ck` wrapper never paints.
//    The output is unlayered, so it outranks the app's layered sheets.
//
// 2. Reset. The app's global sheets use some of the kit's class names unscoped (.btn, .menu, .row…).
//    Inside `.ck`, each property one of their kit-named rules sets is first put back to `unset`.
//
// 3. Roles. Every kit colour is a theme role (app/themes/roles.css), so the kit follows the product:
//    Corelith's roles carry the kit's own values, light and dark, and Tender's carry Tender's. The
//    build checks the Corelith themes against the kit and lists any colour that differs.
//
// 4. Theme. Dark is the person's choice, set on <html> before the first paint (`corelith-dark`,
//    `tender-dark`), so the prefers-color-scheme block is dropped and the kit's dark-only tokens
//    (shadows, chart hues) apply under any `-dark` theme. The face is the product's `--font-sans`.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const requireFromRoot = createRequire(path.join(root, "package.json"));
const postcss = createRequire(path.join(root, "node_modules/.pnpm/node_modules/"))("postcss");

const css = postcss.parse(fs.readFileSync(path.join(here, "../boards/assets/core.css"), "utf8"));
const KIT = ".ck.ck.ck";
const DARK = ['.ck[data-theme$="-dark"]', '[data-theme$="-dark"] .ck'];

function scope(selector) {
  const s = selector.trim();
  if (s === ":root" || s === "html" || s === "body") return ".ck";
  if (s.startsWith(":root")) return `.ck${s.slice(":root".length)}`;
  if (s.startsWith("html ") || s.startsWith("body ")) return `${KIT} ${s.slice(5)}`;
  if (s.startsWith("*")) return `.ck ${s}`;
  return `${KIT} ${s}`;
}

/* ── 2. The app's global sheets, as the root layout loads them ─────────────── */

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
    resets.append(postcss.rule({ selectors: selectors.map((selector) => `.ck.ck ${selector}`), nodes: [...props].map((prop) => postcss.decl({ prop, value: "unset" })) }));
  });
  if (count) resetFrom.push(`${path.relative(root, file)} (${count})`);
}

/* ── 3. Colours are roles ──────────────────────────────────────────────────── */

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
  "--color-accent-ink": "--on-action",
  "--color-accent-tint": "--sel-bg",
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
const roleRule = (theme) =>
  roles.nodes.find((node) => node.type === "rule" && node.selectors.some((s) => s.trim() === `:root[data-theme="${theme}"]`));
const corelith = declsOf(roleRule("corelith"));
const corelithDark = declsOf(roleRule("corelith-dark"));

const tokens = css.nodes.find((node) => node.type === "rule" && node.selector === ":root");
const darkTokens = css.nodes.find((node) => node.type === "rule" && node.selector === ':root[data-theme="dark"]');
const light = declsOf(tokens);
const dark = declsOf(darkTokens);

const differs = [];
for (const [token, role] of Object.entries(ROLE_OF)) {
  const darkValue = dark.get(token) ?? light.get(token);
  if (!same(light.get(token), corelith.get(role))) differs.push(`${token} light ${light.get(token)} ≠ ${role} ${corelith.get(role)}`);
  if (!same(darkValue, corelithDark.get(role))) differs.push(`${token} dark ${darkValue} ≠ ${role} ${corelithDark.get(role)}`);
  tokens.walkDecls(token, (decl) => {
    decl.value = `var(${role})`;
  });
  darkTokens?.walkDecls(token, (decl) => decl.remove());
}
// The face is the product's: Inter on Corelith, Atkinson on Tender (roles.css).
tokens.walkDecls("--font-sans", (decl) => decl.remove());

/* ── 1 and 4. Scope, theme ─────────────────────────────────────────────────── */

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
  const selectors = rule.selectors.map((s) => s.trim());
  if (selectors.some((s) => s === "html" || s === "body")) {
    rule.walkDecls(/^background/, (decl) => decl.remove());
    rule.walkDecls("margin", (decl) => decl.remove());
    if (!rule.nodes.length) {
      rule.remove();
      return;
    }
  }
  rule.selectors = selectors.map(scope);
});
css.walkAtRules("media", (rule) => {
  if (!rule.nodes?.length) rule.remove();
});

if (firstKitRule) firstKitRule.before(resets.nodes.map((node) => node.clone()));
else css.append(resets.nodes.map((node) => node.clone()));

const out = path.join(root, "components/core/kit.css");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `/* Generated by design/core-modules/build/build-kit-css.mjs from boards/assets/core.css. Do not edit. */\n${css.toString()}`);
console.log(`wrote ${path.relative(root, out)}`);
console.log(`reset the kit's class names from: ${resetFrom.join(", ") || "nothing"}`);
console.log(`Corelith roles that differ from the kit: ${differs.length ? `\n  ${differs.join("\n  ")}` : "none"}`);
