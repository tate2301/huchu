// Shared helpers for the example builds. Each product has its own tokens.json and build.mjs.
//   npm i @iconify-json/mingcute @iconify-json/logos @iconify-json/simple-icons
//         @fontsource-variable/inter @fontsource-variable/geist @fontsource-variable/instrument-sans @fontsource-variable/figtree
//   node examples/<product>/build.mjs         (set ICONS_ROOT to a node_modules folder if needed)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

export const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nm = process.env.ICONS_ROOT || path.resolve(process.cwd(), "node_modules");
const load = (p) => JSON.parse(fs.readFileSync(path.join(nm, p), "utf8"));
const MC = load("@iconify-json/mingcute/icons.json"), LG = load("@iconify-json/logos/icons.json"), SI = load("@iconify-json/simple-icons/icons.json");

let _lid = 0; // a logo used twice keeps working when its first copy is hidden
const uniq = (body) => { const k = "l" + (++_lid) + "-"; return body.replace(/id="([^"]+)"/g, (m, i) => `id="${k}${i}"`).replace(/url\(#([^)]+)\)/g, (m, i) => `url(#${k}${i})`).replace(/href="#([^"]+)"/g, (m, i) => `href="#${k}${i}"`); };
export const ic = (n, cls = "") => { const i = MC.icons[n]; if (!i) throw new Error("no icon " + n); return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true">${i.body}</svg>`; };
const lg = (n) => { const i = LG.icons[n]; if (!i) throw new Error("no logo " + n); return [i, i.width || LG.width || 256, i.height || LG.height || 256]; };
export const logo = (n) => { const [i, w, h] = lg(n); return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${n}">${uniq(i.body)}</svg>`; };
export const logoIc = (n) => { const [i, w, h] = lg(n); return `<svg class="ic" viewBox="0 0 ${w} ${h}" aria-hidden="true">${uniq(i.body)}</svg>`; };
export const si = (n, color) => `<svg viewBox="0 0 24 24" role="img" aria-label="${n}" style="color:${color}">${SI.icons[n].body}</svg>`;
export const money = (v, sym = "$") => sym + v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Sets a product folder up: tokens.css from its tokens.json, the kit, its typeface. Returns page() and write().
export function setup(here, { font = "inter" } = {}) {
  const T = JSON.parse(fs.readFileSync(path.join(here, "tokens.json"), "utf8"));
  execFileSync("node", [path.join(plugin, "skills/tokens-to-code/scripts/tokens.mjs"), "build", path.join(here, "tokens.json"), "--out", path.join(here, ".gen")], { stdio: "ignore" });
  fs.copyFileSync(path.join(here, ".gen/tokens.css"), path.join(here, "tokens.css")); fs.rmSync(path.join(here, ".gen"), { recursive: true });
  fs.copyFileSync(path.join(plugin, "skills/component-kit/assets/kit.css"), path.join(here, "kit.css"));
  fs.copyFileSync(path.join(plugin, "skills/component-kit/assets/table.js"), path.join(here, "table.js"));
  fs.copyFileSync(path.join(nm, `@fontsource-variable/${font}/files/${font}-latin-wght-normal.woff2`), path.join(here, "font.woff2"));
  const page = (title, body, extra = "", script = "") => `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>@font-face{font-family:"${T.type.family}";src:url("font.woff2") format("woff2");font-weight:100 900;font-display:block}</style>
<link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="kit.css">
<style>${extra}</style></head><body>
${body}
${script ? `<script src="${script}"></script>` : ""}
</body></html>`;
  const write = (name, html) => fs.writeFileSync(path.join(here, name), html);
  return { page, write, T };
}

// The two-column shell, parameterised: every product has its own switcher, navigation and foot.
export const nav = (i, l, o = {}) => `<a class="nav" href="#${l.toLowerCase().replace(/\s+/g, "-")}"${o.on ? ' aria-current="page"' : ""}>${ic(i)}<span>${l}</span>${o.n ? `<span class="count${o.urgent ? " count-urgent" : ""}">${o.n}</span>` : ""}</a>`;
export const side = ({ mark, name, who, find, items, on, groups = [], foot = "Up to date" }) => `<aside class="side" aria-label="Main">
  <button class="ws" aria-label="Switch workspace or person">${ic(mark, "ic-20")}<span class="t"><span class="n truncate">${name}</span><span class="p truncate">${who}</span></span>${ic("selector-vertical-fill")}</button>
  <div class="side-find"><label class="input-wrap">${ic("search-line")}<input type="search" aria-label="${find}" placeholder="Search"><span class="kbd">/</span></label></div>
  ${items.map(([i, l, o]) => nav(i, l, { ...o, on: l === on })).join("\n  ")}
  ${groups.map(([h, its]) => `<div class="nav-head">${h}</div>${its.map(([i, l, o]) => nav(i, l, { ...o, on: l === on })).join("")}`).join("")}
  <div class="side-foot">${ic("check-circle-fill")}<span>${foot}</span><a class="nav" style="margin-left:auto" href="#settings" aria-label="Settings">${ic("settings-3-fill")}</a></div>
</aside>`;
