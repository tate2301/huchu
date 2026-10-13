#!/usr/bin/env node
// The Corelith shell, merged: Corelith's two-level sidebar (a rail of modules, then the module's own panel),
// drawn with the clean sidebar. Books and Reports are core modules in every vertical, so they behave alike:
// the same panel, the same toolbar, the same footer. Settings carries Your apps, Integrations and Marketplace.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const plugin = process.env.PLUGIN || "/home/claude/plugins/saas-design";
const { setup, ic, logo, logoIc, money } = await import(path.join(plugin, "_lib.mjs"));
const here = path.dirname(fileURLToPath(import.meta.url));
const { page, write } = setup(here, { font: "inter" });

// ------------------------------------------------------------------ one world: Floorcode, flooring, on CRM with Tender at the showroom
const VN = (s = 16) => `<svg class="vn" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" style="flex:none"><rect width="24" height="24" rx="6" fill="var(--color-ink)"/><path d="M5 12h10" stroke="var(--color-surface)" stroke-width="2.2" stroke-linecap="round"/><path d="M19.5 12 14 8v8z" fill="var(--color-surface)"/><path d="M5 8.5 7.5 12 5 15.5" stroke="var(--color-surface)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const mark = (n, s = 20) => `<img class="pm" src="${n}-mark.svg" alt="" width="${s}" height="${s}">`;
const eco = `<span class="mk" data-lint-ignore="S3"><img src="ecocash-wordmark.png" alt="EcoCash" style="width:80%;height:auto"></span>`;
const kbd = (k) => `<span class="kbd" style="background:transparent;color:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.32)">${k}</span>`;
const rep = [["Concrete", 52, 24], ["Timber boards", 21, 12], ["Existing tiles", 10, 5], ["Not recorded", 3, 1]];
const inv = [["INV-0131", "Chisipite Dental", "Overdue", "warning", "12 days overdue", 1240, 1240], ["INV-0135", "Highlands Guest Lodge", "Overdue", "warning", "5 days overdue", 860, 860], ["INV-0137", "Msasa Motors", "Overdue", "warning", "2 days overdue", 380, 380], ["INV-0142", "Pomona Offices", "Part paid", "", "Due 20 Oct", 1994.22, 1494.22], ["INV-0140", "Borrowdale Brooke Clinic", "Sent", "", "Due 14 Oct", 1750, 1750], ["INV-0141", "Mrs T. Gumbo", "Paid", "success", "Paid 5 Oct, cash", 430, 0], ["INV-0139", "Greystone Park Primary", "Paid", "success", "Paid 2 Oct, transfer", 2980, 0], ["INV-0138", "Avondale Fresh Mart", "Paid", "success", "Paid 30 Sep, EcoCash", 1865, 0], ["INV-0136", "Dr N. Sibanda", "Paid", "success", "Paid 29 Sep, card", 1130, 0]];
const owed = inv.reduce((n, r) => n + r[6], 0), overdue = inv.filter((r) => r[2] === "Overdue").reduce((n, r) => n + r[6], 0);
const shop = 6318.4, invIn = 430 + 2980 + 500, moneyIn = shop + invIn;

// ------------------------------------------------------------------ the shell
const RAIL = [["filter-fill", "Pipeline"], ["calendar-fill", "Site visits"], ["shopping-bag-3-fill", "Showroom"], ["wallet-4-fill", "Books"], ["chart-bar-fill", "Reports"], ["paper-fill", "Documents"]];
const rail = (on) => `<nav class="rail-m" aria-label="Modules">
  <span class="ws-tile" aria-label="Floorcode">${ic("building-2-fill")}</span>
  ${RAIL.map(([i, l]) => `<a class="rm${l === on ? " is-on" : ""}" href="#${l}" aria-label="${l}"${l === on ? ' aria-current="page"' : ""}>${ic(i)}</a>`).join("")}
  <span class="grow"></span>
  <a class="rm${on === "Vane" ? " is-on" : ""}" href="#vane" aria-label="Vane"${on === "Vane" ? ' aria-current="page"' : ""}>${VN(20)}</a>
  <a class="rm${on === "Settings" ? " is-on" : ""}" href="#settings" aria-label="Management"${on === "Settings" ? ' aria-current="page"' : ""}>${ic("settings-3-fill")}</a>
  <span class="me" aria-label="James Nyabadza">${ic("user-3-fill")}</span>
</nav>`;
const pItem = (i, l, o = {}) => `<a class="pn${o.on ? " is-on" : ""}" href="#${l}"${o.on ? ' aria-current="page"' : ""}>${i ? ic(i) : `<span class="pn-dot"></span>`}<span class="truncate">${l}</span>${o.n !== undefined ? `<span class="pn-n">${o.n}</span>` : ""}${o.meta ? `<span class="pn-m">${o.meta}</span>` : ""}</a>`;
const pGroup = (h, items, add = false) => `<div class="pg"><div class="pg-h">${ic("down-fill")}<span>${h}</span>${add ? `<button class="btn btn-quiet btn-icon pg-add" aria-label="Add to ${h}">${ic("add-fill")}</button>` : ""}</div>${items}</div>`;
const panel = (title, body) => `<aside class="panel-m" aria-label="${title}">
  <div class="pm-h"><b>${title}</b><button class="btn btn-quiet btn-icon" aria-label="Hide the panel">${ic("layout-left-line")}</button></div>
  <label class="input-wrap pm-find">${ic("search-line")}<input type="search" aria-label="Search ${title}" placeholder="Search"><span class="kbd">/</span></label>
  <div class="pm-body">${body}</div>
  <div class="pm-foot">${pItem("question-fill", "Help")}${pItem("settings-6-fill", "Management")}</div>
</aside>`;
const topbar = (icon, title, right, asking = false) => `<header class="tb-m"><h1>${ic(icon)}${title}</h1><div class="tb-r"><label class="input-wrap tb-find">${ic("search-line")}<input type="search" aria-label="Search everything" placeholder="Search everything"><span class="kbd">Ctrl K</span></label><button class="btn btn-quiet btn-icon" aria-label="Notifications">${ic("notification-fill")}</button><button class="btn vn-b${asking ? " is-vane" : ""}" aria-pressed="${asking}" aria-label="Vane, 5 for you">${VN()}<span class="ask-l">Vane</span><span class="vn-c">5</span><span class="live-d" aria-hidden="true"></span></button>${right}</div></header>`;
const shell = (railOn, panelHtml, main) => `<div class="sh">${rail(railOn)}${panelHtml}<main class="mn">${main}</main></div>`;
const toolbar = (viewName, filters, extra = "") => `<div class="tools tl-m"><button class="btn">${ic("layout-grid-fill")}${viewName}${ic("down-fill")}</button><label class="input-wrap tl-find">${ic("search-line")}<input type="search" aria-label="Search this list" placeholder="Search this list"></label><button class="btn btn-quiet">${ic("filter-fill")}Filter</button>${filters}<div class="end"><div class="btn-group" role="group" aria-label="This list"><button class="btn">${ic("sort-descending-fill")}Newest first</button><button class="btn">${ic("eye-fill")}Columns</button><button class="btn">${ic("download-2-fill")}Export</button></div>${extra}</div></div>`;
const shellCss = `
body{background:var(--color-surface)}
.live-d{width:8px;height:8px;border-radius:999px;background:var(--color-accent);flex:none;animation:kit-pulse 1.6s var(--motion-ease) infinite}.vn-c{font-size:var(--text-12);color:var(--color-muted);font-variant-numeric:tabular-nums}.is-vane{box-shadow:var(--shadow-ring),inset 0 0 0 1px var(--color-ink)}.rm .vn{width:20px;height:20px}
.sh{display:grid;grid-template-columns:56px 240px minmax(0,1fr);height:100vh}
.rail-m{display:flex;flex-direction:column;align-items:center;gap:var(--space-4);padding:var(--space-12) 0;background:var(--color-ground);box-shadow:inset -1px 0 0 var(--color-line)}
.ws-tile{display:grid;place-items:center;width:40px;height:40px;margin-bottom:var(--space-12);color:var(--color-ink)}.ws-tile .ic{width:20px;height:20px;color:var(--color-ink)}
.rm{display:grid;place-items:center;width:40px;height:40px;border-radius:var(--radius-control);color:var(--color-muted)}.rm .ic{width:20px;height:20px}
.rm.is-on{background:var(--color-surface);color:var(--color-ink);box-shadow:var(--shadow-ring),var(--shadow-raised)}
@media (hover:hover){.rm:not(.is-on):hover{background:var(--color-hover);color:var(--color-ink-2)}}
.me{display:grid;place-items:center;width:32px;height:32px;margin-top:var(--space-8);border-radius:999px;background:var(--color-fill);color:var(--color-muted)}
.panel-m{display:flex;flex-direction:column;min-height:0;background:var(--color-surface);box-shadow:inset -1px 0 0 var(--color-line)}
.pm-h{display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 var(--space-8) 0 var(--space-16)}.pm-h b{font-weight:600;color:var(--color-ink)}
.pm-find{margin:0 var(--space-12) var(--space-12)}
.pm-body{flex:1;overflow:auto;padding:0 var(--space-12);display:flex;flex-direction:column;gap:2px}
.pn{display:flex;align-items:center;gap:var(--space-12);height:36px;padding:0 var(--space-8);border-radius:var(--radius-control);font-size:var(--text-14);color:var(--color-ink-2);text-decoration:none}
.pn .ic{width:16px;height:16px;color:var(--color-muted);flex:none}.pn-n{margin-left:auto;font-size:var(--text-12);color:var(--color-muted);font-variant-numeric:tabular-nums}.pn-m{margin-left:auto;font-size:var(--text-12);color:var(--color-muted)}
.pn.is-on{background:var(--color-fill);color:var(--color-ink);font-weight:500}.pn.is-on .ic{color:var(--color-ink)}
.pn-dot{width:16px;display:grid;place-items:center}.pn-dot::after{content:"";width:6px;height:6px;border-radius:2px;background:var(--color-rule)}
@media (hover:hover){.pn:not(.is-on):hover{background:var(--color-hover)}}
.pg{margin-top:var(--space-16)}.pg-h{display:flex;align-items:center;gap:var(--space-4);height:28px;padding:0 var(--space-4);font-size:var(--text-12);color:var(--color-muted)}.pg-h .ic{width:12px;height:12px}.pg-add{margin-left:auto;width:24px;height:24px}
.pm-foot{padding:var(--space-8) var(--space-12) var(--space-12);box-shadow:inset 0 1px 0 var(--color-line)}
.mn{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:auto}
.tb-m{display:flex;align-items:center;gap:var(--space-12);height:56px;padding:0 var(--space-24);box-shadow:inset 0 -1px 0 var(--color-line);flex:none}
.tb-m h1{display:flex;align-items:center;gap:var(--space-8);font-size:var(--text-16);font-weight:600;color:var(--color-ink)}.tb-m h1 .ic{width:16px;height:16px;color:var(--color-muted)}
.tb-r{margin-left:auto;display:flex;align-items:center;gap:var(--space-8)}.tb-find{width:240px}
.tl-m{gap:var(--space-8)}.tl-find{width:240px}
.mk{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:10px;background:#fff;box-shadow:var(--shadow-ring);flex:none}.mk svg{width:20px;height:20px}.mk>.ic{width:20px;height:20px;color:var(--color-ink-2)}.mi{display:grid;place-items:center;width:40px;height:40px;flex:none}.mi .ic{width:20px;height:20px;color:var(--color-ink-2)}
.pm{border-radius:5px;flex:none}
section + section .group-head{padding-top:var(--space-32)}
@media (max-width:1100px){.sh{grid-template-columns:56px minmax(0,1fr)}.panel-m{display:none}.tb-find{display:none}}
@media (max-width:760px){.sh{grid-template-columns:minmax(0,1fr);height:auto}.rail-m{display:none}.tl-m .end,.tl-find,.tb-m .btn-group,.ask-l,.tb-m .vn-c{display:none}.lede-figure{font-size:var(--text-20)}}`;
const P = (title, body, css = "", script = "") => page(title, body, shellCss + css, script);

// ------------------------------------------------------------------ Reports module
const repPanel = (on) => panel("Reports", `${pItem("home-4-fill", "Overview", { on: on === "Overview" })}${pItem("bulb-fill", "Insights", { on: on === "Insights", n: 3 })}${pItem("chart-bar-fill", "All reports", { on: on === "All reports", n: 9 })}${pItem("user-3-fill", "Yours", { n: 3 })}${pItem("group-3-fill", "Shared with you", { n: 2 })}${pItem("star-fill", "From Corelith", { n: 4 })}
  ${pGroup("Folders", `${pItem("", "Monday meeting", { on: on === "Monday board", n: 2 })}${pItem("", "Fitters", { n: 3 })}${pItem("", "Money", { n: 4 })}`, true)}
  ${pGroup("Build", `${pItem("list-check-fill", "Forms", { n: 3 })}${pItem("paper-fill", "Documents", { n: 2 })}`)}`);
const repRows = [["Monday board", "Board", "Monday meeting", "James, today", "Shared"], ["Accepted quotes by subfloor", "Table", "Fitters", "James, 2 Oct", "Only you"], ["Fitter pay sheet", "Table", "Fitters", "Rudo, 28 Sep", "Shared"], ["Money this month", "Board", "Money", "From Books, updated hourly", "Shared"]];
const builtin = [["Pipeline by stage", "Open deals and their value, by stage"], ["Site visits by fitter", "Visits, quotes drafted and accepted"], ["Takings by day", "From the showroom tills"], ["Owed to you, by age", "From Books"]];
write("reports.html", P("Reports", shell("Reports", repPanel("All reports"), `${topbar("chart-bar-fill", "All reports", `<button class="btn btn-primary">${ic("add-fill")}New report${kbd("N")}</button>`)}
  ${toolbar("All reports", `<button class="btn btn-quiet">${ic("user-3-fill")}Anyone${ic("down-fill")}</button>`)}
  <div class="finding"><p class="lede-figure">9 reports read this workspace. <span class="q">3 are yours, 4 come from Corelith, and 2 are kept up to date by Books.</span></p></div>
  <section aria-labelledby="r1"><div class="group-head"><h2 id="r1">Yours and shared</h2><span class="sum">4</span></div><div class="list">${repRows.map(([n, k, f, w, s]) => `<a class="row rr" href="#${n}"><span class="lead truncate">${n}</span><span class="muted">${k}</span><span class="truncate">${f}</span><span class="muted truncate">${w}</span><span class="muted">${s}</span>${ic("right-fill", "chev")}</a>`).join("")}</div></section>
  <section aria-labelledby="r2"><div class="group-head"><h2 id="r2">From Corelith</h2><span class="sum">4</span></div><div class="list">${builtin.map(([n, d]) => `<div class="row rb"><span class="lead truncate">${n}</span><span class="truncate">${d}</span><span class="a"><button class="btn">${ic("copy-2-fill")}Make it yours</button></span></div>`).join("")}</div></section>`), `
.rr{display:grid;grid-template-columns:minmax(0,1.4fr) 64px minmax(0,1fr) minmax(0,1.2fr) 72px 16px;min-height:52px}
.rb{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,2fr) auto;min-height:52px}.rb .a{display:flex;justify-content:flex-end}
.mn{padding-bottom:var(--space-48)}
@media (max-width:760px){.rr{grid-template-columns:minmax(0,1fr) auto}.rr>:nth-child(n+2):not(.chev):not(:nth-child(5)){display:none}.rr .chev{display:none}.rb{grid-template-columns:minmax(0,1fr) auto}.rb>:nth-child(2){display:none}.rr .lead,.rb .lead{color:var(--color-ink-2);font-weight:400}}`));

const bars = rep.map(([n, v, a], i) => `<div class="share"><span></span><span style="display:flex;align-items:center;gap:var(--space-12)"><span style="width:120px;color:var(--color-ink)">${n}</span><span class="grow"><span class="bar${i === 1 ? " is-key" : ""}" style="display:block;width:${(a / v) * 100}%"></span></span></span><span class="num pct">${Math.round((a / v) * 100)}%</span><span class="num">${a} of ${v}</span></div>`).join("");
const visits = [["Tue 6 Oct", "Mrs Chari", "Tinashe", 27.92, "Concrete", 1041.26, "Sent", ""], ["Tue 6 Oct", "Pomona Offices", "Kuda", 212.4, "Concrete", 8930, "Drafted", ""], ["Mon 5 Oct", "Dr N. Sibanda", "Farai", 48.1, "Timber boards", 2114.5, "Accepted", "success"], ["Mon 5 Oct", "Msasa Motors", "Tinashe", 96, "Concrete", 3480, "Sent", ""], ["Sat 3 Oct", "Mr and Mrs Chari", "Kuda", 31.6, "Existing tiles", 1296.4, "Accepted", "success"], ["Fri 2 Oct", "Highlands Guest Lodge", "Farai", 164.2, "Timber boards", 6720, "Accepted", "success"]];
write("report.html", P("Monday board", shell("Reports", repPanel("Monday board"), `${topbar("chart-bar-fill", "Monday board", `<div class="btn-group" role="group" aria-label="This report"><button class="btn">${ic("group-3-fill")}Share</button><button class="btn">${ic("download-2-fill")}Export</button></div><button class="btn btn-primary">${ic("edit-2-fill")}Edit${kbd("E")}</button>`)}
  <div class="tools"><div class="btn-group" role="group" aria-label="Narrow the board"><button class="btn">${ic("calendar-fill")}Since 1 July${ic("down-fill")}</button><button class="btn">${ic("user-3-fill")}Every fitter${ic("down-fill")}</button><button class="btn">${ic("rows-3-fill")}Every subfloor${ic("down-fill")}</button></div><div class="end"><span>As of 11:48</span></div></div>
  <div class="table-shell"><div class="table-scroll">
  <div class="finding"><p class="lede-figure">86 site visits drafted 71 quotes. <span class="q">42 were accepted, <span class="num">${money(38915)}</span> of <span class="num">${money(61240)}</span> quoted.</span></p></div>
  <section aria-labelledby="w1"><div class="group-head"><h2 id="w1">Accepted, by subfloor</h2><span class="sum">42 of 86</span></div><div style="padding:0 var(--space-24) var(--space-16);max-width:760px">${bars}</div></section>
  <section aria-labelledby="w2"><div class="group-head"><h2 id="w2">Visits</h2><span class="sum">86</span></div><table class="table" data-lint-ignore="D1"><thead><tr><th>Visited</th><th>Customer</th><th>Fitter</th><th class="num">Area</th><th>Subfloor</th><th class="num">Quote</th><th>State</th></tr></thead><tbody>${visits.map(([d, c, f, a, s, q, st, k]) => `<tr><td class="muted">${d}</td><td><span class="cell-lead">${c}</span></td><td>${f}</td><td class="num">${a.toFixed(2)} m²</td><td>${s}</td><td class="num" style="color:var(--color-ink)">${money(q)}</td><td><span class="status${k ? " status-" + k : ""}">${st}</span></td></tr>`).join("")}</tbody></table></section>
  </div><div class="table-foot"><div class="foot-row"><span class="num">1 to 6 of 86</span><span class="foot-sum">Quoted <b>${money(61240)}</b></span><span class="foot-sum">Accepted <b>${money(38915)}</b></span><div class="end"><div class="btn-group" role="group" aria-label="Pages"><button class="btn" disabled>${ic("left-fill")}Previous</button><button class="btn">Next${ic("right-fill")}</button></div></div></div></div></div>`), `
.mn{overflow:hidden}.share{grid-template-columns:0 minmax(0,1fr) 48px 80px;gap:var(--space-12)}.share .bar.is-key{background:var(--color-accent)}
.table td:first-child,.table th:first-child{padding-left:var(--space-24)}
@media (max-width:760px){.mn{overflow:visible}.table{min-width:760px}.table-scroll{overflow-x:auto}.share>span:nth-child(2)>span:first-child{width:96px!important;color:var(--color-ink-2)!important}}`));

// ------------------------------------------------------------------ Books module: the same panel, the same toolbar, the same footer
const bookPanel = (on) => panel("Books", `${pItem("home-4-fill", "Money", { on: on === "Money" })}${pItem("bill-fill", "Invoices", { on: on === "Invoices", n: 3 })}${pItem("cash-fill", "Payments")}${pItem("shopping-bag-3-fill", "Takings", { n: 1 })}${pItem("wallet-4-fill", "Expenses")}${pItem("bank-card-fill", "Bank", { n: 4 })}${pItem("coin-fill", "VAT")}
  ${pGroup("Saved views", `${pItem("", "Overdue", { on: on === "Overdue", meta: "shared" })}${pItem("", "Pomona Offices", { meta: "you" })}${pItem("", "Paid this month", { meta: "shared" })}`, true)}
  ${pGroup("Reports from Books", `${pItem("chart-bar-fill", "Money this month")}${pItem("chart-bar-fill", "Owed to you, by age")}`)}`);
const need = (k, lead, d, act) => `<div class="row need">${k}<div class="t"><span class="lead">${lead}</span><span class="d">${d}</span></div><div class="a">${act}</div></div>`;
const tile = (i) => `<span class="nt">${ic(i)}</span>`;
write("books-money.html", P("Money", shell("Books", bookPanel("Money"), `${topbar("home-4-fill", "Money", `<div class="btn-group" role="group" aria-label="Record"><button class="btn">${ic("camera-2-fill")}Add a receipt</button><button class="btn">${ic("cash-fill")}Record a payment</button></div><button class="btn btn-primary">${ic("add-fill")}New invoice${kbd("N")}</button>`)}
  <div class="mny">
    <div class="mny-main">
      <div class="finding"><p class="lede-figure"><span class="num">${money(moneyIn)}</span> has come in this month. <span class="q"><span class="num">${money(owed)}</span> is owed to you, <span class="num">${money(overdue)}</span> of it overdue.</span></p></div>
      <section aria-labelledby="m0"><div class="group-head"><h2 id="m0">Where it came from</h2><span class="sum">1 to 6 October</span></div><div style="padding:0 var(--space-24)">${[["Showroom sales", "273 sales on the tills", shop, "shopping-bag-3-fill"], ["Invoices", "3 payments on quoted jobs", invIn, "bill-fill"]].map(([n, d, v, i]) => `<div class="share">${tile(i)}<span style="display:flex;align-items:center;gap:var(--space-12)"><span style="width:240px"><span style="color:var(--color-ink)">${n}</span> <span class="muted" style="font-size:var(--text-13)">${d}</span></span><span class="grow"><span class="bar" style="display:block;width:${(v / shop) * 100}%"></span></span></span><span class="num pct">${Math.round((v / moneyIn) * 100)}%</span><span class="num">${money(v)}</span></div>`).join("")}</div></section>
      <section aria-labelledby="m1"><div class="group-head"><h2 id="m1">Needs you</h2><span class="sum">4</span></div><div class="list">
        ${need(tile("shopping-bag-3-fill"), "Monday's cash-up is $12.00 short", "Till 1 counted $420.60 against $432.60 in cash sales.", `<button class="btn">${ic("eye-fill")}Review</button>`)}
        ${need(tile("target-fill"), "A won deal has no invoice", "Borrowdale Brooke Clinic, vinyl in 3 consulting rooms, $6,400.00.", `<button class="btn">${ic("paper-fill")}Write it</button>`)}
        ${need(tile("bill-fill"), "3 invoices are overdue", `${money(overdue)} in all. Chisipite Dental is 12 days late.`, `<button class="btn">${logoIc("whatsapp-icon")}Remind</button>`)}
        ${need(tile("bank-card-fill"), "4 bank lines to match", "CBZ, since Friday.", `<button class="btn">${ic("check-fill")}Match</button>`)}
      </div></section>
    </div>
    <aside class="rail mny-side" aria-label="Position">
      <section><div class="sec-title">In the bank</div><div class="figure">${money(8412.75)}</div><dl class="attrs"><dt>CBZ, USD</dt><dd class="num">${money(7950.3)}</dd><dt>CBZ, ZWG</dt><dd class="num">ZWG 12,393.66</dd><dt>As of</dt><dd>Today 06:00</dd></dl></section>
      <section><div class="sec-title">You owe</div><dl class="attrs"><dt>Halsted Builders</dt><dd class="num">${money(312.4)}</dd><dt>VAT, September</dt><dd class="num">${money(1184.6)}</dd><dt>VAT is due</dt><dd>25 October</dd></dl></section>
    </aside>
  </div>`), `
.mny{display:grid;grid-template-columns:minmax(0,1fr) 320px;flex:1}.mny-main{padding-bottom:var(--space-48)}.mny-side{box-shadow:inset 1px 0 0 var(--color-line)}
.share{grid-template-columns:24px minmax(0,1fr) 48px 104px;gap:var(--space-12)}
.nt{display:grid;place-items:center;width:24px;height:24px;flex:none;color:var(--color-muted)}.nt .ic{width:20px;height:20px}
.need{display:flex;align-items:center;gap:var(--space-12);min-height:64px}.need .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.need .lead{color:var(--color-ink);font-weight:500}.need .d{font-size:var(--text-13);color:var(--color-ink-2)}.need .a{flex:none}
@media (max-width:1100px){.mny{grid-template-columns:minmax(0,1fr)}.mny-side{box-shadow:inset 0 1px 0 var(--color-line)}}
@media (max-width:760px){.share>span:nth-child(2)>span:first-child{width:auto!important}.share .grow,.share .muted{display:none}.need{flex-wrap:wrap}.need .a{width:100%;padding-left:var(--space-32)}}`));

write("books-invoices.html", P("Invoices", shell("Books", bookPanel("Invoices"), `${topbar("bill-fill", "Invoices", `<button class="btn btn-primary">${ic("add-fill")}New invoice${kbd("N")}</button>`)}
  ${toolbar("All invoices", `<button class="btn btn-quiet">${ic("user-3-fill")}Any customer${ic("down-fill")}</button>`)}
  <div class="table-shell"><div class="table-scroll" tabindex="0" aria-label="Invoices">
    <div class="finding"><p class="lede-figure"><span class="num">${money(owed)}</span> is owed to you on 5 invoices. <span class="q">3 are overdue, <span class="num">${money(overdue)}</span> in all.</span></p></div>
    <table class="table"><thead><tr><th class="sel"><label class="check"><input type="checkbox" aria-label="Select every invoice on this page"></label></th><th>Invoice</th><th>Customer</th><th>State</th><th>When</th><th class="num">Total</th><th class="num">Balance</th></tr></thead>
    <tbody>${inv.map(([c, n, s, k, w, t, b], i) => `<tr data-value="${b}"><td class="sel"><label class="check"><input type="checkbox" aria-label="Select ${c}"${i < 3 ? " checked" : ""}></label></td><td><span class="code">${c}</span></td><td><span class="cell-lead">${n}</span></td><td><span class="status${k ? " status-" + k : ""}"${k === "warning" ? ' style="color:var(--color-ink);font-weight:500"' : ""}>${s}</span></td><td class="muted">${w}</td><td class="num">${money(t)}</td><td class="num"${b ? ' style="color:var(--color-ink);font-weight:500"' : ""}>${b ? money(b) : "—"}</td></tr>`).join("")}</tbody></table>
  </div>
  <div class="table-foot" data-selected="true">
    <div class="foot-row foot-sel" role="region" aria-label="Selection"><span><b data-count>3</b> selected</span><span class="foot-sum">Owing <b data-sum>${money(overdue)}</b></span><div class="btn-group" role="group" aria-label="Do with the selection"><button class="btn">${logoIc("whatsapp-icon")}Send reminders</button><button class="btn">${ic("print-fill")}Print statements</button></div><div class="end"><span class="kbd">Esc</span><button class="btn btn-quiet" data-clear>${ic("close-fill")}Clear</button></div></div>
    <div class="foot-row foot-main"><span class="num">1 to 9 of 142</span><span class="foot-sum">Owed <b>${money(owed)}</b></span><span class="foot-sum">Overdue <b>${money(overdue)}</b></span><div class="end"><div class="btn-group" role="group" aria-label="Pages"><button class="btn" disabled>${ic("left-fill")}Previous</button><button class="btn">Next${ic("right-fill")}</button></div></div></div>
  </div></div>`), `.mn{overflow:hidden}@media (max-width:760px){.mn{overflow:visible}.table{min-width:760px}}`, "table.js"));

// ------------------------------------------------------------------ Management: Corelith's own settings tree, drawn with the clean sidebar. Billing (your apps), integrations, marketplace and Claude live here.
const MG = [["People", [["user-3-fill", "Users", 6], ["building-2-fill", "Departments"], ["badge-fill", "Job grades", 4]]], ["Operations", [["map-pin-fill", "Sites"], ["layers-fill", "Sections"]]], ["Shop", [["shopping-bag-3-fill", "Tills"], ["list-check-fill", "Till rules"], ["balance-fill", "Posting"], ["safe-box-fill", "Fiscal device"]]], ["Compliance", [["certificate-fill", "Permits"], ["shield-fill", "Inspections"], ["alert-fill", "Incidents"], ["book-2-fill", "Training"]]], ["Company", [["settings-6-fill", "General"], ["palette-fill", "Branding"], ["paper-fill", "Templates"], ["chart-bar-fill", "Reports"], ["history-fill", "Activity"]]], ["Apps", [["bank-card-fill", "Billing"], ["link-2-fill", "Integrations", 5], ["store-2-fill", "Marketplace"], ["vane", "Vane"]]], ["My account", [["user-4-fill", "Profile"], ["notification-fill", "Notifications"], ["sun-fill", "Appearance"]]]];
const mItem = (i, l, n, on) => `<a class="pn${on ? " is-on" : ""}" href="#${l}"${l === "Inspections" ? ' data-lint-ignore="W1"' : ""}${on ? ' aria-current="page"' : ""}>${i === "vane" ? VN() : ic(i)}<span class="truncate">${l}</span>${n !== undefined ? `<span class="pn-n">${n}</span>` : ""}</a>`;
const mgSide = (on) => `<aside class="mg-side" aria-label="Management">
  <div class="mg-h"><a class="btn btn-quiet btn-icon" href="#back" aria-label="Back to Floorcode">${ic("arrow-left-fill")}</a><b>Management</b></div>
  <label class="input-wrap pm-find">${ic("search-line")}<input type="search" aria-label="Search management" placeholder="Search"><span class="kbd">/</span></label>
  <nav class="pm-body">${MG.map(([h, items]) => `<div class="mg-g"><div class="mg-gh">${h}</div>${items.map(([i, l, n]) => mItem(i, l, n, l === on)).join("")}</div>`).join("")}</nav>
  <div class="mg-foot"><img src="corelith-logo.svg" alt="Corelith" height="16"></div>
</aside><script>document.querySelector(".mg-side .is-on")?.scrollIntoView({block:"center"})</script>`;
const mgTop = (icon, title, right = "") => `<header class="tb-m"><h1>${icon === "vane" ? VN() : ic(icon)}${title}</h1><div class="tb-r">${right}</div></header>`;
const mgCss = `
.mg{display:grid;grid-template-columns:260px minmax(0,1fr);height:100vh}.mg.mg-3{grid-template-columns:260px 380px minmax(0,1fr)}
.mg-side{display:flex;flex-direction:column;min-height:0;background:var(--color-surface);box-shadow:inset -1px 0 0 var(--color-line)}
.mg-h{display:flex;align-items:center;gap:var(--space-8);height:56px;padding:0 var(--space-16) 0 var(--space-8)}.mg-h b{font-weight:600;color:var(--color-ink)}
.mg-g{margin-top:var(--space-16)}.mg-g:first-child{margin-top:var(--space-4)}.mg-gh{height:28px;display:flex;align-items:center;padding:0 var(--space-8);font-size:var(--text-12);color:var(--color-muted)}
.mg-foot{padding:var(--space-16);box-shadow:inset 0 1px 0 var(--color-line)}.mg-foot img{display:block;height:16px;width:auto;opacity:.7}
.mg .pn .ic{width:16px;height:16px}.mg .pn{height:32px}.mg-g{margin-top:var(--space-12)}.ml-h .pn-n{margin-left:0}
@media (max-width:1100px){.mg,.mg.mg-3{grid-template-columns:minmax(0,1fr);height:auto}.mg-side{display:none}.mg-list{box-shadow:inset 0 -1px 0 var(--color-line)}}`;
const MP = (title, body, css = "", script = "") => P(title, body, mgCss + css, script);
const appRow = (m, n, d, right) => `<div class="setting ar">${m}<span class="t"><b>${n}</b><span>${d}</span></span>${right}</div>`;
const on = (t) => `<span class="status status-success">${t}</span>`;
const price = (v, d) => `<span class="pr"><b class="num">${money(v)}</b><span>${d}</span></span>`;

// job grades: the screen he sent, redrawn. Sidebar, the list, the record.
const grades = [["GRD-0001", "Fitter", 2, 4], ["GRD-0002", "Technical coordinator", 3, 0], ["GRD-0003", "Showroom lead", 3, 1], ["GRD-0004", "Director", 5, 1]];
write("management-job-grades.html", MP("Job grades", `<div class="mg mg-3">${mgSide("Job grades")}
  <section class="mg-list" aria-label="Job grades">
    <div class="ml-h"><h1>Job grades <span class="pn-n">4</span></h1><button class="btn btn-quiet btn-icon" aria-label="Search job grades">${ic("search-line")}</button><button class="btn btn-primary">${ic("add-fill")}New${kbd("N")}</button></div>
    <div class="ml-cols"><span>Job grade</span><span>People</span></div>
    <div class="ml-rows">${grades.map(([c, n, , p]) => `<a class="mlr${c === "GRD-0002" ? " is-on" : ""}" href="#${c}"${c === "GRD-0002" ? ' aria-current="true"' : ""}><span class="code">${c}</span><span class="truncate">${n}</span><span class="num">${p}</span></a>`).join("")}</div>
  </section>
  <main class="mg-det" aria-label="Technical coordinator">
    <header class="md-h"><h2>Technical coordinator</h2><button class="btn btn-quiet btn-icon" aria-label="Rename">${ic("edit-2-fill")}</button><div class="tb-r"><button class="btn">${ic("archive-fill")}Retire</button><button class="btn btn-quiet btn-icon" aria-label="More">${ic("more-1-fill")}</button><button class="btn btn-quiet btn-icon" aria-label="Close">${ic("close-fill")}</button></div></header>
    <div class="md-b">
      <section aria-labelledby="d1"><h3 id="d1">Details</h3>
        <div class="kv"><label for="g1">Code</label><input class="input code-in" id="g1" value="GRD-0002" readonly></div>
        <div class="kv"><label for="g2">Rank</label><input class="input" id="g2" value="3" inputmode="numeric"></div>
        <div class="kv"><label for="g3">Status</label><select class="select" id="g3"><option>Active</option><option>Retired</option></select></div>
      </section>
      <section aria-labelledby="d2"><div class="md-sh"><h3 id="d2">People on this grade <span class="pn-n">0</span></h3><button class="btn">${ic("user-add-fill")}Move people</button></div><p class="muted">Nobody is on this grade yet.</p></section>
      <section aria-labelledby="d3"><h3 id="d3">Activity</h3><div class="act"><span class="nt">${ic("add-fill")}</span><span><b>James Nyabadza</b> created this grade</span><span class="muted">5 Oct 2026</span></div><a class="link" href="#log">${ic("history-fill")}The full log</a></section>
    </div>
  </main>
</div>`, `
.mg-list{display:flex;flex-direction:column;min-height:0;box-shadow:inset -1px 0 0 var(--color-line)}
.ml-h{display:flex;align-items:center;gap:var(--space-8);height:56px;padding:0 var(--space-12) 0 var(--space-24)}.ml-h h1{flex:1;display:flex;align-items:center;gap:var(--space-8);font-size:var(--text-16);font-weight:600}
.ml-cols{display:flex;justify-content:space-between;padding:var(--space-8) var(--space-24);font-size:var(--text-12);color:var(--color-muted);box-shadow:inset 0 -1px 0 var(--color-line)}
.ml-rows{padding:var(--space-8) var(--space-12);display:flex;flex-direction:column;gap:2px;overflow:auto}
.mlr{display:grid;grid-template-columns:88px minmax(0,1fr) 32px;align-items:center;gap:var(--space-12);min-height:44px;padding:0 var(--space-12);border-radius:var(--radius-control);color:var(--color-ink-2);text-decoration:none;font-size:var(--text-14)}.mlr .num{text-align:right;color:var(--color-muted)}.mlr .code{font-size:var(--text-12)}
.mlr.is-on{background:var(--color-fill);color:var(--color-ink);font-weight:500}
@media (hover:hover){.mlr:not(.is-on):hover{background:var(--color-hover)}}
.mg-det{display:flex;flex-direction:column;min-width:0;overflow:auto}
.md-h{display:flex;align-items:center;gap:var(--space-4);height:56px;padding:0 var(--space-16) 0 var(--space-32);box-shadow:inset 0 -1px 0 var(--color-line)}.md-h h2{font-size:var(--text-16);font-weight:600}
.md-b{padding:var(--space-32);max-width:640px;display:flex;flex-direction:column;gap:var(--space-48)}
.md-b section{display:flex;flex-direction:column;gap:var(--space-12)}.md-b h3{display:flex;align-items:center;gap:var(--space-8);font-size:var(--text-14);font-weight:600;color:var(--color-ink)}
.md-sh{display:flex;align-items:center;justify-content:space-between}
.kv{display:grid;grid-template-columns:160px minmax(0,320px);align-items:center;gap:var(--space-16)}.kv label{font-size:var(--text-13);color:var(--color-ink-2)}.code-in{font-family:var(--font-mono);font-size:var(--text-13)}
.act{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:var(--space-12);min-height:40px;font-size:var(--text-14)}.act b{font-weight:500;color:var(--color-ink)}
.nt{display:grid;place-items:center;width:24px;height:24px;color:var(--color-muted)}.nt .ic{width:16px;height:16px}
.md-b .link{display:inline-flex;align-items:center;gap:var(--space-8);font-size:var(--text-13)}.md-b .link .ic{width:16px;height:16px}
@media (max-width:760px){.kv{grid-template-columns:minmax(0,1fr)}.md-b{padding:var(--space-24) var(--space-16)}.md-h{padding-left:var(--space-16)}.md-h .tb-r .btn:not(.btn-icon){display:none}}`));

// billing: the apps you have and what they cost
const corInv = [["October 2026", "Paid 1 Oct, EcoCash", 96], ["September 2026", "Paid 1 Sep, EcoCash", 96], ["August 2026", "Paid 1 Aug, EcoCash", 59]];
write("management-billing.html", MP("Billing", `<div class="mg">${mgSide("Billing")}<main class="mn">
  ${mgTop("bank-card-fill", "Billing", `<button class="btn">${ic("download-2-fill")}Statements</button>`)}
  <div class="page" style="max-width:1040px">
    <div class="finding" style="padding:0"><p class="lede-figure">Floorcode pays <span class="num">${money(96)}</span> a month for 2 products. <span class="q">The next payment is on 1 November, by EcoCash.</span></p></div>
    <div class="form-sec"><header><h2>Products</h2><p>What you pay for.</p></header><div class="body" style="gap:0">
      ${appRow(mark("flare", 32), "CRM", "Deals, site visits and quotes. 212 customers", price(59, "a month"))}
      ${appRow(mark("tender", 32), "Tender", "The showroom till. 1 till, 148 products", price(37, "a month"))}
    </div></div>
    <div class="form-sec"><header><h2>Core modules</h2><p>In every workspace, whatever it runs.</p></header><div class="body" style="gap:0">
      ${appRow(`<span class="mi">${ic("wallet-4-fill")}</span>`, "Books", "Money in, owed, the bank and VAT, from your products", on("Included"))}
      ${appRow(`<span class="mi">${ic("chart-bar-fill")}</span>`, "Reports and insights", "Boards and tables over any of your data", on("Included"))}
      ${appRow(`<span class="mi">${ic("paper-fill")}</span>`, "Forms and documents", "What your people fill in and what you send out", on("Included"))}
      ${appRow(`<span class="mi">${VN(20)}</span>`, "Vane", "Watches your products, raises issues and drafts. 1,284 of 5,000 jobs this month", on("Included"))}
    </div></div>
    <div class="form-sec"><header><h2>Add-ons</h2><p>Added to the monthly payment.</p></header><div class="body" style="gap:0">
      ${appRow(mark("shift", 32), "Payroll", "Pay the fitters weekly, with NSSA and PAYE worked out", `${price(19, "a month")}<button class="btn">${ic("add-fill")}Add</button>`)}
      ${appRow(mark("silo", 32), "Stock", "Stores and stock levels across the showroom and vans", `${price(15, "a month")}<button class="btn">${ic("add-fill")}Add</button>`)}
    </div></div>
    <div class="form-sec"><header><h2>Paying</h2><p>Corelith bills on the 1st.</p></header><div class="body" style="gap:0">
      ${appRow(eco, "EcoCash", "077 220 4180, James Nyabadza", `<button class="btn">${ic("edit-2-fill")}Change</button>`)}
      ${corInv.map(([m, d, v]) => appRow(`<span class="mi">${ic("bill-fill")}</span>`, m, d, `<b class="num" style="font-weight:500;color:var(--color-ink)">${money(v)}</b><button class="btn btn-quiet btn-icon" aria-label="Download ${m}">${ic("download-2-fill")}</button>`)).join("")}
    </div></div>
  </div></main></div>`, `.ar .pm{border-radius:8px}.mn{padding-bottom:var(--space-48)}.pr{display:flex;flex-direction:column;align-items:flex-end;min-width:88px}.pr b{font-weight:500;color:var(--color-ink)}.pr span{font-size:var(--text-12);color:var(--color-muted)}
@media (max-width:760px){.ar{flex-wrap:wrap}.ar .t{flex-basis:calc(100% - 56px)}.ar>.btn{margin-left:56px}}`));

const integ = [["Connected", [[logo("whatsapp-icon"), "WhatsApp Business", "Quotes, invoices and reminders go out from 077 220 4180", "Connected"], [logo("google-gmail"), "Gmail", "accounts@floorcode.co.zw", "Connected"], [eco, "EcoCash", "Customers pay invoices from a link", "Connected"], [`<span class="mi">${ic("safe-box-fill")}</span>`, "ZIMRA fiscal device", "Invoices are fiscalised through the showroom's device", "Connected"], [`<span class="mi">${ic("bank-fill")}</span>`, "CBZ statements", "Uploaded weekly. CBZ does not offer a feed yet", "Upload due"]]],
  ["Available", [[logo("google-drive"), "Google Drive", "Keep signed quotes and site photos in a folder per customer"], [logo("google-calendar"), "Google Calendar", "Site visits appear in the fitters' calendars"], [logo("xero"), "Xero", "Send Books to an accountant who uses Xero"], [logo("microsoft-teams"), "Microsoft Teams", "Post won deals and overdue invoices to a channel"]]]];
write("management-integrations.html", MP("Integrations", `<div class="mg">${mgSide("Integrations")}<main class="mn">
  ${mgTop("link-2-fill", "Integrations")}
  <div class="page" style="max-width:1040px">
    <div class="finding" style="padding:0"><p class="lede-figure">5 services are connected. <span class="q">Last week's CBZ statement has not been uploaded, so 4 bank lines wait in Books.</span></p></div>
    ${integ.map(([h, rows]) => `<div class="form-sec"><header><h2>${h}</h2><p>${h === "Connected" ? "Used by your products, core modules and Vane." : "Connect in a minute; disconnect any time."}</p></header><div class="body" style="gap:0">${rows.map(([m, n, d, st]) => appRow(m.startsWith("<svg") ? `<span class="mk" data-lint-ignore="S3">${m}</span>` : m, n, d, st ? (st === "Connected" ? `<span class="status status-success">${st}</span><button class="btn btn-quiet btn-icon" aria-label="Manage ${n}">${ic("more-1-fill")}</button>` : `<span class="status status-warning" style="color:var(--color-ink);font-weight:500">${st}</span><button class="btn">${ic("upload-2-fill")}Upload</button>`) : `<button class="btn">${ic("link-2-fill")}Connect</button>`)).join("")}</div></div>`).join("")}
  </div></main></div>`, `.mn{padding-bottom:var(--space-48)}`));

const mkt = [["For flooring", [["list-check-fill", "Carpet measure", "Form that drafts a carpet quote by the roll width", "Corelith", "Free"], ["paper-fill", "Job sheet with a floor plan", "Document printed for the fitters", "Corelith", "Free"], ["chart-bar-fill", "Fitter week", "Report of visits, quotes and pay by fitter", "Corelith", "Free"]]],
  ["Apps from partners", [[logo("stripe"), "Stripe", "Card payments for customers outside Zimbabwe", "Stripe", "Free to connect"], [logo("hubspot"), "HubSpot", "Bring in contacts and deals from HubSpot", "HubSpot", "Free to connect"], [logo("zapier-icon"), "Zapier", "Connect Floorcode to 6,000 other services", "Zapier", "Paid by Zapier"]]],
  ["Add-ons from Corelith", [[mark("shift", 32), "Payroll", "Weekly pay with NSSA and PAYE", "Corelith", `${money(19)} a month`], [mark("silo", 32), "Stock", "Stores, stock levels and reorders", "Corelith", `${money(15)} a month`]]]];
write("management-marketplace.html", MP("Marketplace", `<div class="mg">${mgSide("Marketplace")}<main class="mn">
  ${mgTop("store-2-fill", "Marketplace")}
  <div class="tools"><div class="seg" role="tablist" aria-label="Kind"><button role="tab" aria-selected="true">Everything</button><button role="tab" aria-selected="false">Forms</button><button role="tab" aria-selected="false">Reports</button><button role="tab" aria-selected="false">Documents</button><button role="tab" aria-selected="false">Apps</button></div><div class="end"><label class="input-wrap" style="width:240px">${ic("search-line")}<input type="search" aria-label="Search the marketplace" placeholder="Search the marketplace"></label></div></div>
  <div class="finding"><p class="lede-figure">Built for flooring, and for the services you already use. <span class="q">Anything added here opens in the same builder, so it can be changed.</span></p></div>
  ${mkt.map(([h, rows], k) => `<section aria-labelledby="k${k}"><div class="group-head"><h2 id="k${k}">${h}</h2><span class="sum">${rows.length}</span></div><div class="list">${rows.map(([m, n, d, by, pr]) => `<div class="row mr2">${m.startsWith("<svg") ? `<span class="mk" data-lint-ignore="S3">${m}</span>` : m.startsWith("<img") ? m : `<span class="mi">${ic(m)}</span>`}<span class="t"><span class="lead truncate">${n}</span><span class="truncate muted">${d}</span></span><span class="muted truncate">${by}</span><span class="muted">${pr}</span><span class="a"><button class="btn">${ic("add-fill")}Add</button></span></div>`).join("")}</div></section>`).join("")}
  </main></div>`, `
.mr2{display:grid;grid-template-columns:40px minmax(0,1fr) 120px 128px auto;gap:var(--space-16);min-height:72px}.mr2 .t{display:flex;flex-direction:column;min-width:0}.mr2 .pm{border-radius:10px;width:40px;height:40px}.mr2 .a{display:flex;justify-content:flex-end}
.mn{padding-bottom:var(--space-48)}
@media (max-width:760px){.mr2{grid-template-columns:40px minmax(0,1fr) auto}.mr2>:nth-child(3),.mr2>:nth-child(4){display:none}.tools .end{display:none}.tools{overflow-x:auto}}`));

// Vane: what it watches, when it works, what it does on its own and what waits for a person
const sw = (id, label, checked, dis = false) => `<input type="checkbox" class="switch" id="${id}" aria-label="${label}"${checked ? " checked" : ""}${dis ? " disabled" : ""}>`;
write("management-vane.html", MP("Vane", `<div class="mg">${mgSide("Vane")}<main class="mn">
  ${mgTop("vane", "Vane", `<button class="btn">${ic("history-fill")}What it did</button>`)}
  <div class="page" style="max-width:1040px">
    <div class="finding" style="padding:0"><p class="lede-figure">Vane finished 1,284 jobs for Floorcode this month. <span class="q">It raised 37 issues, and 29 of its suggestions were taken.</span></p></div>
    <div class="form-sec"><header><h2>What it watches</h2><p>Read only, through the same SQL as Reports.</p></header><div class="body" style="gap:0">
      ${appRow(`<span class="mi">${ic("wallet-4-fill")}</span>`, "Books", "Invoices, payments, the bank and VAT", sw("c1", "Vane watches Books", true))}
      ${appRow(mark("flare", 32), "CRM", "Customers, deals, site visits and quotes", sw("c3", "Vane watches CRM", true))}
      ${appRow(mark("tender", 32), "Tender", "Sales, tills and cash-ups", sw("c4", "Vane watches Tender", true))}
      ${appRow(`<span class="mi">${ic("chart-bar-fill")}</span>`, "Reports", "Every report and the questions behind it", sw("c2", "Vane watches Reports", true))}
      ${appRow(`<span class="mi">${ic("user-3-fill")}</span>`, "People's pay and personal details", "Kept from Vane", sw("c5", "Vane watches pay and personal details", false))}
    </div></div>
    <div class="form-sec"><header><h2>What it does</h2><p>Drafts and plans wait for a person.</p></header><div class="body" style="gap:0">
      ${appRow(`<span class="mi">${ic("alert-fill")}</span>`, "Raise issues", "Short cash-ups, late payers, quotes left waiting, figures that do not add up", sw("c6", "Raise issues", true))}
      ${appRow(`<span class="mi">${ic("list-check-fill")}</span>`, "Break work into plans", "VAT returns, month end, a big job from quote to invoice", sw("c7", "Break work into plans", true))}
      ${appRow(`<span class="mi">${ic("quill-pen-fill")}</span>`, "Draft and match", "Invoices, reminders, bank matches, report questions and insights", sw("c8", "Draft and match", true))}
      ${appRow(`<span class="mi">${ic("send-plane-fill")}</span>`, "Send, pay, save or change", "Never on its own. Someone presses the button each time", `<span class="status">Always asks</span>`)}
    </div></div>
    <div class="form-sec"><header><h2>When it works</h2><p>All day. Quiet hours hold issues back, not work.</p></header><div class="body" style="gap:0">
      ${appRow(`<span class="mi">${ic("time-fill")}</span>`, "Working", "Checks for new records every few minutes", `<span class="live">Now</span>`)}
      ${appRow(`<span class="mi">${ic("moon-fill")}</span>`, "Quiet hours", "Issues found at night wait for the morning", `<select class="select" aria-label="Quiet hours"><option>20:00 to 06:00</option></select>`)}
      ${appRow(`<span class="mi">${ic("user-setting-fill")}</span>`, "Who hears about what", "Money issues to directors and accounts; site visits to the fitter who made them", `<button class="btn">${ic("edit-2-fill")}Change</button>`)}
    </div></div>
    <div class="form-sec"><header><h2>This month</h2><p>Starts again on 1 November.</p></header><div class="body">
      <div class="use"><span><b class="num">1,284</b> of 5,000 jobs</span><span class="muted">26%</span></div><div class="meter"><i style="width:26%"></i></div>
      <p class="muted" style="font-size:var(--text-13)">Vane runs on Claude, made by Anthropic. Anthropic does not train its models on your data.</p>
    </div></div>
  </div></main></div>`, `.ar .pm{border-radius:8px}.ar .select{width:200px;flex:none}.mn{padding-bottom:var(--space-48)}.use{display:flex;justify-content:space-between;font-size:var(--text-14)}.use b{font-weight:600;color:var(--color-ink)}.meter>i{background:var(--color-ink)}.switch:checked{background:var(--color-ink)}`));
// ------------------------------------------------------------------ building a report, in the module layout: rail, outline, canvas, panel on the right, shelf at the bottom
const oi = (icon, label, o = {}) => `<button class="oi${o.on ? " is-on" : ""}"${o.on ? ' aria-current="true"' : ""}>${ic(icon)}<span class="truncate">${label}</span>${o.q ? `<span class="oi-q">${o.q}</span>` : ""}</button>`;
const qSteps = [["table-2-fill", "Start from", "Site visits"], ["link-fill", "Bring in", "the quote each visit drafted"], ["filter-fill", "Keep", "what the Dates, Fitter and Subfloor controls allow"], ["sort-descending-fill", "Sort", "newest first"]];
const rbPage = (outline, shelf) => P("Monday board, building", `<div class="rb2">${rail("Reports")}
  <aside class="panel-m rb-out" aria-label="Outline">
    <div class="pm-h"><b class="truncate">Monday board</b><button class="btn btn-quiet btn-icon" aria-label="Back to all reports">${ic("close-fill")}</button></div>
    <div style="padding:0 var(--space-12) var(--space-12)"><button class="btn" style="width:100%;justify-content:flex-start">${ic("add-fill")}Add a block<span class="kbd" style="margin-left:auto">/</span></button></div>
    <div class="pm-body">
      <div class="pg-h" style="margin-top:0">${ic("down-fill")}<span>On the board</span></div>
      ${outline}
    </div>
  </aside>
  <header class="rb-bar"><div class="seg" role="tablist" aria-label="Mode"><button role="tab" aria-selected="true">${ic("edit-2-fill")}Build</button><button role="tab" aria-selected="false">${ic("eye-fill")}Preview</button></div><div class="tb-r"><span class="saved">${ic("check-fill")}Saved 11:48</span><button class="btn">${ic("group-3-fill")}Share</button><button class="btn btn-primary">${ic("send-plane-fill")}Publish${kbd("Ctrl ↵")}</button></div></header>
  <main class="rb-can" aria-label="The board">
    <div class="rb-board">
      <p class="lede-figure">86 site visits drafted 71 quotes. <span class="q">42 were accepted, <span class="num">${money(38915)}</span> of <span class="num">${money(61240)}</span> quoted.</span></p>
      <div class="btn-group" role="group" aria-label="Narrow the board"><button class="btn">${ic("calendar-fill")}Since 1 July${ic("down-fill")}</button><button class="btn">${ic("user-3-fill")}Every fitter${ic("down-fill")}</button><button class="btn">${ic("rows-3-fill")}Every subfloor${ic("down-fill")}</button></div>
      <div class="rb-cols"><div class="rbk"><h2>Accepted, by subfloor</h2>${bars}</div><div class="rbk"><h2>Average quote</h2><div class="figure">${money(61240 / 71)}</div><p class="muted" style="font-size:var(--text-13)">across 71 quotes drafted from a visit</p></div></div>
      <div class="rbk rb-sel"><span class="sel-tag">${ic("table-2-fill")}Visits</span><table class="table" data-lint-ignore="L3 D1"><thead><tr><th>Visited</th><th>Customer</th><th>Fitter</th><th class="num">Area</th><th class="num">Quote</th><th>State</th></tr></thead><tbody>${visits.slice(0, 3).map(([d, c, f, a, , q, st, k]) => `<tr><td class="muted">${d}</td><td><span class="cell-lead">${c}</span></td><td>${f}</td><td class="num">${a.toFixed(2)} m²</td><td class="num" style="color:var(--color-ink)">${money(q)}</td><td><span class="status${k ? " status-" + k : ""}">${st}</span></td></tr>`).join("")}</tbody></table></div>
    </div>
  </main>
  <aside class="rb-ins" aria-label="Visits table"><div class="tabs" role="tablist" style="padding:0 var(--space-24)"><button class="tab" role="tab" aria-selected="true">Block</button><button class="tab" role="tab" aria-selected="false">Look</button><button class="tab" role="tab" aria-selected="false">When clicked</button></div>
    <div class="rb-pan">
      <div class="field"><label for="t1">Rows from</label><select class="select" id="t1"><option>visits, 86 rows</option></select></div>
      <div class="pl"><div class="pl-h">Columns</div>${[["Visited", "Date"], ["Customer", "Text"], ["Fitter", "Text"], ["Area", "m², 2 places"], ["Quote", "Money"], ["State", "A dot and a word"]].map(([l, f]) => `<label class="prow"><span class="check" style="color:var(--color-ink)"><input type="checkbox" checked aria-label="Show ${l}" data-lint-ignore="C2">${l}</span><span>${f}</span></label>`).join("")}<button class="btn btn-quiet" style="align-self:flex-start">${ic("add-fill")}Add a column</button></div>
      <div class="field"><label for="t2">At the foot</label><select class="select" id="t2"><option>Count, and the sum of Quote</option></select></div>
    </div>
  </aside>
  ${shelf}
</div>`, `
.rb2{display:grid;grid-template-columns:56px 240px minmax(0,1fr) 320px;grid-template-rows:56px minmax(0,1fr) 272px;height:100vh}
.rb2 .rail-m{grid-row:1/-1}.rb-out{grid-row:1/-1}
.rb-bar{grid-column:3/-1;display:flex;align-items:center;padding:0 var(--space-24);box-shadow:inset 0 -1px 0 var(--color-line)}
.oi{display:flex;align-items:center;gap:var(--space-8);width:100%;height:34px;padding:0 var(--space-8);border-radius:var(--radius-control);font-size:var(--text-13);color:var(--color-ink-2);text-align:left}.oi .ic{width:16px;height:16px;color:var(--color-muted);flex:none}.oi-q{margin-left:auto;font-size:var(--text-12);color:var(--color-muted)}
.oi.is-on{background:var(--color-accent-tint);color:var(--color-ink);font-weight:500}.oi.is-on .ic{color:var(--color-accent)}
.rb-can{overflow:auto;background:var(--color-ground)}
.rb-board{max-width:880px;margin:0 auto;padding:var(--space-32) var(--space-32) var(--space-48);display:flex;flex-direction:column;gap:var(--space-24);align-items:flex-start}
.rb-board .lede-figure{font-size:var(--text-20);line-height:var(--leading-20)}
.rb-cols{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:var(--space-16);width:100%}
.rbk{position:relative;width:100%;padding:var(--space-16) var(--space-24);background:var(--color-surface);border-radius:var(--radius-card);box-shadow:var(--shadow-ring);display:flex;flex-direction:column;gap:var(--space-8)}.rbk h2{font-size:var(--text-14);font-weight:600;color:var(--color-ink)}
.rbk .table{margin:calc(var(--space-16) * -1) calc(var(--space-24) * -1);width:calc(100% + var(--space-48))}.rbk .table th{position:static}.rbk .table td:first-child,.rbk .table th:first-child{padding-left:var(--space-24)}
.rb-sel{outline:2px solid var(--color-primary);outline-offset:4px;margin-top:var(--space-16)}
.sel-tag{position:absolute;left:-6px;top:-32px;display:inline-flex;align-items:center;gap:var(--space-4);height:22px;padding:0 var(--space-8);border-radius:4px 4px 4px 0;background:var(--color-primary);color:var(--color-primary-ink);font-size:var(--text-12);font-weight:500}.sel-tag .ic{width:12px;height:12px;color:inherit}
.share{grid-template-columns:0 minmax(0,1fr) 40px 64px;gap:var(--space-8);min-height:36px}.share .bar.is-key{background:var(--color-accent)}
.rb-ins{display:flex;flex-direction:column;min-height:0;box-shadow:inset 1px 0 0 var(--color-line)}.rb-pan{flex:1;overflow:auto;padding:var(--space-24);display:flex;flex-direction:column;gap:var(--space-24)}
.pl{display:flex;flex-direction:column;gap:var(--space-8)}.pl-h{font-size:var(--text-13);font-weight:500;color:var(--color-ink)}
.prow{display:flex;justify-content:space-between;align-items:center;gap:var(--space-12);min-height:36px;font-size:var(--text-13);box-shadow:inset 0 -1px 0 var(--color-line)}.prow>span:last-child{color:var(--color-muted)}
.rb-shelf{grid-column:3/-1;display:grid;grid-template-columns:200px 360px minmax(0,1fr);box-shadow:inset 0 1px 0 var(--color-rule);background:var(--color-surface);min-height:0}
.rb-shelf>*{min-height:0;overflow:auto}.rb-shelf>*+*{box-shadow:inset 1px 0 0 var(--color-line)}
.sh-q{padding:var(--space-12)}.sh-h{display:flex;align-items:center;justify-content:space-between;gap:var(--space-12);height:48px;padding:0 var(--space-16);font-size:var(--text-13)}.sh-h b{font-weight:600;color:var(--color-ink)}
.psteps{list-style:none;margin:0;padding:0 var(--space-8);display:flex;flex-direction:column;gap:2px}.psteps li{display:grid;grid-template-columns:16px minmax(0,1fr);gap:var(--space-12);align-items:center;min-height:36px;padding:var(--space-4) var(--space-8);border-radius:var(--radius-control);font-size:var(--text-13);color:var(--color-ink-2)}.psteps .ic{width:16px;height:16px;color:var(--color-muted)}.psteps b{font-weight:500;color:var(--color-ink)}.psteps li.is-on{background:var(--color-accent-tint)}
.sh-r .table th{position:static}.sh-r .table td,.sh-r .table th{height:32px;font-size:var(--text-13)}.sh-r .table td:first-child,.sh-r .table th:first-child{padding-left:var(--space-16)}
@media (max-width:1100px){.rb2{grid-template-columns:minmax(0,1fr);grid-template-rows:auto;height:auto}.rb-bar .tb-r .btn:not(.btn-primary),.rb-bar .saved{display:none}.rb-board .btn-group{flex-wrap:wrap}.rb-board{padding:var(--space-24) var(--space-16)}.rb2 .rail-m,.rb-out,.rb-ins{display:none}.rb-bar,.rb-shelf{grid-column:1}.rb-shelf{grid-template-columns:minmax(0,1fr)}.sh-q,.sh-r{display:none}.rb-cols{grid-template-columns:minmax(0,1fr)}.rbk{overflow-x:auto}.rbk .table{min-width:560px}}`);
const outA = `${oi("text-fill", "Sentence", { q: "totals" })}${oi("filter-fill", "Dates, fitter, subfloor")}${oi("chart-bar-fill", "By subfloor", { q: "by subfloor" })}${oi("hashtag-fill", "Average quote", { q: "totals" })}${oi("table-2-fill", "Visits", { on: 1, q: "visits" })}`;
const shelfA = `<section class="rb-shelf" aria-label="Questions this board asks">
    <div class="sh-q"><div class="pg-h" style="margin:0 0 var(--space-4)">${ic("down-fill")}<span>Questions</span><button class="btn btn-quiet btn-icon pg-add" aria-label="New question">${ic("add-fill")}</button></div>${oi("table-2-fill", "visits", { on: 1, q: "86" })}${oi("table-2-fill", "by subfloor", { q: "4" })}${oi("table-2-fill", "totals", { q: "1" })}</div>
    <div class="sh-s"><div class="sh-h"><div class="seg" role="tablist" aria-label="Write it as"><button role="tab" aria-selected="true">Steps</button><button role="tab" aria-selected="false">SQL</button></div><button class="btn">${ic("play-fill")}Run</button></div>
      <ol class="psteps">${qSteps.map(([i, v, t], k) => `<li${k === 2 ? ' class="is-on"' : ""}>${ic(i)}<span><b>${v}</b> ${t}</span></li>`).join("")}</ol></div>
    <div class="sh-r"><div class="sh-h"><span><b>86 rows</b> <span class="muted">in 0.06 s, read only</span></span><span class="muted">Showing 4</span></div>
      <table class="table" data-lint-ignore="L3 D1"><thead><tr><th>visited_on</th><th>customer</th><th class="num">area_m2</th><th class="num">total</th></tr></thead><tbody>${visits.slice(0, 4).map(([d, c, , a, , q]) => `<tr><td class="muted">${d}</td><td>${c}</td><td class="num">${a.toFixed(2)}</td><td class="num">${q.toFixed(2)}</td></tr>`).join("")}</tbody></table></div>
  </section>`;
write("report-build.html", rbPage(outA, shelfA));
// ------------------------------------------------------------------ Vane: Corelith's own assistant. Always working across every product: it watches, raises issues, breaks work into plans and drafts. A person sends, saves, pays or changes.
const vrow = (m, l, t) => `<div class="vd">${m}<span class="truncate">${l}</span><span class="muted">${t}</span></div>`;
const vcard = ({ kind, from, head, body, acts }) => `<article class="vc${kind === "Issue" ? " is-issue" : ""}"><div class="vc-k">${ic(kind === "Issue" ? "alert-fill" : "bulb-fill")}<span>${kind}</span>${from ? `<span class="muted">${from}</span>` : ""}<button class="btn btn-quiet btn-icon vc-x" aria-label="Not now">${ic("close-fill")}</button></div><h3>${head}</h3><p>${body}</p><div class="vc-a">${acts}</div></article>`;
const plan = (head, due, steps) => `<article class="vp"><div class="vp-h"><h3>${head}</h3><span class="muted">${due}</span></div><div class="meter"><i style="width:${(steps.filter((s) => s[1] === "done").length / steps.length) * 100}%"></i></div><ol>${steps.map(([t, s, who]) => `<li class="is-${s}">${ic(s === "done" ? "check-circle-fill" : s === "now" ? "loading-fill" : "round-line")}<span>${t}</span><span class="muted">${who}</span></li>`).join("")}</ol></article>`;
const now = (t, of) => `<div class="vn-now"><span class="live-d" aria-hidden="true"></span><span class="truncate">${t}</span><span class="muted">${of}</span></div>`;
const vatPlan = plan("VAT for September", "Due 25 Oct", [["Match the CBZ lines since Friday", "done", "Vane, 3 of 4"], ["Find VAT numbers on 2 receipts", "now", "Vane"], ["Check the return Vane drafted", "todo", "You"], ["File the return on ZIMRA's portal", "todo", "You"]]);
const vanePanel = (body) => `<aside class="ask" aria-label="Vane">
  <div class="ask-h">${VN()}<b>Vane</b><span class="live">Working</span><div class="tb-r"><button class="btn btn-quiet btn-icon" aria-label="Pause Vane">${ic("pause-fill")}</button><button class="btn btn-quiet btn-icon" aria-label="Close Vane">${ic("close-fill")}</button></div></div>
  <div class="ask-b">${body}</div>
  <div class="ask-c"><label class="input-wrap ask-in"><input type="text" aria-label="Give Vane a job" placeholder="Give Vane a job"></label><button class="btn btn-icon" aria-label="Hand it over">${ic("arrow-up-fill")}</button></div>
</aside>`;
const vaneCss = `
.ask{display:flex;flex-direction:column;min-height:0;background:var(--color-surface);box-shadow:inset 1px 0 0 var(--color-line)}
.ask-h{display:flex;align-items:center;gap:var(--space-8);height:56px;padding:0 var(--space-8) 0 var(--space-16);box-shadow:inset 0 -1px 0 var(--color-line);flex:none}.ask-h b{font-weight:600;color:var(--color-ink)}.ask-h .live{margin-left:var(--space-4)}
.ask-b{flex:1;overflow:auto;padding:var(--space-16) var(--space-16) var(--space-24);display:flex;flex-direction:column;gap:var(--space-12)}
.vs{display:flex;align-items:center;gap:var(--space-8);margin-top:var(--space-8);font-size:var(--text-12);color:var(--color-muted)}.vs .pn-n{margin-left:0}
.vn-now{display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:var(--space-8);min-height:32px;font-size:var(--text-13);color:var(--color-ink-2)}.vn-now .muted{font-size:var(--text-12)}
.live-d{width:8px;height:8px;border-radius:999px;background:var(--color-accent);animation:kit-pulse 1.6s var(--motion-ease) infinite}
.vc{display:flex;flex-direction:column;gap:var(--space-4);padding:var(--space-12) var(--space-16) var(--space-16);border-radius:var(--radius-card);box-shadow:var(--shadow-ring);background:var(--color-surface)}
.vc-k{display:flex;align-items:center;gap:var(--space-8);height:28px;font-size:var(--text-12);color:var(--color-ink-2)}.vc-k .ic{width:16px;height:16px;color:var(--color-muted)}.vc.is-issue .vc-k>.ic{color:var(--color-warning)}.vc-x{margin-left:auto;width:28px;height:28px}
.vc h3{font-size:var(--text-14);font-weight:600;color:var(--color-ink)}.vc p{font-size:var(--text-13);line-height:1.5;color:var(--color-ink-2)}.vc-a{display:flex;flex-wrap:wrap;gap:var(--space-8);margin-top:var(--space-8)}
.vp{display:flex;flex-direction:column;gap:var(--space-8);padding:var(--space-12) var(--space-16) var(--space-16);border-radius:var(--radius-card);box-shadow:var(--shadow-ring)}
.vp-h{display:flex;align-items:baseline;justify-content:space-between}.vp-h h3{font-size:var(--text-14);font-weight:600;color:var(--color-ink)}.vp-h .muted{font-size:var(--text-12)}.vp .meter>i{background:var(--color-accent)}
.vp ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}.vp li{display:grid;grid-template-columns:16px minmax(0,1fr) auto;align-items:center;gap:var(--space-8);min-height:32px;font-size:var(--text-13);color:var(--color-ink-2)}.vp li .ic{width:16px;height:16px;color:var(--color-faint)}.vp li.is-done .ic{color:var(--color-success)}.vp li.is-done>span:nth-child(2){color:var(--color-muted)}.vp li.is-now .ic{color:var(--color-accent)}.vp li.is-now>span:nth-child(2){color:var(--color-ink);font-weight:500}.vp li .muted{font-size:var(--text-12)}
.vd{display:grid;grid-template-columns:16px minmax(0,1fr) auto;align-items:center;gap:var(--space-8);min-height:32px;font-size:var(--text-13);color:var(--color-ink-2)}.vd .ic{width:16px;height:16px;color:var(--color-success)}.vd .muted{font-size:var(--text-12)}
.ask-c{display:flex;gap:var(--space-8);padding:var(--space-12) var(--space-16) var(--space-16);box-shadow:inset 0 1px 0 var(--color-line);flex:none}.ask-in{flex:1}
.is-vane{box-shadow:var(--shadow-ring),inset 0 0 0 1px var(--color-ink)}`;
const done = (t, at) => vrow(ic("check-fill"), t, at);

// Books, Money, with Vane open: what it raised, the plan it broke down, what it did overnight
const moneyMain = `<div class="finding"><p class="lede-figure"><span class="num">${money(moneyIn)}</span> has come in this month. <span class="q"><span class="num">${money(owed)}</span> is owed to you, <span class="num">${money(overdue)}</span> of it overdue.</span></p></div>
  <section aria-labelledby="m0"><div class="group-head"><h2 id="m0">Where it came from</h2><span class="sum">1 to 6 October</span></div><div style="padding:0 var(--space-24)">${[["Showroom sales", shop, "shopping-bag-3-fill"], ["Invoices", invIn, "bill-fill"]].map(([n, v, i]) => `<div class="share">${tile(i)}<span style="display:flex;align-items:center;gap:var(--space-12)"><span style="width:140px;color:var(--color-ink)">${n}</span><span class="grow"><span class="bar" style="display:block;width:${(v / shop) * 100}%"></span></span></span><span class="num pct">${Math.round((v / moneyIn) * 100)}%</span><span class="num">${money(v)}</span></div>`).join("")}</div></section>
  <section aria-labelledby="m2"><div class="group-head"><h2 id="m2">In the bank</h2><span class="sum">Today 06:00</span></div><div class="list">${[["CBZ, USD", money(7950.3)], ["CBZ, ZWG", "ZWG 12,393.66"], ["You owe Halsted Builders", money(312.4)], ["VAT for September, due 25 October", money(1184.6)]].map(([n, v]) => `<div class="row"><span class="grow">${n}</span><span class="num" style="color:var(--color-ink)">${v}</span></div>`).join("")}</div></section>`;
write("books-vane.html", P("Money, with Vane", shell("Books", bookPanel("Money"), `${topbar("home-4-fill", "Money", `<button class="btn btn-primary">${ic("add-fill")}New invoice${kbd("N")}</button>`, true)}
  <div class="ba"><div class="mny-main">${moneyMain}</div>
  ${vanePanel(`${now("Reading the CBZ statement Rudo uploaded", "38 of 61 lines")}
    <div class="vs">For you <span class="pn-n">3</span></div>
    ${vcard({ kind: "Suggestion", from: "Books", head: `3 invoices are overdue, ${money(overdue)}.`, body: "Chisipite Dental first: 12 days late, which is later than they usually pay. Let's send the 3 reminders I drafted.", acts: `<button class="btn btn-primary">${logoIc("whatsapp-icon")}Send 3 reminders${kbd("S")}</button><button class="btn">${ic("eye-fill")}Read them first</button>` })}
    ${vcard({ kind: "Issue", from: "Tender", head: "Monday's cash-up was short again.", body: "$12.00 on Till 1, the third time since August, each time on the morning shift. Let's go through that shift's cash sales.", acts: `<button class="btn">${ic("shopping-bag-3-fill")}Show the sales</button>` })}
    ${vcard({ kind: "Suggestion", from: "CRM", head: "A deal was won 4 days ago with no invoice.", body: `Borrowdale Brooke Clinic, vinyl in 3 consulting rooms. I wrote the invoice from the accepted quote, ${money(6400)}. Let's check it and send it.`, acts: `<button class="btn">${ic("paper-fill")}Open the invoice</button>` })}
    <div class="vs">Broken down</div>
    ${vatPlan}
    <div class="vs">Done while you were away</div>
    ${done("Matched 3 bank lines", "06:05")}${done("Drafted 3 reminders", "06:02")}${done("Wrote this week's insights", "06:00")}`)}</div>`), vaneCss + `
.mn{overflow:hidden}.ba{display:grid;grid-template-columns:minmax(0,1fr) 400px;flex:1;min-height:0}.ba>.mny-main{overflow:auto;padding-bottom:var(--space-48)}
.share{grid-template-columns:24px minmax(0,1fr) 48px 104px;gap:var(--space-12)}
.nt{display:grid;place-items:center;width:24px;height:24px;flex:none;color:var(--color-muted)}.nt .ic{width:20px;height:20px}
@media (max-width:1100px){.mn{overflow:visible}.ba{grid-template-columns:minmax(0,1fr)}.ask{box-shadow:inset 0 1px 0 var(--color-line)}}
@media (max-width:760px){.share .grow{display:none}}`));

// Vane's own place: everything it is working on, raised, planned and finished, across every product
const VPANEL = (on) => panel("Vane", `${pItem("bulb-fill", "For you", { on: on === "For you", n: 5 })}${pItem("loading-fill", "Working on", { n: 2 })}${pItem("list-check-fill", "Plans", { n: 1 })}${pItem("check-fill", "Done", { meta: "12 today" })}${pItem("notification-off-fill", "Muted")}
  ${pGroup("Watching", `${pItem("wallet-4-fill", "Books")}${pItem("filter-fill", "Pipeline")}${pItem("calendar-fill", "Site visits")}${pItem("shopping-bag-3-fill", "Showroom")}${pItem("chart-bar-fill", "Reports")}`)}`);
const fy = [["Books", "wallet-4-fill", "Suggestion", `3 invoices are overdue, ${money(overdue)}.`, "Chisipite Dental is later than they usually pay. Let's send the 3 reminders I drafted.", `<button class="btn btn-primary">${logoIc("whatsapp-icon")}Send 3 reminders${kbd("S")}</button><button class="btn">${ic("eye-fill")}Read them first</button>`],
  ["Site visits", "calendar-fill", "Suggestion", `Pomona Offices' quote has waited since Tuesday.`, `Kuda measured 212.40 m² of concrete. The quote is drafted at ${money(8930)}. Let's send it before the weekend.`, `<button class="btn">${ic("send-plane-fill")}Send the quote</button><button class="btn btn-quiet">${ic("eye-fill")}Open it</button>`],
  ["Showroom", "shopping-bag-3-fill", "Issue", "Monday's cash-up was short again.", "$12.00 on Till 1, the third time since August, each time on the morning shift. Let's go through that shift's cash sales.", `<button class="btn">${ic("shopping-bag-3-fill")}Show the sales</button>`],
  ["Pipeline", "filter-fill", "Suggestion", "A deal was won 4 days ago with no invoice.", `Borrowdale Brooke Clinic. I wrote the invoice from the accepted quote, ${money(6400)}. Let's check it and send it.`, `<button class="btn">${ic("paper-fill")}Open the invoice</button>`],
  ["Reports", "chart-bar-fill", "Suggestion", "You narrow the Monday board by fitter every week.", "I wrote a by-fitter question that answers it in one table. Let's add it to the board.", `<button class="btn">${ic("add-fill")}Add to the board</button>`]];
write("vane.html", P("Vane", shell("Vane", VPANEL("For you"), `${topbar("bulb-fill", "For you", `<button class="btn">${ic("pause-fill")}Pause Vane</button>`)}
  <div class="vh">
    <div class="vh-main">
      <div class="finding"><p class="lede-figure">Vane has 5 things for you and is working on 2. <span class="q">It found most of them overnight, across Books, the showroom and site visits.</span></p></div>
      <section aria-labelledby="v1"><div class="group-head"><h2 id="v1">For you</h2><span class="sum">5</span></div><div class="list">${fy.map(([from, i, kind, h, b, a]) => `<div class="row fy${kind === "Issue" ? " is-issue" : ""}"><span class="nt">${ic(i)}</span><div class="t"><span class="k">${kind}, ${from}</span><span class="lead">${h}</span><span class="d">${b}</span><div class="a">${a}</div></div><button class="btn btn-quiet btn-icon" aria-label="Not now">${ic("close-fill")}</button></div>`).join("")}</div></section>
    </div>
    <aside class="ask vh-side" aria-label="What Vane is doing"><div class="ask-b">
      <div class="vs" style="margin-top:0">Working on <span class="pn-n">2</span></div>
      ${now("Reading the CBZ statement Rudo uploaded", "38 of 61")}${now("Finding VAT numbers on 2 receipts", "1 of 2")}
      <div class="vs">Broken down</div>${vatPlan}
      <div class="vs">Done today <span class="pn-n">12</span></div>
      ${done("Matched 3 bank lines", "06:05")}${done("Drafted 3 reminders", "06:02")}${done("Wrote this week's insights", "06:00")}${done("Wrote the Borrowdale Brooke invoice", "05:48")}${done("Checked 14 quotes against the price list", "05:40")}
    </div></aside>
  </div>`), vaneCss + `
.mn{overflow:hidden}.vh{display:grid;grid-template-columns:minmax(0,1fr) 400px;flex:1;min-height:0}.vh-main{overflow:auto;padding-bottom:var(--space-48)}
.fy{display:grid;grid-template-columns:24px minmax(0,1fr) 32px;align-items:start;gap:var(--space-12);padding-top:var(--space-16);padding-bottom:var(--space-16)}
.fy .t{display:flex;flex-direction:column;gap:2px;min-width:0}.fy .k{font-size:var(--text-12);color:var(--color-muted)}.fy .lead{color:var(--color-ink);font-weight:500}.fy .d{font-size:var(--text-13);color:var(--color-ink-2);max-width:64ch}.fy .a{display:flex;flex-wrap:wrap;gap:var(--space-8);margin-top:var(--space-8)}
.fy .nt{display:grid;place-items:center;width:24px;height:24px;color:var(--color-muted)}.fy .nt .ic{width:20px;height:20px}.fy.is-issue .nt{color:var(--color-warning)}
@media (max-width:1100px){.mn{overflow:visible}.vh{grid-template-columns:minmax(0,1fr)}.vh-side{box-shadow:inset 0 1px 0 var(--color-line)}}`));

// Books, Bank: Vane matched the statement overnight; a person accepts each
const lines = [["Fri 2 Oct", "EcoCash merchant settlement 0412", 1412.5, ["shopping-bag-3-fill", "Showroom, EcoCash sales on 1 Oct", "Tender"], "EcoCash pays the tills out the next day. Thursday's EcoCash sales came to the same amount."],
  ["Mon 5 Oct", "Transfer Pomona Offices inv142", 500, ["bill-fill", "INV-0142, Pomona Offices, part payment", "Books"], "The reference names the invoice. It leaves $1,494.22 owing."],
  ["Mon 5 Oct", "Halsted Builders supplies", -312.4, ["wallet-4-fill", "Bill from Halsted Builders, adhesive and screed", "Books"], "Same amount and supplier as the one bill you owe them."],
  ["Tue 6 Oct", "Service fee October", -18, null, "No invoice or bill matches. It looks like CBZ's monthly charge, which you filed under bank charges in September."]];
write("books-bank.html", P("Bank", shell("Books", bookPanel("Bank"), `${topbar("bank-card-fill", "Bank", `<button class="btn btn-primary">${ic("upload-2-fill")}Upload a statement${kbd("U")}</button>`)}
  <div class="tools"><div class="btn-group" role="group" aria-label="Account"><button class="btn">${ic("bank-fill")}CBZ, USD${ic("down-fill")}</button></div><div class="seg" role="tablist" aria-label="Lines"><button role="tab" aria-selected="true">To match <span class="pn-n">4</span></button><button role="tab" aria-selected="false">Matched</button><button role="tab" aria-selected="false">Everything</button></div><div class="end"><button class="btn">${ic("check-fill")}Accept Vane's 3</button></div></div>
  <div class="finding"><p class="lede-figure">4 lines from CBZ since Friday are not matched. <span class="q">Vane matched 3 of them overnight. Nothing is matched until you accept it.</span></p></div>
  <div class="list bk">${lines.map(([d, desc, v, m, why]) => `<div class="row bl">
    <span class="muted">${d}</span>
    <span class="bl-l"><span class="code truncate">${desc}</span><span class="num${v > 0 ? " in" : ""}">${v > 0 ? "+" : "−"}${money(Math.abs(v))}</span></span>
    <span class="bl-ar">${ic("arrow-right-fill")}</span>
    <span class="bl-m">${m ? `<span class="bl-r">${ic(m[0])}<b class="truncate">${m[1]}</b><span class="muted">${m[2]}</span></span>` : `<span class="bl-r">${ic("question-fill")}<b>No match</b></span>`}<span class="bl-w">${VN(16)}${why}</span></span>
    <span class="bl-a">${m ? `<button class="btn">${ic("check-fill")}Accept</button><button class="btn btn-quiet">${ic("search-line")}Choose</button>` : `<button class="btn">${ic("folder-fill")}Bank charges</button><button class="btn btn-quiet">${ic("search-line")}Choose</button>`}</span>
  </div>`).join("")}</div>`), `
.mn{padding-bottom:var(--space-48)}
.bl{display:grid;grid-template-columns:88px minmax(0,1fr) 24px minmax(0,1.3fr) 240px;gap:var(--space-16);align-items:start;padding-top:var(--space-16);padding-bottom:var(--space-16)}
.bl>span:first-child{padding-top:2px}.bl-l{display:flex;flex-direction:column;gap:var(--space-4);min-width:0}.bl-l .code{font-size:var(--text-13)}.bl-l .num{color:var(--color-ink);font-weight:500;align-self:flex-start}.bl-l .in{color:var(--color-success)}
.bl-ar{padding-top:2px}.bl-ar .ic{width:16px;height:16px;color:var(--color-faint)}
.bl-m{display:flex;flex-direction:column;gap:var(--space-4);min-width:0}.bl-r{display:flex;align-items:center;gap:var(--space-8);min-width:0}.bl-r .ic{width:16px;height:16px;color:var(--color-muted);flex:none}.bl-r b{font-weight:500;color:var(--color-ink)}.bl-r .muted{font-size:var(--text-12)}
.bl-w{display:flex;gap:var(--space-8);font-size:var(--text-13);line-height:1.5;color:var(--color-ink-2)}.bl-w svg{flex:none;margin-top:3px}
.bl-a{display:flex;gap:var(--space-4);justify-content:flex-end}
@media (max-width:1100px){.tools .end{display:none}}
@media (max-width:760px){.bl{grid-template-columns:minmax(0,1fr)}.bl-ar{display:none}.tools{overflow-x:auto}}`));

// Reports, Insights: what Vane found in last week's rows
const fit = [["Farai", 26, 13, 12869.6], ["Kuda", 29, 14, 13205.4], ["Tinashe", 31, 15, 12840]];
const hb = (rows, max, key) => rows.map(([n, v, lab], i) => `<div class="hb"><span>${n}</span><span class="grow"><span class="bar${i === key ? " is-key" : ""}" style="display:block;width:${(v / max) * 100}%"></span></span><span class="num">${lab}</span></div>`).join("");
const ins = (h, d, viz, qn, rows, act) => `<article class="ins"><h2>${h}</h2><p>${d}</p><div class="ins-v">${viz}</div><div class="ins-f"><button class="btn btn-quiet">${ic("table-2-fill")}${qn}, ${rows}</button><div class="end">${act}<button class="btn btn-quiet btn-icon" aria-label="Not useful">${ic("thumb-down-2-fill")}</button></div></div></article>`;
const pin = `<button class="btn">${ic("pin-2-fill")}Pin to Monday board</button>`;
write("reports-insights.html", P("Insights", shell("Reports", repPanel("Insights"), `${topbar("bulb-fill", "Insights", `<button class="btn">${ic("time-fill")}Every Monday, 06:00</button>`)}
  <div class="page" style="max-width:880px">
    <div class="finding" style="padding:0"><p class="lede-figure">Vane read last week's site visits, quotes and takings. <span class="q">3 things stood out.</span></p></div>
    ${ins("Timber floors are won more often than concrete.", "57% of timber quotes were accepted since July, against 46% on concrete. Concrete is still most of the work: 52 of 86 visits. Let's look at what the lost concrete quotes have in common.", hb(rep.slice(0, 3).map(([n, v, a]) => [n, a / v, `${Math.round((a / v) * 100)}%`]), 1, 1), "accepted by subfloor", "4 rows", `<button class="btn">${ic("search-line")}Break it down</button>${pin}`)}
    ${ins("Farai's accepted jobs are the largest.", `${money(989.97)} on average, against ${money(943.24)} for Kuda and ${money(856)} for Tinashe. Tinashe makes the most visits and wins the most jobs.`, hb(fit.map(([n, , a, v]) => [n, v / a, money(v / a)]), 1000, 0), "accepted by fitter", "3 rows", pin)}
    ${ins("Monday's cash-up was short for the third time since August.", "Each time on Till 1, in the morning shift. The others balanced. Let's go through that shift's cash sales.", `<div class="list mini-l">${[["Mon 5 Oct", "Till 1", 12], ["Mon 14 Sep", "Till 1", 8.5], ["Mon 24 Aug", "Till 1", 20]].map(([d, t, v]) => `<div class="row"><span class="muted">${d}</span><span>${t}</span><span class="num">−${money(v)}</span></div>`).join("")}</div>`, "cash-ups that did not balance", "3 rows", `<button class="btn">${ic("shopping-bag-3-fill")}Show the sales</button>`)}
  </div>`), `
.mn{padding-bottom:var(--space-48)}.page{display:flex;flex-direction:column;gap:var(--space-16)}
.ins{display:flex;flex-direction:column;gap:var(--space-8);padding:var(--space-24);border-radius:var(--radius-card);box-shadow:var(--shadow-ring)}.ins h2{font-size:var(--text-16);font-weight:600;color:var(--color-ink)}.ins>p{font-size:var(--text-14);color:var(--color-ink-2);max-width:62ch}
.ins-v{padding:var(--space-8) 0}.hb{display:grid;grid-template-columns:120px minmax(0,1fr) 88px;align-items:center;gap:var(--space-12);min-height:32px;font-size:var(--text-13);color:var(--color-ink)}.hb .num{text-align:right;color:var(--color-ink-2)}.hb .bar{height:8px;border-radius:2px;background:var(--color-muted)}.hb .bar.is-key{background:var(--color-accent)}
.mini-l .row{display:grid;grid-template-columns:120px minmax(0,1fr) 88px;min-height:36px;padding:0;font-size:var(--text-13)}.mini-l .num{text-align:right;color:var(--color-ink)}
.ins-f{display:flex;align-items:center;gap:var(--space-8);padding-top:var(--space-8);box-shadow:inset 0 1px 0 var(--color-line)}.ins-f>.btn-quiet{margin-left:calc(var(--space-12) * -1)}.ins-f .end{display:flex;gap:var(--space-8)}
@media (max-width:760px){.ins{padding:var(--space-16)}.hb,.mini-l .row{grid-template-columns:80px minmax(0,1fr) 72px}.ins-f{flex-wrap:wrap}.ins-f .end{margin-left:0;flex-wrap:wrap}}`));

// Building a report: Vane noticed a habit and wrote the question before anyone asked
const fitSteps = [["table-2-fill", "Start from", "Site visits since 1 July"], ["link-fill", "Bring in", "the quote each visit drafted"], ["rows-3-fill", "Group by", "fitter"], ["hashtag-fill", "Count", "visits and accepted quotes, and add up accepted totals"], ["sort-descending-fill", "Sort", "by accepted money, largest first"]];
const shelfB = `<section class="rb-shelf" aria-label="Questions this board asks">
    <div class="sh-q"><div class="pg-h" style="margin:0 0 var(--space-4)">${ic("down-fill")}<span>Questions</span><button class="btn btn-quiet btn-icon pg-add" aria-label="New question">${ic("add-fill")}</button></div>${oi("table-2-fill", "visits", { q: "86" })}${oi("table-2-fill", "by subfloor", { q: "4" })}${oi("table-2-fill", "totals", { q: "1" })}${oi("table-2-fill", "by fitter", { on: 1, q: "3" })}</div>
    <div class="sh-s"><div class="sh-h"><div class="seg" role="tablist" aria-label="Write it as"><button role="tab" aria-selected="true">Steps</button><button role="tab" aria-selected="false">SQL</button></div><button class="btn">${ic("play-fill")}Run</button></div>
      <div class="cl-req"><div class="cl-ans">${VN(16)}<span>You narrow this board by fitter every Monday. I wrote the question; let's keep it and add it as a table.</span></div><div class="cl-act"><button class="btn btn-quiet">${ic("close-fill")}Not now</button><button class="btn">${ic("check-fill")}Keep</button></div></div>
      <ol class="psteps">${fitSteps.map(([i, v, t]) => `<li class="is-new">${ic(i)}<span><b>${v}</b> ${t}</span></li>`).join("")}</ol></div>
    <div class="sh-r"><div class="sh-h"><span><b>3 rows</b> <span class="muted">in 0.04 s, read only</span></span></div>
      <table class="table" data-lint-ignore="L3 D1"><thead><tr><th>fitter</th><th class="num">visits</th><th class="num">accepted</th><th class="num">accepted_total</th></tr></thead><tbody>${[...fit].sort((a, b) => b[3] - a[3]).map(([f, v, a, t]) => `<tr><td>${f}</td><td class="num">${v}</td><td class="num">${a}</td><td class="num">${t.toFixed(2)}</td></tr>`).join("")}</tbody></table>
      <div class="cl-in"><label class="input-wrap">${VN(16)}<input type="text" aria-label="Give Vane a change to make" placeholder="Give Vane a change to make"></label></div></div>
  </section>`;
write("report-build-vane.html", rbPage(outA, shelfB).replace("</style>", `
.cl-req{display:flex;flex-direction:column;gap:var(--space-8);margin:0 var(--space-16) var(--space-12);padding:var(--space-12);border-radius:var(--radius-card);box-shadow:var(--shadow-ring)}
.cl-ans{display:flex;gap:var(--space-8);font-size:var(--text-13);line-height:1.5;color:var(--color-ink-2)}.cl-ans svg{flex:none;margin-top:3px}
.cl-act{display:flex;justify-content:flex-end;gap:var(--space-4)}
.rb2{grid-template-rows:56px minmax(0,1fr) 340px}
.psteps li.is-new{box-shadow:inset 2px 0 0 var(--color-accent);border-radius:0 var(--radius-control) var(--radius-control) 0}
.sh-r{display:flex;flex-direction:column}.sh-r .table{flex:none}.cl-in{margin-top:auto;padding:var(--space-12) var(--space-16)}
</style>`));
console.log("built in one shell");
