#!/usr/bin/env node
// One base for everything a workspace builds: forms, reports and documents, in any vertical.
// The base: a top bar, an outline on the left with one Add button, the thing itself in the middle,
// and one panel on the right for whatever is selected. No palette, no bottom panel.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const plugin = process.env.PLUGIN || "/home/claude/plugins/saas-design";
const { setup, ic, logoIc, nav, money } = await import(path.join(plugin, "_lib.mjs"));
const here = path.dirname(fileURLToPath(import.meta.url));
const { page, write } = setup(here, { font: "inter" });

// ------------------------------------------------------------------ the world, once (Floorcode, and a school on Campus)
const VAT = 0.155;
const rooms = [["Lounge", 5.2, 4.1], ["Passage", 6.0, 1.1]];
const area = rooms.reduce((n, [, l, w]) => n + l * w, 0), run = 31.6, doors = 3;
const up = (q, pack) => Math.ceil(q / pack - 1e-9);
const QL = [["Laminate planks, oak", area, 1.1, 2.22, "packs", 38], ["Underlay", area, 1, 15, "rolls", 24], ["Moisture barrier", area, 1, 20, "rolls", 18], ["Skirting, 2.4 m lengths", run, 1.05, 2.4, "lengths", 6.5], ["Door bars", doors, 1, 1, "bars", 9], ["Fitting", area, 1, 0, "m²", 6]]
  .map(([n, fig, w, pack, unit, price]) => { const qty = pack ? up(fig * w, pack) : Math.round(fig * w * 100) / 100; return { n, qty, unit, price, amt: Math.round(qty * price * 100) / 100 }; });
const sub = QL.reduce((n, l) => n + l.amt, 0), vat = Math.round(sub * VAT * 100) / 100, total = sub + vat;
const m2 = (v) => v.toFixed(2) + " m²";
const forms = [["F1", 142, 81224], ["F2", 138, 74451], ["F3", 131, 63011], ["F4", 125, 71500]].map(([f, n, c]) => ({ f: "Form " + f.slice(1), n, due: n * 650, c }));
const due = forms.reduce((s, x) => s + x.due, 0), got = forms.reduce((s, x) => s + x.c, 0);
const pct = (a, b) => Math.round((a / b) * 100);

// ------------------------------------------------------------------ the base
const mark = (n, s = 20) => `<img class="pm" src="${n}-mark.svg" alt="" width="${s}" height="${s}">`;
const kbd = (k) => `<span class="kbd" style="background:transparent;color:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.32)">${k}</span>`;
const oItem = (icon, label, o = {}) => `<button class="oi${o.on ? " is-on" : ""}${o.sub ? " is-sub" : ""}"${o.on ? ' aria-current="true"' : ""}>${o.sub ? ic("corner-down-right-line", "oi-b") : ""}${ic(icon)}<span class="truncate">${label}</span></button>`;
const oHead = (t) => `<div class="oh">${t}</div>`;
const studio = ({ kind, product, name, back, outline, canvas, canvasCls = "", tabs, panel, sample = "", foot = "" }) => `<div class="st">
  <header class="st-bar">
    <button class="btn btn-quiet btn-icon" aria-label="Back to ${back}">${ic("left-fill")}</button>
    ${mark(product)}<div class="st-name"><b class="truncate">${name}</b><span>${kind}</span></div>
    <div class="seg st-mode" role="tablist" aria-label="Mode"><button role="tab" aria-selected="true">${ic("edit-2-fill")}Build</button><button role="tab" aria-selected="false">${ic("eye-fill")}Preview</button></div>
    <div class="st-end">${sample}<span class="saved">${ic("check-fill")}Saved</span><button class="btn btn-primary">${ic("send-plane-fill")}Publish${kbd("Ctrl ↵")}</button></div>
  </header>
  <aside class="st-out" aria-label="Outline"><button class="btn st-add">${ic("add-fill")}Add<span class="kbd">/</span></button>${outline}</aside>
  <main class="st-can ${canvasCls}" aria-label="${name}">${canvas}${foot}</main>
  <aside class="st-ins" aria-label="Selected"><div class="tabs st-tabs" role="tablist">${tabs.map(([t, on, n]) => `<button class="tab" role="tab" aria-selected="${!!on}">${t}${n !== undefined ? ` <span class="count">${n}</span>` : ""}</button>`).join("")}</div><div class="st-panel">${panel}</div></aside>
</div>`;
const baseCss = `
body{background:var(--color-surface)}
.st{display:grid;grid-template-columns:240px minmax(0,1fr) 320px;grid-template-rows:56px minmax(0,1fr);height:100vh}
.st-bar{grid-column:1/-1;display:flex;align-items:center;gap:var(--space-12);padding:0 var(--space-16) 0 var(--space-8);box-shadow:inset 0 -1px 0 var(--color-line)}
.st-name{display:flex;flex-direction:column;line-height:1.25;min-width:0}.st-name b{font-weight:600;color:var(--color-ink)}.st-name span{font-size:var(--text-12);color:var(--color-muted)}
.st-mode{position:absolute;left:50%;transform:translateX(-50%)}
.st-end{margin-left:auto;display:flex;align-items:center;gap:var(--space-16)}
.pm{border-radius:5px;flex:none}
.st-out{display:flex;flex-direction:column;gap:2px;padding:var(--space-16) var(--space-12);overflow:auto;box-shadow:inset -1px 0 0 var(--color-line)}
.st-add{justify-content:flex-start;margin-bottom:var(--space-16)}.st-add .kbd{margin-left:auto}
.oh{padding:var(--space-16) var(--space-8) var(--space-8);font-size:var(--text-12);color:var(--color-muted)}.oh:first-of-type{padding-top:0}
.oi{display:flex;align-items:center;gap:var(--space-8);height:32px;padding:0 var(--space-8);border-radius:var(--radius-control);font-size:var(--text-13);color:var(--color-ink-2);text-align:left;width:100%}
.oi .ic{width:16px;height:16px;color:var(--color-muted);flex:none}.oi.is-sub{padding-left:var(--space-12)}.oi .oi-b{width:14px;height:14px;color:var(--color-faint)}
.oi.is-on{background:var(--color-accent-tint);color:var(--color-ink);font-weight:500}.oi.is-on .ic:not(.oi-b){color:var(--color-accent)}
@media (hover:hover){.oi:not(.is-on):hover{background:var(--color-hover)}}
.st-can{position:relative;overflow:auto;background:var(--color-ground);display:flex;flex-direction:column}
.st-ins{display:flex;flex-direction:column;min-height:0;box-shadow:inset 1px 0 0 var(--color-line)}
.st-tabs{padding:0 var(--space-24);flex:none}
.st-panel{flex:1;overflow:auto;padding:var(--space-24);display:flex;flex-direction:column;gap:var(--space-24)}
.ph{font-size:var(--text-16);font-weight:600;color:var(--color-ink);letter-spacing:var(--tracking-heading)}
.pl{display:flex;flex-direction:column;gap:var(--space-8)}.pl-h{font-size:var(--text-13);font-weight:500;color:var(--color-ink)}
.prow{display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-12);padding:var(--space-8) 0;font-size:var(--text-13);box-shadow:inset 0 -1px 0 var(--color-line)}.prow:last-child{box-shadow:none}.prow b{font-weight:500;color:var(--color-ink)}.prow span{color:var(--color-muted);text-align:right}
.bound{background:var(--color-accent-tint);border-radius:3px;box-shadow:0 0 0 2px var(--color-accent-tint)}
.sel{position:relative;outline:2px solid var(--color-primary);outline-offset:6px;border-radius:2px}
.sel-tag{position:absolute;left:-8px;top:-34px;display:inline-flex;align-items:center;gap:var(--space-4);height:22px;padding:0 var(--space-8);border-radius:4px 4px 4px 0;background:var(--color-primary);color:var(--color-primary-ink);font-size:var(--text-12);font-weight:500;white-space:nowrap}
.sel-tag .ic{width:12px;height:12px;color:inherit}
@media (max-width:1100px){.st{grid-template-columns:minmax(0,1fr);height:auto;grid-template-rows:56px auto}.st-out,.st-ins,.st-mode,.st-end .saved,.st-end .sample{display:none}}`;
const P = (title, body, css = "") => page(title, body, baseCss + css);

// ------------------------------------------------------------------ 1. form: the site visit, built in the base
const qr = (label, meta, input, fig = "", o = {}) => `<div class="qr${o.on ? " sel" : ""}${o.sub ? " is-sub" : ""}">${o.on ? `<span class="sel-tag">${ic("layout-grid-fill")}Areas, by room</span>` : ""}<div class="qr-l"><span class="qr-q">${label}</span>${meta ? `<span class="qr-m">${meta}</span>` : ""}</div><div class="qr-in">${input}</div>${fig ? `<div class="qr-fig num">${fig}</div>` : ""}</div>`;
let _g = 0; const radios = (opts, on) => { const g = "r" + (++_g); return `<div class="opts" role="radiogroup">${opts.map((o) => `<label class="check"><input type="radio" name="${g}"${o === on ? " checked" : ""} data-lint-ignore="C2">${o}</label>`).join("")}</div>`; };
const formCanvas = `<div class="fpaper">
  <h1 class="text-title">Floor site visit</h1>
  <section class="fs"><h2>Rooms</h2>
    ${qr("Room areas", "Required", `<div class="rooms">${rooms.map(([n, l, w]) => `<div class="rm"><input class="input" aria-label="Room" value="${n}"><input class="input num" aria-label="Length, m" value="${l.toFixed(1)}"><span class="muted">×</span><input class="input num" aria-label="Width, m" value="${w.toFixed(1)}"><span class="num muted">${m2(l * w)}</span></div>`).join("")}<button class="btn btn-quiet" style="align-self:flex-start">${ic("add-fill")}Add a room</button></div>`, m2(area), { on: 1 })}
    ${qr("Subfloor", "Required", radios(["Concrete", "Timber boards", "Existing tiles"], "Concrete"))}
    ${qr("Moisture reading", "When the subfloor is concrete", `<div class="one"><input class="input num" aria-label="Moisture, percent" value="3.4"><span class="muted">%</span></div>`, "3.4%", { sub: 1 })}
  </section>
  <section class="fs"><h2>Finishes</h2>
    ${qr("Skirting wanted", "", radios(["Yes", "No"], "Yes"))}
    ${qr("Wall run", "When skirting is wanted", `<div class="one"><input class="input num" aria-label="Wall run, m" value="${run.toFixed(1)}"><span class="muted">m</span></div>`, run.toFixed(1) + " m", { sub: 1 })}
    ${qr("Doorways", "", `<div class="one"><input class="input num" aria-label="Doorways" value="${doors}"></div>`, String(doors))}
  </section>
</div>`;
const formFoot = `<div class="cfoot"><span>These answers draft a quote of <b class="num">${money(total)}</b>, ${QL.length} lines</span><button class="btn">${ic("paper-fill")}See the quote</button></div>`;
const formOutline = `${oHead("Rooms")}${oItem("layout-grid-fill", "Room areas", { on: 1 })}${oItem("list-check-fill", "Subfloor")}${oItem("thermometer-fill", "Moisture reading", { sub: 1 })}
  ${oHead("Finishes")}${oItem("checkbox-fill", "Skirting wanted")}${oItem("route-fill", "Wall run", { sub: 1 })}${oItem("hashtag-fill", "Doorways")}
  ${oHead("Customer")}${oItem("coin-fill", "Customer's budget")}${oItem("car-fill", "Access and parking")}${oItem("camera-2-fill", "Photo of the room")}`;
const formPanel = `<div class="ph">Room areas</div>
  <div class="field"><label for="f1">Question</label><input class="input" id="f1" value="Room areas"></div>
  <div class="field"><label for="f2">Answered as</label><select class="select" id="f2"><option>Areas, by room, in metres</option></select></div>
  <label class="setting" style="box-shadow:none;padding:0"><span class="t"><b>Required</b><span>A visit cannot finish without it</span></span><input class="switch" type="checkbox" role="switch" checked data-lint-ignore="C2"></label>
  <div class="pl"><div class="pl-h">Feeds the quote</div>${[["Laminate planks, oak", "+10% waste, whole packs of 2.22 m²"], ["Underlay", "whole rolls of 15 m²"], ["Moisture barrier", "if concrete, rolls of 20 m²"], ["Fitting", "$6.00 a m²"]].map(([a, b]) => `<div class="prow"><b>${a}</b><span>${b}</span></div>`).join("")}</div>`;
write("studio-form.html", P("Floor site visit", studio({ kind: "Form, used on site visits", product: "flare", name: "Floor site visit", back: "Build", outline: formOutline, canvas: formCanvas, foot: formFoot, tabs: [["Question", 1], ["Data", 0, 6], ["Settings", 0]], panel: formPanel }), `
.fpaper{width:100%;max-width:680px;margin:0 auto;padding:var(--space-48) var(--space-48) var(--space-64);display:flex;flex-direction:column;gap:var(--space-48)}
.fs{display:flex;flex-direction:column;gap:var(--space-48)}.fs h2{margin-bottom:var(--space-8)}.fs h2{font-size:var(--text-16);font-weight:600;color:var(--color-ink)}
.qr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--space-12) var(--space-24);align-items:start}.qr-l{display:flex;align-items:baseline;gap:var(--space-8);grid-column:1}.qr-q{font-weight:500;color:var(--color-ink)}.qr-m{font-size:var(--text-12);color:var(--color-muted)}
.qr-in{grid-column:1}.qr-fig{grid-column:2;grid-row:1;font-weight:600;color:var(--color-ink)}
.qr.is-sub{padding-left:var(--space-24);box-shadow:inset 2px 0 0 var(--color-line)}
.rooms{display:flex;flex-direction:column;gap:var(--space-8)}.rm{display:grid;grid-template-columns:minmax(0,1fr) 72px 12px 72px 88px;align-items:center;gap:var(--space-8);font-size:var(--text-13)}.rm .input.num,.one .input{text-align:right}.rm>.num{text-align:right}
.one{display:flex;align-items:center;gap:var(--space-8)}.one .input{width:96px}
.opts{display:flex;flex-wrap:wrap;gap:var(--space-8) var(--space-24)}
.cfoot{position:sticky;bottom:0;margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:var(--space-16);padding:var(--space-12) var(--space-24);background:var(--color-surface);box-shadow:0 -1px 0 var(--color-line);font-size:var(--text-14)}.cfoot b{font-weight:600;color:var(--color-ink)}
@media (max-width:760px){.fpaper{padding:var(--space-24) var(--space-16)}.rm{grid-template-columns:minmax(0,1fr) 56px 12px 56px}.rm>.num:last-child{display:none}.cfoot>span{font-size:var(--text-13)}}`));

// ------------------------------------------------------------------ 2. report: a school's fees board, the same base in another vertical
const steps = [["table-2-fill", "Start from", "Pupils on the roll this term"], ["link-fill", "Bring in", "fees billed and paid"], ["rows-3-fill", "Group by", "form"], ["chart-bar-fill", "Work out", "billed, paid, share paid"], ["filter-fill", "Narrow by", "the Term and House controls"]];
const boardCanvas = `<div class="board">
  <p class="lede-figure"><span class="num">${money(got)}</span> of <span class="num">${money(due)}</span> in fees is in. <span class="q">That is ${pct(got, due)}%. Form 3 is behind, at ${pct(forms[2].c, forms[2].due)}%.</span></p>
  <div class="btn-group" role="group" aria-label="Narrow the board"><button class="btn">${ic("calendar-fill")}Third term${ic("down-fill")}</button><button class="btn">${ic("home-3-fill")}Every house${ic("down-fill")}</button></div>
  <div class="bcols">
    <div class="sel bblk">${`<span class="sel-tag">${ic("chart-bar-fill")}Bars</span>`}<h2>Paid, by form</h2>${forms.map((x, i) => `<div class="share"><span></span><span style="display:flex;align-items:center;gap:var(--space-12)"><span style="width:72px;color:var(--color-ink)">${x.f}</span><span class="grow"><span class="bar${i === 2 ? " is-key" : ""}" style="display:block;width:${pct(x.c, x.due)}%"></span></span></span><span class="num pct">${pct(x.c, x.due)}%</span><span class="num">${money(x.c)}</span></div>`).join("")}</div>
    <div class="bblk"><h2>Still owed</h2><div class="figure">${money(due - got)}</div><p class="muted" style="font-size:var(--text-13)">by 97 families. 41 have paid nothing this term.</p></div>
  </div>
  <div class="bblk"><h2>Most owed</h2><table class="table" data-lint-ignore="L3 D1"><thead><tr><th>Family</th><th>Pupils</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Owed</th></tr></thead><tbody>${[["Moyo", "Tanaka, F3; Rufaro, F1", 1300, 0], ["Chari", "Rumbidzai, F3", 650, 0], ["Ncube", "Farai, F2; Thando, F4", 1300, 650], ["Dube", "Nyasha, F1", 650, 150]].map(([f, p, b, pd]) => `<tr><td><span class="cell-lead">${f}</span></td><td class="muted">${p}</td><td class="num">${money(b)}</td><td class="num">${money(pd)}</td><td class="num" style="color:var(--color-ink);font-weight:500">${money(b - pd)}</td></tr>`).join("")}</tbody></table></div>
</div>`;
const boardOutline = `${oHead("Board")}${oItem("text-fill", "Sentence")}${oItem("filter-fill", "Term and house")}${oItem("chart-bar-fill", "Paid, by form", { on: 1 })}${oItem("hashtag-fill", "Still owed")}${oItem("table-2-fill", "Most owed")}
  ${oHead("Questions it asks")}${oItem("table-2-fill", "Fees by form")}${oItem("table-2-fill", "Families owing")}`;
const boardPanel = `<div class="ph">Fees by form</div>
  <div class="pl"><div class="pl-h">Steps</div><ol class="psteps">${steps.map(([i, v, t]) => `<li>${ic(i)}<span><b>${v}</b> ${t}</span></li>`).join("")}</ol><button class="btn btn-quiet" style="align-self:flex-start">${ic("add-fill")}Add a step</button></div>
  <div class="pl"><div class="prow"><b>Written as SQL</b><span>11 lines</span></div><button class="btn" style="align-self:flex-start">${ic("code-fill")}Show the SQL</button></div>
  <div class="pl"><div class="pl-h">Last run</div><div class="prow"><b>4 rows</b><span>0.05 s, read only</span></div></div>`;
write("studio-report.html", P("Fees this term", studio({ kind: "Report, shared with the bursar", product: "campus", name: "Fees this term", back: "Reports", outline: boardOutline, canvas: boardCanvas, tabs: [["Block", 0], ["Data", 1], ["Settings", 0]], panel: boardPanel, sample: `<span class="muted sample" style="font-size:var(--text-13)">Mazowe High, as of today</span>` }), `
.board{width:100%;max-width:1000px;margin:0 auto;padding:var(--space-48);display:flex;flex-direction:column;gap:var(--space-32);align-items:flex-start}
.board .lede-figure{max-width:760px}
.bcols{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:var(--space-24);width:100%}
.bblk{width:100%;padding:var(--space-24);background:var(--color-surface);border-radius:var(--radius-card);box-shadow:var(--shadow-ring);display:flex;flex-direction:column;gap:var(--space-12)}.bblk h2{font-size:var(--text-14);font-weight:600;color:var(--color-ink)}
.bblk .table{margin:0 calc(var(--space-24) * -1) calc(var(--space-24) * -1);width:calc(100% + var(--space-48))}.bblk .table th{position:static}.bblk .table td:first-child,.bblk .table th:first-child{padding-left:var(--space-24)}.bblk .table td:last-child,.bblk .table th:last-child{padding-right:var(--space-24)}
.share{grid-template-columns:0 minmax(0,1fr) 40px 96px;gap:var(--space-12)}.share .bar.is-key{background:var(--color-accent)}
.psteps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}.psteps li{display:grid;grid-template-columns:16px minmax(0,1fr);gap:var(--space-12);align-items:center;min-height:36px;font-size:var(--text-13);color:var(--color-ink-2);box-shadow:inset 0 -1px 0 var(--color-line)}.psteps .ic{width:16px;height:16px;color:var(--color-muted)}.psteps b{font-weight:500;color:var(--color-ink)}
@media (max-width:760px){.board{padding:var(--space-24) var(--space-16)}.bcols{grid-template-columns:minmax(0,1fr)}.bblk .table{min-width:560px}.bblk{overflow-x:auto}}`));

// ------------------------------------------------------------------ 3. document: the quote Floorcode sends, designed in the base
const b = (v) => `<span class="bound">${v}</span>`;
const docCanvas = `<div class="desk2"><article class="a4" data-lint-ignore="S2">
  <div class="a4-top"><div><div class="a4-brand">Floorcode</div><div>12 Coventry Road, Workington, Harare</div><div>VAT 220093114</div></div><div class="a4-t"><h2>Quotation</h2><div>${b("QUO-0319")}</div></div></div>
  <div class="a4-cols"><div><div class="k">For</div><div class="v">${b("Mrs Chari")}</div><div>${b("14 Fife Avenue, Harare")}</div></div><div style="text-align:right"><div class="k">Date</div><div class="v">${b("6 October 2026")}</div><div class="k" style="margin-top:var(--space-8)">Valid until</div><div class="v">${b("5 November 2026")}</div></div></div>
  <div class="sel" style="outline-offset:8px"><span class="sel-tag">${ic("table-2-fill")}Lines table</span><table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>${QL.map((l) => `<tr><td>${l.n}</td><td class="r">${l.unit === "m²" ? l.qty.toFixed(2) : l.qty} ${l.unit}</td><td class="r">${l.price.toFixed(2)}</td><td class="r">${money(l.amt, "")}</td></tr>`).join("")}</tbody></table></div>
  <div class="a4-sums"><div><span>Subtotal</span><span>${b(money(sub, ""))}</span></div><div><span>VAT 15.5%</span><span>${b(money(vat, ""))}</span></div><div class="t"><span>Total</span><span>${b(money(total))}</span></div></div>
  <div class="a4-foot"><div><div class="k">Measured on site</div><div>${b("27.92 m² in 2 rooms, by Tinashe, 6 October")}</div></div><div><div class="k">Accept by signing</div><div class="sig"></div></div></div>
</article></div>`;
const docOutline = `${oHead("Page")}${oItem("building-2-fill", "Letterhead")}${oItem("user-3-fill", "Customer")}${oItem("calendar-fill", "Number and dates")}${oItem("table-2-fill", "Lines table", { on: 1 })}${oItem("hashtag-fill", "Totals")}${oItem("ruler-fill", "Measured on site")}${oItem("signature-fill", "Signature")}`;
const docPanel = `<div class="ph">Lines table</div>
  <div class="field"><label for="d1">Rows from</label><select class="select" id="d1"><option>The quote's lines</option></select></div>
  <div class="pl"><div class="pl-h">Columns</div>${[["Item", "line name"], ["Qty", "with its unit"], ["Price", "2 places"], ["Amount", "money"]].map(([a, c]) => `<label class="prow" style="align-items:center"><span class="check" style="color:var(--color-ink)"><input type="checkbox" checked aria-label="Show ${a}" data-lint-ignore="C2">${a}</span><span>${c}</span></label>`).join("")}</div>
  <label class="setting" style="box-shadow:none;padding:0"><span class="t"><b>Repeat the header on each page</b><span>For quotes longer than a page</span></span><input class="switch" type="checkbox" role="switch" data-lint-ignore="C2"></label>`;
write("studio-document.html", P("Quotation", studio({ kind: "Document, sent with every quote", product: "flare", name: "Quotation", back: "Build", outline: docOutline, canvas: docCanvas, tabs: [["Element", 1], ["Data", 0, 14], ["Settings", 0]], panel: docPanel, sample: `<button class="btn sample">${ic("eye-fill")}Showing QUO-0319${ic("down-fill")}</button>` }), `
.desk2{padding:var(--space-48);display:flex;justify-content:center}
.a4{width:620px;min-height:877px;padding:var(--space-48);background:var(--color-surface);box-shadow:var(--shadow-ring),0 16px 32px -16px rgba(38,37,31,.16);font-size:var(--text-12);color:var(--color-ink-2);display:flex;flex-direction:column;gap:var(--space-32)}
.a4-top{display:flex;justify-content:space-between;align-items:flex-start}.a4-brand{font-size:var(--text-16);font-weight:600;color:var(--color-ink);margin-bottom:var(--space-4)}
.a4-t{text-align:right}.a4-t h2{font-size:var(--text-20);font-weight:600;color:var(--color-ink);letter-spacing:var(--tracking-title)}
.a4-cols{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-24)}.a4 .k{font-size:var(--text-12);color:var(--color-muted);margin-bottom:2px}.a4 .v{color:var(--color-ink);font-weight:500}
.a4 table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}.a4 th{text-align:left;font-weight:500;color:var(--color-muted);font-size:var(--text-12);padding:var(--space-8) 0;box-shadow:inset 0 -1px 0 var(--color-rule)}.a4 td{padding:var(--space-8) 0;box-shadow:inset 0 -1px 0 var(--color-line)}.a4 .r{text-align:right}
.a4-sums{margin-left:auto;width:220px;display:flex;flex-direction:column;gap:var(--space-4);font-variant-numeric:tabular-nums}.a4-sums div{display:flex;justify-content:space-between}.a4-sums .t{padding-top:var(--space-8);margin-top:var(--space-4);box-shadow:inset 0 1px 0 var(--color-rule);font-size:var(--text-14);font-weight:600;color:var(--color-ink)}
.a4-foot{margin-top:auto;display:grid;grid-template-columns:1fr 200px;gap:var(--space-24);align-items:end}.sig{height:32px;box-shadow:inset 0 -1px 0 var(--color-rule)}
@media (max-width:760px){.desk2{padding:var(--space-16)}.a4{width:100%;min-height:0;padding:var(--space-24)}}`));

// ------------------------------------------------------------------ 4. the module's home in a workspace: one list for all three kinds
const side = (on) => `<aside class="side" aria-label="Main">
  <button class="ws" aria-label="Switch workspace or person">${ic("building-2-fill", "ic-20")}<span class="t"><span class="n truncate">Floorcode</span><span class="p truncate">James Nyabadza, owner</span></span>${ic("selector-vertical-fill")}</button>
  <div class="side-find"><label class="input-wrap">${ic("search-line")}<input type="search" aria-label="Search" placeholder="Search"><span class="kbd">/</span></label></div>
  ${[["target-fill", "Deals"], ["group-3-fill", "Customers"], ["calendar-fill", "Site visits", { n: 4 }], ["paper-fill", "Quotes"]].map(([i, l, o]) => nav(i, l, { ...o, on: l === on })).join("")}
  <div class="nav-head">Workspace</div>${[["tool-fill", "Build"]].map(([i, l]) => nav(i, l, { on: l === on })).join("")}
  <div class="side-foot"><img src="corelith-logo.svg" alt="Corelith" height="14"><a class="nav" style="margin-left:auto" href="#settings" aria-label="Settings">${ic("settings-3-fill")}</a></div>
</aside>`;
const items = [
  ["Forms", [["list-check-fill", "Floor site visit", "On site visits", "86 visits since 1 July", "Live", "success"], ["list-check-fill", "Website enquiry", "On floorcode.co.zw", "214 enquiries", "Live", "success"], ["list-check-fill", "Commercial survey", "On site visits", "Edited yesterday", "Draft", ""]]],
  ["Reports", [["chart-bar-fill", "Monday board", "Shared with the office", "Opened 22 times", "Live", "success"], ["chart-bar-fill", "Accepted quotes by subfloor", "Only you", "Edited 2 Oct", "Live", "success"]]],
  ["Documents", [["paper-fill", "Quotation", "Sent with every quote", "71 sent since July", "Live", "success"], ["paper-fill", "Job sheet", "Printed for the fitters", "Edited 28 Sep", "Live", "success"]]]];
write("build-home.html", P("Build", `<div class="app">
${side("Build")}
<main class="main">
  <div class="bar"><h1>Build</h1><div class="end"><button class="btn btn-primary">${ic("add-fill")}New${kbd("N")}</button></div></div>
  <div class="finding"><p class="lede-figure">7 things built in this workspace. <span class="q">Forms collect, reports read back, documents go out. All three are edited the same way.</span></p></div>
  ${items.map(([h, rows], k) => `<section aria-labelledby="h${k}"><div class="group-head"><h2 id="h${k}">${h}</h2><span class="sum">${rows.length}</span></div><div class="list">${rows.map(([i, n, where, use, st, sk]) => `<a class="row bh" href="#${n}"><span class="bh-i">${ic(i)}</span><span class="lead truncate">${n}</span><span class="truncate">${where}</span><span class="muted truncate">${use}</span><span class="status${sk ? " status-" + sk : ""}">${st}</span>${ic("right-fill", "chev")}</a>`).join("")}</div></section>`).join("")}
  <section aria-labelledby="hs"><div class="group-head"><h2 id="hs">Start from, for flooring</h2><span class="sum">3</span></div><div class="list">${[["list-check-fill", "Carpet measure", "Form"], ["chart-bar-fill", "Fitter week", "Report"], ["paper-fill", "Invoice from a quote", "Document"]].map(([i, n, k]) => `<div class="row bs"><span class="bh-i">${ic(i)}</span><span class="truncate" style="color:var(--color-ink)">${n}</span><span class="muted">${k}</span><span class="a"><button class="btn">${ic("copy-2-fill")}Use it</button></span></div>`).join("")}</div></section>
</main></div>`, `
section + section .group-head{padding-top:var(--space-32)}
.bh{display:grid;grid-template-columns:16px minmax(0,1.3fr) minmax(0,1.2fr) minmax(0,1.2fr) 80px 16px;min-height:52px}.bh-i .ic{width:16px;height:16px;color:var(--color-muted)}
.bs{display:grid;grid-template-columns:16px minmax(0,1fr) 96px auto;min-height:52px}.bs .a{display:flex;justify-content:flex-end}
main{padding-bottom:var(--space-48)}
@media (max-width:760px){.bh{grid-template-columns:16px minmax(0,1fr) auto}.bh>:nth-child(3),.bh>:nth-child(4),.bh .chev{display:none}.bs{grid-template-columns:16px minmax(0,1fr) auto}.bs>:nth-child(3){display:none}.lede-figure{font-size:var(--text-20)}.bh .lead{color:var(--color-ink-2);font-weight:400}}`));
console.log("built 4 on one base; quote", money(total), "fees", money(got), "of", money(due));
