#!/usr/bin/env node
// The admin portal, drawn from the saas-design reference kit, the Corelith tokens and world.json.
// Shell B (home as an inbox), with two contexts: all workspaces, and one workspace.
//   ICONS_ROOT=<node_modules with @iconify-json/ph, @iconify-json/logos and
//   @fontsource-variable/atkinson-hyperlegible-next|mono> SAAS_DESIGN=<plugin root> node design/admin/build.mjs
// Writes design/admin/screens/*.html (gitignored) and the canvas page.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "screens");
const plugin = process.env.SAAS_DESIGN;
const nm = process.env.ICONS_ROOT;
if (!plugin || !nm) { console.error("set SAAS_DESIGN and ICONS_ROOT"); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const W = JSON.parse(fs.readFileSync(path.join(here, "world.json"), "utf8"));
const T = JSON.parse(fs.readFileSync(path.join(here, "tokens.json"), "utf8"));
const PH = JSON.parse(fs.readFileSync(path.join(nm, "@iconify-json/ph/icons.json"), "utf8"));
const LG = JSON.parse(fs.readFileSync(path.join(nm, "@iconify-json/logos/icons.json"), "utf8"));

execFileSync("node", [path.join(plugin, "skills/tokens-to-code/scripts/tokens.mjs"), "build", path.join(here, "tokens.json"), "--out", path.join(here, ".gen")], { stdio: "ignore" });
fs.copyFileSync(path.join(here, ".gen/tokens.css"), path.join(out, "tokens.css"));
fs.rmSync(path.join(here, ".gen"), { recursive: true });
fs.copyFileSync(path.join(plugin, "skills/component-kit/assets/kit.css"), path.join(out, "kit.css"));
fs.copyFileSync(path.join(nm, "@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2"), path.join(out, "sans.woff2"));
fs.copyFileSync(path.join(nm, "@fontsource-variable/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-wght-normal.woff2"), path.join(out, "mono.woff2"));

// ------------------------------------------------------------------ primitives
// One icon family: Phosphor, as the codebase draws it through @/lib/icons. Strokes (carets, X, plus,
// check) draw bold, the magnifier regular, everything else fill. "dots-three" joins the strokes: its
// fill weight is a solid box (ledger).
const weightOf = (n) => (/^caret-/.test(n) || ["x", "plus", "minus", "check", "checks", "dots-three"].includes(n) ? "-bold" : n === "magnifying-glass" ? "" : "-fill");
const ic = (n, cls = "") => { const i = PH.icons[n + weightOf(n)]; if (!i) throw new Error("no icon " + n); return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 256 256" aria-hidden="true">${i.body}</svg>`; };
let lid = 0;
const logoIc = (n) => { const i = LG.icons[n]; const w = i.width || LG.width || 256, h = i.height || LG.height || 256; const k = "l" + ++lid + "-"; return `<svg class="ic" viewBox="0 0 ${w} ${h}" aria-hidden="true">${i.body.replace(/id="([^"]+)"/g, (m, x) => `id="${k}${x}"`).replace(/url\(#([^)]+)\)/g, (m, x) => `url(#${k}${x})`)}</svg>`; };
const money = (v) => "$" + v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ws = (code) => W.entities.find((e) => e.code === code);
const pay = (code) => W.payments.find((p) => p.code === code);
const kbd = (k) => `<span class="kbd">${k}</span>`;
const kbdOn = (k) => `<span class="kbd" style="background:transparent;color:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.32)">${k}</span>`;
const cw = ws("chikuru-motors");
const members = W.members["chikuru-motors"];

// States are judgements and wear a filled badge, as lib/crm/tones.ts does. Categories stay plain.
const TONE = {
  "Setting up": "info", "Trial": "info", "Active": "neutral", "Past due": "warn", "Read-only": "danger", "Suspended": "danger", "Closed": "neutral",
  "Invited": "info", "Locked": "warn", "Owner": "neutral",
  "Waiting on the customer": "neutral", "Not confirmed": "warn", "Proof to check": "info", "Paid": "success", "Rejected": "danger", "Failed": "danger", "Refunded": "neutral",
  "Open, read-only": "info", "Open, can make changes": "warn", "Ended": "neutral", "Timed out": "neutral",
  "Needs a second factor": "warn", "Authenticator set": "neutral", "On": "success", "Off": "neutral", "Not yet available": "neutral",
};
const badge = (s, label = s) => `<span class="badge badge-${TONE[s] || "neutral"}">${label}</span>`;

const PROFILE_ICON = { "Gold mine": "hard-hat", "School": "graduation-cap", "Scrap metal": "coins", "Retail": "storefront", "Payroll": "money" };
const wsMark = (e, size = 32) => `<span class="mark${size === 32 ? " mark-32" : ""}" aria-hidden="true">${ic(e.product === "Flare" ? "lightning" : PROFILE_ICON[e.profile] || "buildings")}</span>`;
const methodIc = (m) => (m === "Visa" ? logoIc("visa") : m === "EcoCash" || m === "InnBucks" ? ic("device-mobile") : ic("credit-card"));

// ------------------------------------------------------------------ page and shared styles
const MONO = `"${T.type.mono}",ui-monospace,monospace`;
const SHARED = `
:root{--tone-info:#0B5DF0;--tone-info-bg:#E8EFFE;--tone-success:#4F7C46;--tone-success-bg:#E7EFE0;--tone-warn:#93611C;--tone-warn-bg:#F4E6C5;--tone-danger:#B83A2A;--tone-danger-bg:#F6E2DD;--link-ink:#0944C2;--scope-ws:#E8EFFE;--scope-ws-line:#B9CDFB}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--tone-info:#8FB0FF;--tone-info-bg:rgba(11,93,240,.22);--tone-success:#9CC491;--tone-success-bg:rgba(94,142,84,.2);--tone-warn:#E3B06A;--tone-warn-bg:rgba(176,118,38,.2);--tone-danger:#EE8C7C;--tone-danger-bg:rgba(184,58,42,.22);--link-ink:#9DBBFF;--scope-ws:#16233F;--scope-ws-line:#2C4377}}
:root[data-theme="dark"]{--tone-info:#8FB0FF;--tone-info-bg:rgba(11,93,240,.22);--tone-success:#9CC491;--tone-success-bg:rgba(94,142,84,.2);--tone-warn:#E3B06A;--tone-warn-bg:rgba(176,118,38,.2);--tone-danger:#EE8C7C;--tone-danger-bg:rgba(184,58,42,.22);--link-ink:#9DBBFF;--scope-ws:#16233F;--scope-ws-line:#2C4377}
.num{font-variant-numeric:tabular-nums}
.code,.mono{font-family:${MONO};font-variant-numeric:tabular-nums;letter-spacing:0}
.code{font-size:var(--text-13)}
.k{color:var(--color-ink);font-weight:500}
.attrs dd.num{text-align:left}
.mark .ic,.mark svg.ic{width:16px;height:16px;color:var(--color-ink-2)}.mark{background:var(--color-fill);outline-color:var(--color-line)}

/* badge: the design system's, so the canvas and the code agree */
.badge{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:var(--radius-pill);font-size:11px;font-weight:500;line-height:1;white-space:nowrap}
.badge-neutral{background:var(--color-fill);color:var(--color-muted)}.badge-info{background:var(--tone-info-bg);color:var(--tone-info)}
.badge-success{background:var(--tone-success-bg);color:var(--tone-success)}.badge-warn{background:var(--tone-warn-bg);color:var(--tone-warn)}.badge-danger{background:var(--tone-danger-bg);color:var(--tone-danger)}

/* the shell with a scope bar: the bar spans every column right of the sidebar */
.app.has-scope{grid-template-rows:auto minmax(0,1fr)}.app.has-scope>.side{grid-row:1/-1}.app.has-scope>.scope{grid-column:2/-1}
.has-scope .main.is-fixed,.has-scope .pane{height:calc(100vh - 44px)}
.scope{position:sticky;top:0;z-index:4;display:flex;align-items:center;gap:var(--space-12);min-height:44px;padding:0 var(--space-12) 0 var(--space-24);font-size:var(--text-13);color:var(--color-ink-2);background:var(--color-ground);box-shadow:inset 0 -1px 0 var(--color-line)}
.scope b{color:var(--color-ink);font-weight:600;white-space:nowrap}.scope .ic{color:var(--color-muted)}.scope .sep{color:var(--color-faint)}
.scope .end{margin-left:auto;display:flex;align-items:center;gap:var(--space-8)}
.scope-ws{background:var(--scope-ws);box-shadow:inset 0 -1px 0 var(--scope-ws-line),inset 3px 0 0 var(--color-accent)}
.scope-ws .mark{width:22px;height:22px;border-radius:6px}.scope-ws .note{color:var(--color-ink-2)}
.side.in-ws .ws{background:var(--scope-ws);box-shadow:inset 0 0 0 1px var(--scope-ws-line)}
.side .ws .mark{width:24px;height:24px}
.side-foot .sess{display:flex;flex-direction:column;line-height:1.3}
.side .leave{margin-top:var(--space-8)}

/* the record table: components/records/record-table.tsx, drawn */
.rt-wrap{overflow-x:auto;min-width:0}
table.rt{width:100%;border-collapse:separate;border-spacing:0;font-size:var(--text-13);text-align:left}
.rt th{position:sticky;top:0;z-index:2;background:var(--color-ground);box-shadow:inset 0 -1px 0 var(--color-line);padding:6px 13px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--color-muted);white-space:nowrap}
.rt th .ic{width:14px;height:14px;display:inline-block;vertical-align:-3px;margin-right:6px}
.rt th[aria-sort]{color:var(--color-ink)}
.rt td{padding:6px 13px;height:40px;box-shadow:inset 0 -1px 0 var(--color-line);vertical-align:middle;color:var(--color-ink-2);white-space:nowrap;max-width:300px;overflow:hidden;text-overflow:ellipsis}
.rt th:first-child,.rt td:first-child{padding-left:var(--space-24)}.rt th:last-child,.rt td:last-child{padding-right:var(--space-16)}
@media (hover:hover){.rt tbody tr:not(.rt-group):hover td{background:var(--color-hover)}}
.rt tr[aria-selected="true"] td{background:var(--color-accent-tint)}
.rt .end{text-align:right}
.rt-name{display:flex;align-items:center;gap:10px;min-width:0;text-decoration:none}
.rt-name .t{display:flex;flex-direction:column;min-width:0;line-height:1.3}
.rt-name b{font-weight:600;color:var(--color-ink);text-decoration:underline;text-decoration-color:var(--color-line);text-underline-offset:2px;overflow:hidden;text-overflow:ellipsis}
.rt-name small{font-family:${MONO};font-size:11.5px;color:var(--color-muted);overflow:hidden;text-overflow:ellipsis}
.rt-name .avatar{width:28px;height:28px}
.c-mono{font-family:${MONO};font-variant-numeric:tabular-nums;font-size:12.5px}
.c-money{font-family:${MONO};font-variant-numeric:tabular-nums;font-weight:500;color:var(--color-ink)}
.c-link{color:var(--link-ink);text-decoration:none}.c-link:hover{text-decoration:underline}
.c-empty{color:var(--color-faint)}
.rt .trail{width:40px;text-align:center}.rt .trail .ic{color:var(--color-faint)}
.rt-group td{background:var(--color-ground);height:32px;font-weight:500;color:var(--color-ink)}
.rt-group .c-mono{color:var(--color-muted);font-weight:400;margin-left:var(--space-8)}
.rt-m{display:none}
.mrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px var(--space-12);padding:var(--space-12) var(--space-16);box-shadow:inset 0 -1px 0 var(--color-line);text-decoration:none;color:var(--color-ink-2);font-size:var(--text-13)}
.mrow b{font-weight:600;color:var(--color-ink);font-size:var(--text-14)}.mrow .s{grid-column:1/-1;color:var(--color-muted)}
.mhead{padding:var(--space-8) var(--space-16);background:var(--color-ground);box-shadow:inset 0 -1px 0 var(--color-line);font-size:var(--text-13);font-weight:500;color:var(--color-ink)}

/* tabs on their own row, filters on the row below */
.view-tabs{padding:0 var(--space-24);box-shadow:inset 0 -1px 0 var(--color-line);scrollbar-width:none}.view-tabs::-webkit-scrollbar{display:none}
.filters{display:flex;align-items:center;gap:var(--space-8);padding:var(--space-8) var(--space-24);box-shadow:inset 0 -1px 0 var(--color-line)}
.filters .input-wrap{width:280px}.filters .end{margin-left:auto;font-size:var(--text-13);color:var(--color-muted)}

/* phone */
.tabbar{display:none;position:sticky;bottom:0;z-index:5;background:var(--color-surface);box-shadow:inset 0 1px 0 var(--color-line);padding:var(--space-4) var(--space-8) calc(var(--space-4) + env(safe-area-inset-bottom))}
.tabbar a{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:var(--target-touch);justify-content:center;font-size:var(--text-12);color:var(--color-muted);text-decoration:none;position:relative}
.tabbar a[aria-current="page"]{color:var(--color-ink)}.tabbar .ic{width:20px;height:20px}.tabbar .count{position:absolute;top:2px;left:calc(50% + 6px)}
@media (max-width:760px){
  .app,.app-3,.app-4{grid-template-columns:minmax(0,1fr)}.app.has-scope>.scope{grid-column:1}
  .side,.rail{display:none}.tabbar{display:flex}
  .scope{padding:0 var(--space-8) 0 var(--space-16)}.scope .hide-s,.scope .kbd{display:none}.scope b{overflow:hidden;text-overflow:ellipsis}
  .rt-wrap{display:none}.rt-m{display:block}
  .bar{padding:0 var(--space-16)}.bar .end .btn:not(.btn-primary){display:none}
  .view-tabs{padding:0 var(--space-16);overflow-x:auto}.filters{padding:var(--space-8) var(--space-16)}.filters .input-wrap{width:100%}.filters .btn,.filters .end{display:none}
  .table-foot .foot-sum{display:none}
  .has-scope .main.is-fixed{height:auto}
}`;

const page = (title, body, extra = "") => `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>@font-face{font-family:"${T.type.family}";src:url("sans.woff2") format("woff2");font-weight:200 800;font-display:block}
@font-face{font-family:"${T.type.mono}";src:url("mono.woff2") format("woff2");font-weight:200 800;font-display:block}</style>
<link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="kit.css">
<style>${SHARED}${extra}</style></head><body>
${body}
</body></html>`;
const write = (name, html) => fs.writeFileSync(path.join(out, name), html);

// ------------------------------------------------------------------ the two contexts
const ME = "Farai Moyo, support";
const nav = (i, l, o = {}) => `<a class="nav" href="#${l.toLowerCase().replace(/\s+/g, "-")}"${o.on ? ' aria-current="page"' : ""}>${ic(i)}<span>${l}</span>${o.n ? `<span class="count${o.urgent ? " count-urgent" : ""}">${o.n}</span>` : ""}</a>`;
const foot = `<div class="side-foot">${ic("lock-key")}<span class="sess"><span>Signed in until 18:20</span><span>Idle for 30 minutes signs you out</span></span></div>`;

// all workspaces
const G_NAV = [["tray", "Home", { n: W.totals.queue_items }], ["buildings", "Workspaces"], ["users", "People"], ["receipt", "Payments", { n: W.totals.proofs_to_check }], ["scroll", "Audit log"]];
const sideGlobal = (on, who = ME) => `<aside class="side" aria-label="Main">
  <button class="ws" aria-haspopup="menu" aria-label="Context: all workspaces. Switch to a workspace">${ic("globe-simple", "ic-20")}<span class="t"><span class="n truncate">All workspaces</span><span class="p truncate">${who}</span></span>${ic("caret-up-down")}</button>
  <div class="side-find"><label class="input-wrap">${ic("magnifying-glass")}<input type="search" aria-label="Find a workspace, person or payment" placeholder="Find anyone"><span class="kbd">/</span></label></div>
  ${G_NAV.map(([i, l, o]) => nav(i, l, { ...o, on: l === on })).join("\n  ")}
  ${who.endsWith("owner") ? nav("identification-badge", "Operators", { on: on === "Operators" }) : ""}
  ${foot}
</aside>`;
const scopeGlobal = `<div class="scope" role="region" aria-label="Context">${ic("globe-simple")}<b>All workspaces</b><span class="sep hide-s">·</span><span class="hide-s">Find anyone and work the queues. A change to one workspace happens inside it.</span><div class="end"><button class="btn btn-quiet">${ic("buildings")}Open a workspace${kbd("O")}</button></div></div>`;

// one workspace
const W_NAV = [["squares-four", "Overview"], ["users", "Members", { n: members.length }], ["receipt", "Plan and billing", { n: 1 }], ["scroll", "Audit log"], ["gear-six", "Settings"]];
const sideWs = (on, who = ME) => `<aside class="side in-ws" aria-label="Main">
  <button class="ws" aria-haspopup="menu" aria-label="Context: ${cw.name}. Switch workspace or go back to all workspaces">${wsMark(cw, 24)}<span class="t"><span class="n truncate">${cw.name}</span><span class="p truncate">${who}</span></span>${ic("caret-up-down")}</button>
  <div class="side-find"><label class="input-wrap">${ic("magnifying-glass")}<input type="search" aria-label="Find in ${cw.name}" placeholder="Find in ${cw.name}"><span class="kbd">/</span></label></div>
  ${W_NAV.map(([i, l, o]) => nav(i, l, { ...o, on: l === on })).join("\n  ")}
  <a class="nav leave" href="#all">${ic("globe-simple")}<span>All workspaces</span><span class="kbd" style="margin-left:auto">Esc</span></a>
  ${foot}
</aside>`;
const scopeWs = `<div class="scope scope-ws" role="region" aria-label="Context: ${cw.name}">${wsMark(cw, 22)}<b>${cw.name}</b><span class="mono hide-s">${cw.code}</span>${badge("Trial", "Trial, 4 days left")}<span class="sep hide-s">·</span><span class="note hide-s">Every change here applies to ${cw.name} only</span><div class="end"><button class="btn btn-quiet" aria-label="Sign in as a member of ${cw.name}">${ic("user-switch")}<span class="hide-s">Sign in as</span>${kbd("S")}</button><button class="btn" aria-label="Leave ${cw.name}">${ic("x")}<span class="hide-s">Leave workspace</span>${kbd("Esc")}</button></div></div>`;

const tabbar = (items, on) => `<nav class="tabbar" aria-label="Main">${items.map(([i, l, n]) => `<a href="#${l.toLowerCase().replace(/\s+/g, "-")}"${l === on ? ' aria-current="page"' : ""}>${ic(i)}<span>${l}</span>${n ? `<span class="count">${n}</span>` : ""}</a>`).join("")}</nav>`;
const TB_G = [["tray", "Home", W.totals.queue_items], ["magnifying-glass", "Find"], ["buildings", "Workspaces"], ["receipt", "Payments", W.totals.proofs_to_check], ["dots-three", "More"]];
const TB_W = [["squares-four", "Overview"], ["users", "Members"], ["receipt", "Billing", 1], ["gear-six", "Settings"], ["dots-three", "More"]];

// ------------------------------------------------------------------ the record table
// cols: [label, icon, align, sort]. rows: { cells, sel, group, name, menuOpen, m }. trail: "chev" | "menu" | "none".
const cName = (lead, name, sub) => `<a class="rt-name" href="#open">${lead}<span class="t"><b>${name}</b>${sub ? `<small>${sub}</small>` : ""}</span></a>`;
const cMono = (v) => (v ? `<span class="c-mono">${v}</span>` : `<span class="c-empty">—</span>`);
const cMoney = (v) => `<span class="c-money">${money(v)}</span>`;
const cNum = (v) => `<span class="c-mono">${v}</span>`;
const cLink = (v) => (v ? `<a class="c-link" href="#rel">${v}</a>` : `<span class="c-empty">—</span>`);
const cText = (v) => (v ? v : `<span class="c-empty">—</span>`);
const person = `<span class="avatar avatar-none" style="width:28px;height:28px">${ic("user")}</span>`;
const rt = ({ label, cols, rows, trail = "chev" }) => `<div class="rt-wrap" tabindex="0" aria-label="${label}"><table class="rt">
  <thead><tr>${cols.map(([h, i, a, sort]) => `<th${a === "end" ? ' class="end"' : ""}${sort ? ` aria-sort="${sort}"` : ""}>${i ? ic(i) : ""}${h}</th>`).join("")}${trail !== "none" ? `<th class="trail"><span class="sr">${trail === "menu" ? "Actions" : "Open"}</span></th>` : ""}</tr></thead>
  <tbody>${rows.map((r) => r.group ? `<tr class="rt-group"><td colspan="${cols.length + (trail !== "none" ? 1 : 0)}">${r.group}<span class="c-mono">${r.n}</span></td></tr>` : `<tr${r.sel ? ' aria-selected="true"' : ""}>${r.cells.map((c, i) => `<td${cols[i][2] === "end" ? ' class="end"' : ""}>${c}</td>`).join("")}${trail === "chev" ? `<td class="trail">${ic("caret-right")}</td>` : trail === "menu" ? `<td class="trail"><button class="btn btn-quiet btn-icon" aria-label="Actions for ${r.name || "this row"}"${r.menuOpen ? ' aria-expanded="true"' : ""}>${ic("dots-three")}</button></td>` : ""}</tr>`).join("")}</tbody>
</table></div>`;
const mobileList = (rows) => `<div class="rt-m">${rows.map((r) => (r.group ? `<div class="mhead">${r.group} <span class="muted">${r.n}</span></div>` : `<a class="mrow" href="#open"><b class="truncate">${r.m[0]}</b>${r.m[1]}<span class="s truncate">${r.m[2]}</span></a>`)).join("")}</div>`;
const tableFoot = (left, sums = [], end = "") => `<div class="table-foot"><div class="foot-row foot-main"><span class="num">${left}</span>${sums.map(([l, v]) => `<span class="foot-sum">${l} <b class="num">${v}</b></span>`).join("")}<div class="end">${end}</div></div></div>`;
const viewTabs = (tabs) => `<div class="tabs view-tabs" role="tablist">${tabs.map(([l, n, on]) => `<button class="tab" role="tab" aria-selected="${on ? "true" : "false"}">${l}${n !== undefined ? ` <span class="count">${n}</span>` : ""}</button>`).join("")}</div>`;
const filters = (find, btns = [], end = "") => `<div class="filters"><label class="input-wrap">${ic("magnifying-glass")}<input type="search" aria-label="${find}" placeholder="${find}"></label>${btns.map((b) => `<button class="btn btn-quiet">${ic("funnel")}${b}${ic("caret-down")}</button>`).join("")}${end ? `<span class="end">${end}</span>` : ""}</div>`;

// ------------------------------------------------------------------ 1. sign in
const gateSide = `<aside class="gate-side" aria-label="About this portal">
  <p class="lede-figure" style="font-size:var(--text-20);line-height:var(--leading-20)">For Corelith staff only. <span class="q">Every action here is written to the audit log with your name.</span></p>
  <dl class="attrs" style="grid-template-columns:140px minmax(0,1fr)"><dt>This address</dt><dd class="mono">portal.admin.pagka.dev</dd><dt>Lost your phone</dt><dd>Ask an owner to reset your second factor</dd><dt>Forgot your password</dt><dd><a class="link" href="#reset">Reset it by email</a></dd></dl>
</aside>`;
const gateCss = `@media (max-width:760px){.gate{grid-template-columns:minmax(0,1fr)}.gate-side{padding:var(--space-24) var(--space-16)}.gate-form{padding:var(--space-32) var(--space-16)}}`;
write("sign-in.html", page("Sign in", `<div class="gate">
  <form class="gate-form" aria-label="Sign in">
    <div><p class="muted" style="font-size:var(--text-13)">Corelith admin</p><h1 class="text-display">Sign in</h1></div>
    <div class="field"><label for="e">Work email</label><input class="input input-lg" id="e" type="email" autocomplete="username" value="farai@corelith.co.zw"></div>
    <div class="field"><label for="p">Password</label><input class="input input-lg" id="p" type="password" autocomplete="current-password" value="correct horse battery"><span class="help">At least 12 characters. Five wrong tries locks the account for 15 minutes.</span></div>
    <button class="btn btn-primary btn-lg">${ic("sign-in")}Sign in</button>
    <p class="muted" style="font-size:var(--text-13)">New here? Your invite email has the link to set a password.</p>
  </form>
  ${gateSide}
</div>`, gateCss));
write("sign-in-code.html", page("Authenticator code", `<div class="gate">
  <form class="gate-form" aria-label="Authenticator code">
    <div><p class="muted" style="font-size:var(--text-13)">Signed in as farai@corelith.co.zw</p><h1 class="text-display">Enter the code from your authenticator</h1></div>
    <div class="field"><label for="c">Six-digit code</label><input class="input input-lg mono" id="c" inputmode="numeric" autocomplete="one-time-code" value="482 91" aria-describedby="ch"><span class="help" id="ch">From Google Authenticator, 1Password or any app you set up. It changes every 30 seconds.</span></div>
    <label class="setting" style="box-shadow:none;padding:0;min-height:0"><span class="check"><input type="checkbox"></span><span class="t"><b>Trust this computer for 12 hours</b><span>Only on a computer nobody else uses</span></span></label>
    <div style="display:flex;gap:var(--space-8)"><button type="button" class="btn btn-lg">${ic("caret-left")}Back</button><button class="btn btn-primary btn-lg grow">${ic("check")}Check code</button></div>
  </form>
  ${gateSide}
</div>`, gateCss));

// ------------------------------------------------------------------ 2. home: the queue, in all workspaces. Each item wears its workspace.
const p1093 = pay("PAY-1093"), p1092 = pay("PAY-1092"), p1091 = pay("PAY-1091");
const qItem = (lead, fact, line, meta, on) => `<a class="item" href="#q"${on ? ' aria-current="true"' : ""}><span class="lead truncate">${lead}</span><span class="num">${fact}</span><span class="truncate" style="grid-column:1/-1">${line}</span><span class="muted" style="grid-column:1/-1;font-size:var(--text-12)">${meta}</span></a>`;
const inbox = `<section class="pane" aria-label="Waiting on staff">
  <div class="bar"><h1>Home</h1><span class="count">${W.totals.queue_items}</span><div class="end"><button class="btn btn-quiet btn-icon" aria-label="Filter the queue">${ic("funnel")}</button></div></div>
  <div class="tools" style="padding:var(--space-12) var(--space-16)"><div class="seg" role="tablist" aria-label="What"><button role="tab" aria-selected="true">All <span class="n">${W.totals.queue_items}</span></button><button role="tab" aria-selected="false">Payments <span class="n">3</span></button><button role="tab" aria-selected="false">Access <span class="n">3</span></button></div></div>
  <div class="pane-scroll list">
    ${qItem(ws("zuva-solar").name, money(p1093.amount), "EcoCash proof to check", "PAY-1093 · 11:44")}
    ${qItem(cw.name, money(p1092.amount), "InnBucks proof to check", "PAY-1092 · 10:12", true)}
    ${qItem(ws("kopje-scrap").name, money(p1091.amount), "Pesepay has not answered", "PAY-1091 · 09:31")}
    ${qItem(ws("pomona-hardware").name, "", "Setup stopped at the address", "Today 08:40")}
    ${qItem("Farai Moyo as Rutendo Nyathi", "14:32", "Signed in, look only", "SA-214 · Chikuru Motors")}
    ${qItem("Kudakwashe Dube", "", "No authenticator yet", "Operator · invited 12 Oct")}
  </div>
  ${tabbar(TB_G, "Home")}
</section>`;
const itemScope = (e) => `<div class="item-scope">${wsMark(e, 22)}<span>Acts on <b>${e.name}</b></span><span class="mono muted">${e.code}</span><div class="end"><a class="link" href="#open">Open workspace</a></div></div>`;
const proofMain = `<main class="main is-fixed" style="box-shadow:none">
  <div class="bar"><h1 class="truncate">PAY-1092</h1>${badge("Proof to check")}<div class="end"><div class="btn-group" role="group" aria-label="Move through the queue"><button class="btn btn-icon" aria-label="Previous item">${ic("caret-up")}</button><button class="btn btn-icon" aria-label="Next item">${ic("caret-down")}</button></div></div></div>
  ${itemScope(cw)}
  <div class="proof-body">
    <div class="finding" style="padding:var(--space-24) 0 0"><p class="lede-figure">${money(p1092.amount)} by InnBucks, for Business, a year at 20% off. <span class="q">Sent by Tendai Chikuru today at 10:12, from the pay page.</span></p></div>
    <section class="verify"><div class="sec-title">Check it against the InnBucks statement</div>
      <div class="cmp" role="table" aria-label="The proof against what we expect">${[["Transaction", p1092.ref, badge("Paid", "Not used before")], ["Amount", money(p1092.amount), badge("Paid", "Matches the plan price")], ["Paid from", p1092.from, `<span class="muted">Tendai Chikuru's number</span>`], ["Reference", "CHIKURU-MOTORS", `<span class="muted">Quoted as asked</span>`]].map(([a, b, c]) => `<div class="cmp-row" role="row"><span role="rowheader" class="muted">${a}</span><span role="cell" class="mono">${b}</span><span role="cell">${c}</span></div>`).join("")}</div>
      <p class="muted" style="font-size:var(--text-13)">Confirming moves ${cw.name} to Business, paid to 13 Oct 2027, and emails Tendai a receipt numbered <span class="mono">PAY-1092</span>.</p></section>
    <section class="verify"><div class="sec-title">What they sent</div>
      <figure class="shot"><div class="shot-in"><b>InnBucks</b><span>Payment successful</span><span class="big num">USD 758.40</span><span>To: Corelith (Pvt) Ltd, merchant 40017</span><span>Ref: CHIKURU-MOTORS</span><span>Txn: IB-5521-90433</span><span class="num">13/10/2026 10:09</span></div><figcaption class="muted">Screenshot, 412 KB. <a class="link" href="#full">Open full size</a></figcaption></figure></section>
  </div>
  <div class="proof-foot"><button class="btn btn-lg" aria-haspopup="dialog">${ic("x")}Reject with a reason</button><span class="grow"></span><button class="btn btn-primary btn-lg">${ic("check")}Confirm ${money(p1092.amount)}…${kbdOn("C")}</button></div>
</main>`;
const queueRail = `<aside class="rail" aria-label="About ${cw.name}">
  <section><div class="sec-title">Standing</div><dl class="attrs"><dt>State</dt><dd>${badge("Trial")}</dd><dt>Until</dt><dd>17 Oct, then Free</dd><dt>Plan</dt><dd>Business, $79.00 a month</dd><dt>Members</dt><dd class="num">6 of 20</dd><dt>Owner</dt><dd>Tendai Chikuru</dd></dl></section>
  <section><div class="sec-title">Payments before this</div><p class="muted" style="font-size:var(--text-13)">None. This would be their first.</p></section>
</aside>`;
const proofCss = `
.item-scope{display:flex;align-items:center;gap:var(--space-8);min-height:40px;padding:0 var(--space-24);font-size:var(--text-13);background:var(--scope-ws);box-shadow:inset 0 -1px 0 var(--scope-ws-line),inset 3px 0 0 var(--color-accent)}
.item-scope b{font-weight:600}.item-scope .mark{width:22px;height:22px;border-radius:6px}.item-scope .end{margin-left:auto}
.proof-body{flex:1;min-height:0;overflow:auto;padding:0 var(--space-24) var(--space-24);display:flex;flex-direction:column;gap:var(--space-24)}
.verify{display:flex;flex-direction:column;gap:var(--space-12)}
.cmp{display:grid;grid-template-columns:96px max-content minmax(0,1fr);font-size:var(--text-13)}.cmp-row{display:contents}.cmp-row>span{padding:var(--space-8) var(--space-24) var(--space-8) 0;box-shadow:inset 0 1px 0 var(--color-line)}.cmp-row:first-child>span{box-shadow:none}
.shot{margin:0;display:flex;flex-direction:column;gap:var(--space-8);max-width:320px}
.shot-in{display:flex;flex-direction:column;align-items:flex-start;gap:var(--space-4);padding:var(--space-16);border-radius:var(--radius-card);background:var(--color-ground);box-shadow:var(--shadow-ring);font-size:var(--text-13);color:var(--color-ink-2)}
.shot-in .big{font-size:var(--text-20);color:var(--color-ink);font-weight:600;padding:var(--space-4) 0}
.proof-foot{display:flex;align-items:center;gap:var(--space-12);padding:var(--space-12) var(--space-24);box-shadow:inset 0 1px 0 var(--color-line);flex:none}
@media (max-width:760px){.app-4>.pane{display:flex;height:auto;min-height:calc(100vh - 44px)}.app-4>.main,.app-4>.rail{display:none}}`;
write("home.html", page("Home", `<div class="app app-4 has-scope">${sideGlobal("Home")}${scopeGlobal}${inbox}${proofMain}${queueRail}</div>`, proofCss));

// ------------------------------------------------------------------ 3. workspaces, and the context switcher open over it
const sw = (e, sub, on) => `<button class="menu-item" role="menuitemradio" aria-checked="${on ? "true" : "false"}"${on ? ' data-active="true"' : ""}>${wsMark(e, 24)}<span class="grow truncate">${e.name}</span><span class="end">${sub}</span></button>`;
const workspacesBody = () => {
  const rows = W.entities.map((e) => ({ name: e.name, cells: [cName(wsMark(e), e.name, e.code), cText(e.product + (e.profile ? `, <span class="muted">${e.profile.toLowerCase()}</span>` : "")), cText(e.plan), badge(e.state), cText(`<span class="muted">${e.sub}</span>`), cNum(e.members), cLink(e.owner), cMono(e.last === "never" ? "" : e.last)], m: [e.name, badge(e.state), `${e.product}, ${e.plan} · ${e.sub}`] }));
  const byState = (s) => W.entities.filter((e) => e.state === s).length;
  const mrr = W.entities.filter((e) => ["Active", "Past due"].includes(e.state)).reduce((n, e) => n + (e.monthly || 0), 0);
  return `<main class="main is-fixed">
  <div class="bar"><h1>Workspaces</h1><div class="end"><button class="btn">${ic("file-csv")}Export</button><button class="btn btn-primary">${ic("plus")}Set up workspace</button></div></div>
  ${viewTabs([["All", W.entities.length, 1], ["Trial", byState("Trial")], ["Past due", byState("Past due")], ["Read-only", byState("Read-only")], ["Setting up", byState("Setting up")], ["Suspended", byState("Suspended")]])}
  ${filters("Find a workspace", ["Product", "Plan"], `${W.entities.length} workspaces`)}
  <div class="table-shell">
    ${rt({ label: "Workspaces", cols: [["Workspace", "buildings"], ["Product", "stack"], ["Plan", "coins"], ["Standing", "flag"], ["Until", "clock"], ["Members", "users", "end"], ["Owner", "user"], ["Last sign-in", "sign-in", "", "descending"]], rows })}
    ${mobileList(rows)}
    ${tableFoot(`1 to ${W.entities.length} of ${W.entities.length}`, [["Paying", money(mrr) + " a month"], ["Past due or read-only", byState("Past due") + byState("Read-only")]], `<div class="btn-group" role="group" aria-label="Pages"><button class="btn" disabled>${ic("caret-left")}Previous</button><button class="btn" disabled>Next${ic("caret-right")}</button></div>`)}
  </div>
  ${tabbar(TB_G, "Workspaces")}
</main>`;
};
write("workspaces.html", page("Workspaces", `<div class="app has-scope">${sideGlobal("Workspaces")}${scopeGlobal}${workspacesBody()}</div>`));
write("switcher.html", page("Switch context", `<div class="app has-scope">${sideGlobal("Workspaces")}${scopeGlobal}${workspacesBody()}</div>
<div class="switch-pop"><div class="menu" role="menu" aria-label="Switch context">
  <label class="input-wrap" style="margin:var(--space-4)">${ic("magnifying-glass")}<input type="search" aria-label="Open a workspace" placeholder="Open a workspace"><span class="kbd">O</span></label>
  <button class="menu-item" role="menuitemradio" aria-checked="true" data-active="true">${ic("globe-simple")}<span class="grow">All workspaces</span><span class="end">${ic("check")}</span></button>
  <div class="menu-label">Opened today</div>
  ${sw(cw, badge("Trial"))}${sw(ws("zuva-solar"), badge("Past due"))}${sw(ws("mazowe-gold"), badge("Active"))}
  <div class="menu-sep"></div>
  <div class="menu-label">${ME}</div>
  <button class="menu-item" role="menuitem">${ic("password")}Password and authenticator</button>
  <button class="menu-item" role="menuitem">${ic("sign-out")}Sign out</button>
</div></div>`, `.switch-pop{position:fixed;top:56px;left:12px;z-index:20}.switch-pop .menu{width:300px}.switch-pop .menu-item .mark{width:22px;height:22px;border-radius:6px}`));

// ------------------------------------------------------------------ 4. payments and audit log, all workspaces
const payRows = (list, withWs = true) => list.map((p) => { const e = ws(p.workspace); return { name: p.code, cells: [cName(`<span class="mark mark-32" aria-hidden="true">${methodIc(p.method)}</span>`, p.code, `${p.method}${p.kind === "proof" ? ", proof" : ", Pesepay"}`), ...(withWs ? [cLink(e.name)] : []), cText(p.for), cMono(p.from), cMono(p.ref), badge(p.state), cMono(p.at), cMoney(p.amount)], m: [`${p.code} · ${e.name}`, `<span class="c-money">${money(p.amount)}</span>`, `${p.method} · ${p.state} · ${p.at}`] }; });
const toCheck = W.payments.filter((p) => ["Proof to check", "Not confirmed"].includes(p.state)), done = W.payments.filter((p) => !toCheck.includes(p));
const payCols = [["Payment", "receipt"], ["Workspace", "buildings"], ["For", "coins"], ["Paid from", "phone"], ["Reference", "hash"], ["State", "flag"], ["When", "clock", "", "descending"], ["Amount", "money", "end"]];
const pRows = [{ group: "Needs someone", n: toCheck.length }, ...payRows(toCheck), { group: "Done", n: done.length }, ...payRows(done)];
write("payments.html", page("Payments", `<div class="app has-scope">${sideGlobal("Payments")}${scopeGlobal}
<main class="main is-fixed">
  <div class="bar"><h1>Payments</h1><div class="end"><button class="btn">${ic("file-csv")}Export</button></div></div>
  ${viewTabs([["All", W.payments.length, 1], ["Proofs to check", 2], ["Not confirmed", 1], ["Paid", 2], ["Refunded", 0]])}
  ${filters("Find a payment, reference or number", ["Method", "Workspace"], "October 2026")}
  <div class="table-shell">${rt({ label: "Payments", cols: payCols, rows: pRows })}${mobileList(pRows)}
  ${tableFoot(`${W.payments.length} payments`, [["Paid", money(299 + 398)], ["Waiting", money(p1093.amount + p1092.amount + p1091.amount)]])}</div>
  ${tabbar(TB_G, "Payments")}
</main></div>`));

const audRows = (list, withWs = true) => list.map((a) => ({ cells: [cMono(a.at), a.who === "System" || a.who === "Pesepay" ? `<span class="muted">${a.who}</span>` : cLink(a.who), cText(a.did), ...(withWs ? [cLink(a.ws ? ws(a.ws).name : "")] : []), cMono(a.rec), `<span class="c-mono c-empty">${a.hash}</span>`], m: [a.did, `<span class="c-mono muted">${a.at}</span>`, `${a.who}${withWs && a.ws ? " · " + ws(a.ws).name : ""}`] }));
const audCols = (withWs = true) => [["When", "clock", "", "descending"], ["Who", "user"], ["What", "note-pencil"], ...(withWs ? [["Workspace", "buildings"]] : []), ["Record", "hash"], ["Chain", "link"]];
write("audit.html", page("Audit log", `<div class="app has-scope">${sideGlobal("Audit log")}${scopeGlobal}
<main class="main is-fixed">
  <div class="bar"><h1>Audit log</h1><div class="end"><button class="btn">${ic("file-csv")}Export</button></div></div>
  ${viewTabs([["Everything", W.audit.length, 1], ["Sign in as", 3], ["Payments", 3], ["Access", 3], ["Setup", 2]])}
  ${filters("Find by person, workspace or record", ["Operator", "Workspace", "Date"], "Chain checked 14:20, unbroken")}
  <div class="table-shell">${rt({ label: "Audit log", cols: audCols(), rows: audRows(W.audit), trail: "none" })}${mobileList(audRows(W.audit))}
  ${tableFoot(`${W.audit.length} events, today and the last three days`, [], `<button class="btn btn-quiet">${ic("caret-down")}Older</button>`)}</div>
  ${tabbar(TB_G, "More")}
</main></div>`));

// ------------------------------------------------------------------ 5. operators, owners only
const opRows = W.operators.map((o) => ({ name: o.name, cells: [cName(person, o.name, o.email), o.name === "Tafadzwa Mhlanga" ? cText("Owner") : `<select class="select" aria-label="Role for ${o.name}">${["owner", "support", "billing"].map((r) => `<option${r === o.role ? " selected" : ""}>${r[0].toUpperCase() + r.slice(1)}</option>`).join("")}</select>`, badge(o.state === "Active" ? "Authenticator set" : o.state), cMono(o.last)], m: [o.name, badge(o.state === "Active" ? "Authenticator set" : o.state), `${o.role} · ${o.last}`] }));
write("operators.html", page("Operators", `<div class="app has-scope">${sideGlobal("Operators", "Tafadzwa Mhlanga, owner")}${scopeGlobal}
<main class="main">
  <div class="bar"><h1>Operators</h1><div class="end"><button class="btn btn-primary">${ic("user-plus")}Invite operator</button></div></div>
  <div class="table-shell">${rt({ label: "Operators", cols: [["Operator", "user"], ["Role", "identification-badge"], ["Second factor", "fingerprint"], ["Last signed in", "clock"]], rows: opRows, trail: "menu" })}${mobileList(opRows)}
  ${tableFoot(`${W.operators.length} operators`, [["Owners", 1], ["Support", 3], ["Billing", 1]])}</div>
  <div class="roles">
    <section class="form-sec"><header><h2>What each role can do</h2><p>Fixed. A role is a job, not a level.</p></header><div class="body">
      ${W.roles.map((r) => `<div class="role"><b>${r.role[0].toUpperCase() + r.role.slice(1)}</b><p>${(r.can.slice(0, 4).join("; ") + ".").replace(/^./, (c) => c.toUpperCase())}</p>${r.cannot.length ? `<p class="muted">Cannot ${r.cannot.slice(0, 3).join("; ")}.</p>` : ""}</div>`).join("")}
    </div></section>
    <section class="form-sec"><header><h2>Signing in as members</h2><p>Applies to every operator.</p></header><div class="body">
      <label class="setting"><span class="t"><b>Email the workspace owner when anyone signs in as one of their members</b><span>With the reason and a link that ends the session</span></span><input type="checkbox" class="switch" checked aria-label="Email the owner"></label>
      <div class="setting" style="cursor:default"><span class="t"><b>How long a session lasts</b><span>Every sign-in-as ends on its own after this</span></span><select class="select" aria-label="Session length"><option>15 minutes</option><option selected>30 minutes</option><option>60 minutes</option></select></div>
    </div></section>
  </div>
  ${tabbar(TB_G, "More")}
</main></div>`, `.roles{display:flex;flex-direction:column;gap:var(--space-48);padding:var(--space-48) var(--space-24)}
.role{display:flex;flex-direction:column;gap:var(--space-4);padding-bottom:var(--space-12);box-shadow:inset 0 -1px 0 var(--color-line)}.role:last-child{box-shadow:none}.role p{font-size:var(--text-13);text-wrap:pretty;max-width:72ch}
.rt .select{height:28px;width:auto}.setting .select{width:auto;flex:none}
@media (max-width:760px){.form-sec{grid-template-columns:minmax(0,1fr)}.roles{padding:var(--space-32) var(--space-16)}}`));

// ------------------------------------------------------------------ 6. inside a workspace: overview
const ev = (i, html, t, card = "", kind = "") => `<div class="ev"><span class="ev-dot${kind ? " is-" + kind : ""}">${i}</span><div class="ev-text">${html}${card ? `<div class="ev-card">${card}</div>` : ""}</div><time>${t}</time></div>`;
const wsRail = `<aside class="rail" aria-label="Where ${cw.name} stands">
  <section><div class="sec-title">Standing</div><div class="stand">${badge("Trial")}<span class="figure" style="font-size:var(--text-20)">4 days left</span></div><p class="muted" style="font-size:var(--text-13)">Business until 17 Oct, then Free. <a class="link" href="#pay">A proof of $758.40</a> is waiting to be checked.</p>
    <div class="btn-group" role="group" aria-label="Trial" style="display:flex"><button class="btn grow">${ic("hourglass")}Extend trial</button><button class="btn grow">${ic("coins")}Change plan</button></div></section>
  <section><div class="sec-title">Owner</div><dl class="attrs"><dt>Name</dt><dd>Tendai Chikuru</dd><dt>Email</dt><dd class="mono" style="color:var(--link-ink)">tendai@chikurumotors.co.zw</dd><dt>Phone</dt><dd class="mono">078 230 1194</dd></dl></section>
  <section><div class="sec-title">Details</div><dl class="attrs"><dt>Address</dt><dd>chikuru-motors.flare.co.zw</dd><dt>Product</dt><dd>Flare</dd><dt>Set up</dt><dd>29 Sep, by their own signup</dd><dt>Data</dt><dd>214 contacts, 31 deals</dd></dl></section>
</aside>`;
write("ws-overview.html", page(`${cw.name}: overview`, `<div class="app app-3 has-scope">${sideWs("Overview")}${scopeWs}
<main class="main">
  <div class="bar"><h1>Overview</h1><div class="end"><div class="btn-group" role="group" aria-label="Housekeeping"><button class="btn">${ic("pause")}Suspend</button><button class="btn">${ic("file-csv")}Export data</button><button class="btn btn-icon" aria-label="More for ${cw.name}">${ic("dots-three")}</button></div></div></div>
  <div class="feed" style="padding-top:var(--space-8)">
    <div class="feed-day">Today</div>
    ${ev(ic("user-switch"), `<b>Farai Moyo</b> signed in as <b>Rutendo Nyathi</b>, look only, until 14:32`, "14:02", `“WhatsApp from Tendai: Rutendo cannot sign in.” Tendai Chikuru was emailed. <a class="link" href="#sa">SA-214</a>`)}
    ${ev(ic("lock-key"), `<b>Rutendo Nyathi</b> was locked after five wrong codes`, "13:51", "", "warn")}
    ${ev(ic("device-mobile"), `<b>Tendai Chikuru</b> sent proof of an InnBucks payment of <b>$758.40</b>, waiting to be checked`, "10:12", `<a class="link" href="#pay">PAY-1092</a>, for Business, a year at 20% off`)}
    <div class="feed-day">This week</div>
    ${ev(ic("envelope"), `<b>Tendai Chikuru</b> invited <b>Takudzwa Banda</b> as a sales rep. Not opened yet`, "Sat")}
    ${ev(ic("users"), `3 members signed in for the first time`, "3 events")}
    <div class="feed-day">September</div>
    ${ev(ic("lightning"), `Workspace set up from the Flare signup at app.flare.co.zw. Business trial to 17 Oct`, "29 Sep")}
  </div>
  ${tabbar(TB_W, "Overview")}
</main>${wsRail}</div>`, `.stand{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-12)}.feed{padding-left:var(--space-24)}
@media (max-width:760px){.feed{padding-left:var(--space-16);padding-right:var(--space-16)}}`));

// ------------------------------------------------------------------ 7. members, with the row menu open
const mRows = members.map((m) => ({ name: m.name, sel: m.name === "Rutendo Nyathi", menuOpen: m.name === "Rutendo Nyathi", cells: [cName(person, m.name, m.email), cText(m.role), badge(m.state), cMono(m.last.replace(", five wrong codes", "").replace("Invited ", "").replace(", not opened", "")), m.state === "Locked" ? `<span class="muted">Five wrong codes</span>` : m.state === "Invited" ? `<span class="muted">Not opened</span>` : cText("")], m: [m.name, badge(m.state), `${m.role} · ${m.last}`] }));
const memberMenu = `<div class="menu row-menu" role="menu" aria-label="Rutendo Nyathi">
  <div class="menu-label">Rutendo Nyathi</div>
  <button class="menu-item" role="menuitem" data-active="true">${ic("user-switch")}Sign in as…${kbd("S")}</button>
  <button class="menu-item" role="menuitem">${ic("lock-key-open")}Unlock${kbd("U")}</button>
  <button class="menu-item" role="menuitem">${ic("envelope")}Send password reset</button>
  <button class="menu-item" role="menuitem">${ic("sign-out")}Sign out everywhere</button>
  <div class="menu-sep"></div>
  <button class="menu-item" role="menuitem">${ic("identification-badge")}Change role<span class="end muted">Sales rep</span></button>
  <button class="menu-item" role="menuitem">${ic("crown")}Make owner</button>
  <div class="menu-sep"></div>
  <button class="menu-item" role="menuitem">${ic("pause")}Suspend member</button>
  <button class="menu-item menu-item-danger" role="menuitem">${ic("user-minus")}Remove from ${cw.name}…</button>
</div>`;
const membersMain = (withMenu) => `<main class="main is-fixed">
  <div class="bar"><h1>Members</h1><div class="end"><button class="btn">${ic("envelope")}Resend open invites</button><button class="btn btn-primary">${ic("user-plus")}Invite member</button></div></div>
  ${viewTabs([["All", 6, 1], ["Active", 4], ["Locked", 1], ["Invited", 1], ["Suspended", 0]])}
  ${filters(`Find in ${cw.name}`, ["Role"], "6 of 20 seats")}
  <div class="table-shell" style="position:relative">${rt({ label: `Members of ${cw.name}`, cols: [["Member", "user"], ["Role", "identification-badge"], ["State", "flag"], ["Last sign-in", "sign-in", "", "descending"], ["Note", "note-pencil"]], rows: mRows, trail: "menu" })}${mobileList(mRows)}
  ${withMenu ? memberMenu : ""}
  ${tableFoot("6 members", [["Seats", "6 of 20"], ["Locked", 1], ["Invited", 1]])}</div>
  ${tabbar(TB_W, "Members")}
</main>`;
write("ws-members.html", page(`${cw.name}: members`, `<div class="app has-scope">${sideWs("Members")}${scopeWs}${membersMain(true)}</div>`, `.row-menu{position:absolute;top:116px;right:16px;width:260px;z-index:30}@media (max-width:760px){.row-menu{display:none}}`));

// ------------------------------------------------------------------ 8. sign in as, a peek over members
write("ws-sign-in-as.html", page("Sign in as Rutendo Nyathi", `<div class="app has-scope" aria-hidden="true">${sideWs("Members")}${scopeWs}${membersMain(false)}</div>
<div style="position:fixed;inset:0 0 0 auto;display:flex;z-index:10">
  <form class="peek" role="dialog" aria-modal="true" aria-labelledby="sa-title">
    <div class="peek-head"><h2 id="sa-title" class="text-heading">Sign in as Rutendo Nyathi</h2><div class="end"><button type="button" class="btn btn-quiet btn-icon" aria-label="Close">${ic("x")}</button></div></div>
    <div class="peek-body">
      <div style="display:flex;gap:var(--space-12);align-items:center"><span class="avatar avatar-40 avatar-none">${ic("user", "ic-20")}</span><div class="grow"><div class="text-heading">Rutendo Nyathi</div><div class="muted" style="font-size:var(--text-13)">Sales rep at ${cw.name}</div></div>${badge("Locked")}</div>
      <div class="banner banner-warning" style="border-radius:var(--radius-card);box-shadow:none;padding:var(--space-12)">${ic("lock-key")}<span>Locked at 13:51 after five wrong codes. Signing in as her does not unlock her.</span><div class="end"><button type="button" class="btn">${ic("lock-key-open")}Unlock</button></div></div>
      <div class="field"><label for="why">Why</label><textarea class="input" id="why" rows="2">WhatsApp from Tendai: Rutendo cannot sign in</textarea><span class="help">Tendai Chikuru, the owner, sees this in the email and in the workspace's audit log.</span></div>
      <fieldset class="modes" aria-label="What you can do">
        <label class="pay"><input type="radio" name="mode" value="look only" class="sr" checked><span><span style="display:block">Look only</span><span class="meta">See what she sees. Nothing can be changed.</span></span><span class="radio"></span></label>
        <label class="pay"><input type="radio" name="mode" value="with changes" class="sr"><span><span style="display:block">Make changes</span><span class="meta">Fix things inside the product. Every change is written as yours, on her behalf.</span></span><span class="radio"></span></label>
      </fieldset>
      <dl class="attrs"><dt>Ends</dt><dd>After 30 minutes, at <span class="num">14:32</span></dd><dt>You cannot</dt><dd>Change her password, authenticator, email or payment method</dd><dt>The owner</dt><dd>Is emailed now, with a link to end it</dd></dl>
    </div>
    <script>document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => { document.getElementById('sa-go').textContent = 'Sign in as Rutendo, ' + r.value; }));</script>
    <div class="peek-foot"><button type="button" class="btn btn-lg">${ic("x")}Cancel</button><button class="btn btn-primary btn-lg grow">${ic("user-switch")}<span id="sa-go">Sign in as Rutendo, look only</span></button></div>
  </form>
</div>`, `.peek{width:460px}@media (max-width:760px){.peek{width:100vw}}
fieldset.modes{border:0;margin:0;padding:0;min-width:0;display:flex;flex-direction:column;gap:var(--space-8)}
label.pay{cursor:pointer}label.pay:has(input:checked){background:var(--color-accent-tint);box-shadow:0 0 0 1px color-mix(in oklab,var(--color-accent) 36%,transparent)}
label.pay:has(input:checked) .radio{background:var(--color-accent);box-shadow:none}label.pay:has(input:checked) .radio::after{content:"";width:6px;height:6px;border-radius:var(--radius-pill);background:var(--color-accent-ink)}
label.pay:has(input:focus-visible){box-shadow:0 0 0 2px var(--color-surface),0 0 0 4px var(--color-accent)}`));

// ------------------------------------------------------------------ 9. plan and billing
const wsPayRows = payRows(W.payments.filter((p) => p.workspace === cw.code), false);
const addons = W.addons[cw.code];
write("ws-billing.html", page(`${cw.name}: plan and billing`, `<div class="app has-scope">${sideWs("Plan and billing")}${scopeWs}
<main class="main">
  <div class="bar"><h1>Plan and billing</h1><div class="end"><button class="btn">${ic("plus")}Record a payment</button></div></div>
  <div class="sheet">
    <section class="form-sec"><header><h2>Plan</h2><p>What they have now and what happens next.</p></header><div class="body">
      <div class="plan"><div><div class="figure" style="font-size:var(--text-20)">Business, on trial</div><p class="muted" style="font-size:var(--text-13)">$79.00 a month after the trial. Ends 17 Oct; drops to Free unless paid.</p></div><div class="btn-group" role="group" aria-label="Plan"><button class="btn">${ic("hourglass")}Extend trial</button><button class="btn">${ic("coins")}Change plan</button></div></div>
      <div class="setting" style="cursor:default"><span class="t"><b>Seats</b><span>6 used. Each seat over 20 is $5.00 a month.</span></span><span class="stepper"><button class="btn btn-icon" aria-label="One seat fewer">${ic("minus")}</button><span class="mono">20</span><button class="btn btn-icon" aria-label="One seat more">${ic("plus")}</button></span></div>
    </div></section>
    <section class="form-sec"><header><h2>Add-ons</h2><p>Turning one off keeps its data; it returns when turned back on.</p></header><div class="body">
      ${addons.map((a) => `<label class="setting"><span class="t"><b>${a.name}</b><span>${typeof a.price === "number" ? money(a.price) + " a month" : a.price}${a.note ? ". " + a.note : ""}</span></span>${a.state === "Not yet available" ? badge("Not yet available") : `<input type="checkbox" class="switch"${a.state === "On" ? " checked" : ""}${a.price === "Included" ? " disabled" : ""} aria-label="${a.name}">`}</label>`).join("")}
    </div></section>
  </div>
  <div class="group-head"><h2>Payments</h2><span class="sum">1 waiting, ${money(p1092.amount)}</span></div>
  <div class="table-shell">${rt({ label: `Payments from ${cw.name}`, cols: [["Payment", "receipt"], ["For", "coins"], ["Paid from", "phone"], ["Reference", "hash"], ["State", "flag"], ["When", "clock"], ["Amount", "money", "end"]], rows: wsPayRows })}${mobileList(wsPayRows)}</div>
  ${tabbar(TB_W, "Billing")}
</main></div>`, `.sheet{display:flex;flex-direction:column;gap:var(--space-48);padding:var(--space-32) var(--space-24) var(--space-16)}
.plan{display:flex;align-items:center;justify-content:space-between;gap:var(--space-16);flex-wrap:wrap}
.stepper{display:inline-flex;align-items:center;gap:var(--space-12)}.stepper .mono{min-width:24px;text-align:center;color:var(--color-ink)}
@media (max-width:760px){.form-sec{grid-template-columns:minmax(0,1fr)}.sheet{padding:var(--space-24) var(--space-16)}}`));

// ------------------------------------------------------------------ 10. settings: every housekeeping control, in one place
const row = (title, sub, ctl) => `<div class="setting" style="cursor:default"><span class="t"><b>${title}</b><span>${sub}</span></span>${ctl}</div>`;
const settingsMain = `<main class="main">
  <div class="bar"><h1>Settings</h1></div>
  <div class="sheet">
    <section class="form-sec"><header><h2>Name and address</h2><p>Changing the address breaks links people have saved.</p></header><div class="body">
      <div class="field"><label for="nm">Name</label><input class="input" id="nm" value="${cw.name}"></div>
      ${row("Address", `<span class="mono">chikuru-motors.flare.co.zw</span>`, `<button class="btn">${ic("pencil-simple")}Change address</button>`)}
      ${row("Custom domain", "None. They can use their own, such as crm.chikurumotors.co.zw", `<button class="btn">${ic("plus")}Add domain</button>`)}
      ${row("Product", "Flare, set when the workspace was set up. Cannot change.", `<span class="muted">Flare</span>`)}
    </div></section>
    <section class="form-sec"><header><h2>Owner</h2><p>The owner is told whenever staff sign in as one of their members.</p></header><div class="body">
      ${row("Tendai Chikuru", `<span class="mono">tendai@chikurumotors.co.zw</span>`, `<button class="btn">${ic("crown")}Make someone else owner</button>`)}
    </div></section>
    <section class="form-sec"><header><h2>Security</h2><p>For a lost phone, a member who left on bad terms, or a suspected break-in.</p></header><div class="body">
      ${row("Sign every member out", "Everyone signs in again on every device. Nothing else changes.", `<button class="btn">${ic("sign-out")}Sign everyone out</button>`)}
      ${row("Ask every member for a new password", "At their next sign-in. Members who sign in with a code are not affected.", `<button class="btn">${ic("password")}Ask for new passwords</button>`)}
      ${row("Sessions signed in as a member", "1 open: Farai Moyo as Rutendo Nyathi, until 14:32", `<button class="btn">${ic("stop-circle")}End it now</button>`)}
    </div></section>
    <section class="form-sec"><header><h2>Data</h2><p>Exports arrive by a link in your email, valid for 24 hours.</p></header><div class="body">
      ${row("Everything in the workspace", "Contacts, deals, invoices, files and settings, as CSV and JSON in one zip", `<button class="btn">${ic("file-csv")}Export everything</button>`)}
      ${row("The access record", "Every sign-in, and every time staff signed in as a member, with reasons. For a customer or POTRAZ request.", `<button class="btn">${ic("scroll")}Export access record</button>`)}
      ${row("Sample data", "None left. They removed it on 30 Sep.", `<span class="muted">Nothing to remove</span>`)}
    </div></section>
    <section class="form-sec"><header><h2>Standing</h2><p>Both keep every record. Only closing ends the workspace.</p></header><div class="body">
      ${row("Suspend workspace", "Nobody can sign in until it is restored. Use for a security problem, not for money.", `<button class="btn">${ic("pause")}Suspend…</button>`)}
      ${row("Close workspace", "Members lose access now. Data is kept 90 days, then deleted. Owners only.", `<button class="btn btn-danger">${ic("x-circle")}Close workspace…</button>`)}
    </div></section>
  </div>
  ${tabbar(TB_W, "Settings")}
</main>`;
const settingsCss = `.sheet{display:flex;flex-direction:column;gap:var(--space-48);padding:var(--space-32) var(--space-24) var(--space-48);max-width:1040px}
.setting .btn{flex:none}
@media (max-width:760px){.form-sec{grid-template-columns:minmax(0,1fr)}.sheet{padding:var(--space-24) var(--space-16)}.setting{flex-wrap:wrap}.setting .btn{width:100%}}`;
write("ws-settings.html", page(`${cw.name}: settings`, `<div class="app has-scope">${sideWs("Settings", "Tafadzwa Mhlanga, owner")}${scopeWs}${settingsMain}</div>`, settingsCss));

// ------------------------------------------------------------------ 11. closing: the one irreversible housekeeping action asks for the address
write("ws-close.html", page(`Close ${cw.name}`, `<div class="app has-scope" aria-hidden="true">${sideWs("Settings", "Tafadzwa Mhlanga, owner")}${scopeWs}${settingsMain}</div>
<div class="scrim" style="position:fixed">
  <form class="dialog" role="alertdialog" aria-labelledby="cl1" aria-describedby="cl2">
    <div class="dialog-body"><h2 id="cl1">Close ${cw.name}?</h2>
      <p id="cl2">Its 6 members lose access now. Its 214 contacts and 31 deals are kept for 90 days, until 11 Jan 2027, then deleted for good. Tendai Chikuru is emailed an export link.</p>
      <div class="banner banner-warning" style="border-radius:var(--radius-card);box-shadow:none;padding:var(--space-12);margin-top:var(--space-8)">${ic("receipt")}<span>PAY-1092, a proof of $758.40, is still waiting. Reject or confirm it first.</span></div>
      <div class="field" style="margin-top:var(--space-8)"><label for="cf">Type <span class="mono">${cw.code}</span> to close it</label><input class="input mono" id="cf" value="chikuru-mot" autocomplete="off"></div>
    </div>
    <div class="dialog-foot"><button type="button" class="btn">${ic("x")}Keep workspace</button><button class="btn btn-danger" disabled>${ic("x-circle")}Close ${cw.name}</button></div>
  </form>
</div>`, settingsCss + `.dialog{max-width:480px}`));

// ------------------------------------------------------------------ 12. the workspace's own audit log
const wsAud = W.audit.filter((a) => a.ws === cw.code);
write("ws-audit.html", page(`${cw.name}: audit log`, `<div class="app has-scope">${sideWs("Audit log")}${scopeWs}
<main class="main is-fixed">
  <div class="bar"><h1>Audit log</h1><div class="end"><button class="btn">${ic("scroll")}Export access record</button></div></div>
  ${viewTabs([["Everything", wsAud.length, 1], ["Sign in as", 1], ["Payments", 1], ["Access", 2]])}
  ${filters(`Find in ${cw.name}'s log`, ["Who", "Date"], "This workspace only")}
  <div class="table-shell">${rt({ label: `Audit log of ${cw.name}`, cols: audCols(false), rows: audRows(wsAud, false), trail: "none" })}${mobileList(audRows(wsAud, false))}
  ${tableFoot(`${wsAud.length} events since 29 Sep`)}</div>
  ${tabbar(TB_W, "More")}
</main></div>`));

// ------------------------------------------------------------------ the canvas
const frame = (f, label, note) => `<figure class="cv"><figcaption><b>${label}</b><span>${note}</span><a href="${f}" target="_blank" rel="noopener">Open ${ic("caret-right")}</a></figcaption>
  <div class="pair"><div class="desk-f"><iframe src="${f}" title="${label} at desktop width" loading="lazy" tabindex="-1"></iframe></div><div class="phone-f"><iframe src="${f}" title="${label} at phone width" loading="lazy" tabindex="-1"></iframe></div></div></figure>`;
const SECTIONS = [
  ["All workspaces", "The neutral scope bar and the globe in the switcher say you are not inside any workspace. Here you find, and work the queues.", [
    ["home.html", "Home", "Shell B: the queue as an inbox. Each item acts on one workspace, so it wears that workspace’s tinted scope above it."],
    ["switcher.html", "Switching context", "The switcher at the top of the sidebar: all workspaces, the ones opened today, and your own account. O opens a workspace from anywhere."],
    ["workspaces.html", "Workspaces", "The record table from the apps. Opening a row enters that workspace."],
    ["payments.html", "Payments", "Grouped into what needs someone and what is done."],
    ["audit.html", "Audit log", "Every operator action, across every workspace, on an unbroken hash chain."],
    ["operators.html", "Operators", "Owners only. Roles, second factors, sign-in-as rules."],
  ]],
  ["Inside Chikuru Motors", "A tinted scope bar with the workspace’s name, address and standing; the switcher wears the same tint; the sidebar holds only this workspace’s pages. Esc leaves.", [
    ["ws-overview.html", "Overview", "What happened here, from every module, and where it stands."],
    ["ws-members.html", "Members", "Every member action in one row menu. Here: Rutendo, locked."],
    ["ws-sign-in-as.html", "Sign in as", "For anything inside the product. Reason, look only or make changes, 30 minutes, owner told."],
    ["ws-billing.html", "Plan and billing", "Plan, trial, seats, add-ons, and this workspace’s payments."],
    ["ws-settings.html", "Settings", "Every housekeeping control: name and address, owner, security, data, standing."],
    ["ws-close.html", "Closing a workspace", "The one irreversible action. It names what is lost, what is still open, and asks for the address."],
    ["ws-audit.html", "Audit log, this workspace", "The same log, scoped. Exports as the access record."],
  ]],
  ["Getting in", "Password, then an authenticator code.", [
    ["sign-in.html", "Sign in", "Work email and password."],
    ["sign-in-code.html", "Authenticator code", "Every sign-in, unless the computer is trusted for 12 hours."],
  ]],
];
const canvasBody = `<div class="canvas">
<header class="cv-head"><p class="muted">Corelith admin · shell B, with two contexts · ${W.clock.today}</p><h1 class="text-display">You are always either across all workspaces, or inside one</h1>
<p class="lede">Across all workspaces you find people and work the queues. Inside a workspace, every control changes that workspace and nothing else, and the server refuses anything that names another. Work on the customer's own records is done by signing in as one of their members.</p></header>
${SECTIONS.map(([h, d, fs]) => `<section class="cv-sec"><div class="cv-sec-head"><h2>${h}</h2>${d ? `<p class="muted">${d}</p>` : ""}</div>${fs.map(([f, l, n]) => frame(f, l, n)).join("")}</section>`).join("")}
</div>`;
const canvasCss = `
body{background:var(--color-ground)}
.canvas{max-width:1680px;margin:0 auto;padding:var(--space-48) var(--space-32) var(--space-64);display:flex;flex-direction:column;gap:var(--space-64)}
.cv-head{display:flex;flex-direction:column;gap:var(--space-12);max-width:820px}.cv-head .lede{font-size:var(--text-16);text-wrap:pretty}.cv-head h1{text-wrap:balance}
.cv-sec{display:flex;flex-direction:column;gap:var(--space-32)}.cv-sec-head h2{font-size:var(--text-20);font-weight:600;color:var(--color-ink)}.cv-sec-head p{margin-top:var(--space-4);max-width:80ch}
.cv{margin:0;display:flex;flex-direction:column;gap:var(--space-12)}
.cv figcaption{display:flex;gap:var(--space-12);align-items:baseline;font-size:var(--text-13)}.cv figcaption b{font-size:var(--text-14);font-weight:600;white-space:nowrap}.cv figcaption span{color:var(--color-muted);flex:1;min-width:0}
.cv figcaption a{display:inline-flex;align-items:center;gap:var(--space-4);color:var(--color-ink);white-space:nowrap}
.pair{display:grid;grid-template-columns:minmax(0,1fr) 312px;gap:var(--space-24);align-items:start}
.desk-f,.phone-f{position:relative;overflow:hidden;border-radius:var(--radius-card);background:var(--color-surface);box-shadow:var(--shadow-ring);max-width:100%}
.desk-f{aspect-ratio:1440/900}.desk-f iframe{position:absolute;top:0;left:0;width:1440px;height:900px;border:0;transform-origin:0 0;transform:scale(var(--s,0.85))}
.phone-f{width:312px;height:675px}.phone-f iframe{width:390px;height:844px;border:0;transform-origin:0 0;transform:scale(.8)}
@media (max-width:1100px){.pair{grid-template-columns:minmax(0,1fr)}.phone-f{justify-self:center}}
@media (max-width:760px){.canvas{padding:var(--space-24) var(--space-16)}.desk-f{display:none}.cv figcaption{flex-wrap:wrap}}`;
const fit = `<script>const fit=()=>document.querySelectorAll('.desk-f').forEach(d=>d.style.setProperty('--s',d.clientWidth/1440));addEventListener('resize',fit);fit();</script>`;
write("index.html", page("Admin portal shell", canvasBody + fit, canvasCss));
// The canvas as an Artifact page: the publish skeleton supplies doctype, head and body.
fs.writeFileSync(path.join(out, "canvas.html"), fs.readFileSync(path.join(out, "index.html"), "utf8")
  .replace(/^<!doctype html>\n<html[^>]*><head><meta charset="utf-8"><meta name="viewport"[^>]*>/, "")
  .replace("</head><body>", "").replace(/<\/body><\/html>$/, ""));

console.log("built", fs.readdirSync(out).filter((f) => f.endsWith(".html")).join(", "));
