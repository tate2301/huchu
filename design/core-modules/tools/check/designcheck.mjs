// Compare a board with the built page: what the board shows that the page lacks, and how the page lays out.
//
//   node design/core-modules/tools/check/designcheck.mjs <Board> <url> [--state state.json] [--shot out.png] [--390]
//   <url> is on the workspace's host, e.g. http://floorcode.apps.pagka.local:3100/books/invoices
//
// <Board> is a name in boards/view (or a path). <url> is the running app's page.
// It lists the board's headings, buttons (with their shortcut), tabs, filters, column headers,
// panel items, field labels and status words, finds each on the page, and prints the score.
// Data (figures, dates, names in table cells) is left out: the page shows real data.
// Then it checks the page at 1440 (and 390 with --390) for tables that overflow, headers that wrap,
// cells that spill and a page that scrolls sideways. --shot writes board | page side by side.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../../../package.json"));
const { chromium } = require("@playwright/test");

const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const state = flag("--state") || process.env.DC_STATE;
const shot = flag("--shot");
const narrow = argv.includes("--390") && argv.splice(argv.indexOf("--390"), 1);
const verbose = argv.includes("-v") && argv.splice(argv.indexOf("-v"), 1);
const [board, url] = argv;
if (!board || !url) { console.error("usage: designcheck.mjs <Board> <url> [--state s.json] [--shot out.png] [--390]"); process.exit(2); }
const boardFile = fs.existsSync(board) ? board : path.join(here, "../../boards/view", board + ".html");

function collect() {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const isData = (s) => !s || /^[\s\d.,:%$£€+\-−–/()#×x]+$/i.test(s) || /^\d/.test(s) && s.length < 14 || /^(US)?\$|^ZWG|^[A-Z]{2,4}-\d/.test(s);
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const own = (el) => {
    // text without the kbd, the counts and hidden parts
    const c = el.cloneNode(true);
    c.querySelectorAll("kbd,.kbd,.vn-c,.cnt,.n,.pm-n,svg,.sr-only,[aria-hidden=true]").forEach((x) => x.remove());
    return norm(c.textContent);
  };
  const items = [];
  const add = (kind, el, text) => { text = norm(text); if (!text || isData(text) || text.length > 80) return; items.push(kind + ": " + text); };
  const inShell = (el) => el.closest("nav.rail-m, .rail, [aria-label=Modules]");
  for (const el of document.querySelectorAll("h1,h2,h3,h4,.kblock-h,.gh,.pg-h,legend")) if (visible(el) && !inShell(el)) add("heading", el, own(el));
  for (const el of document.querySelectorAll("button, a.btn, [role=button], [role=menuitem]")) {
    if (!visible(el) || inShell(el) || el.closest("td")) continue;
    const t = own(el) || el.getAttribute("aria-label");
    const k = el.querySelector("kbd,.kbd");
    add(el.matches(".btn-primary, .is-primary") ? "primary" : "button", el, t + (k ? " [" + norm(k.textContent) + "]" : ""));
  }
  for (const el of document.querySelectorAll("[role=tab], .seg > *, .tabs > *")) if (visible(el)) add("tab", el, own(el));
  for (const el of document.querySelectorAll(".chipsel, [data-filter], select")) if (visible(el)) add("filter", el, own(el).split(" ")[0]);
  for (const el of document.querySelectorAll("th")) if (visible(el)) add("column", el, own(el));
  for (const el of document.querySelectorAll("aside a, nav a")) if (visible(el) && !el.closest("main, header, .tb-m") && !inShell(el)) add("panel", el, own(el));
  for (const el of document.querySelectorAll("label, .lbl, dt, .fl")) if (visible(el) && !el.closest("th,td,.chipsel")) add("label", el, own(el));
  for (const el of document.querySelectorAll("input[placeholder], textarea[placeholder]")) if (visible(el)) add("placeholder", el, el.placeholder);
  for (const el of document.querySelectorAll(".status, .pill")) if (visible(el)) add("status", el, own(el));
  for (const el of document.querySelectorAll(".table-foot, tfoot")) if (visible(el)) add("footer", el, own(el).replace(/[\d,.$]+/g, "#").slice(0, 40));
  return [...new Set(items)];
}

function geometry() {
  const issues = [];
  const txt = (el) => (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - innerWidth}px`);
  for (const t of document.querySelectorAll("table")) {
    let p = t.parentElement;
    while (p && getComputedStyle(p).overflowX === "visible" && p !== document.body) p = p.parentElement;
    if (p && getComputedStyle(p).overflowX !== "visible" && p !== document.body) continue; // it scrolls on purpose
    const pr = (p || document.body).getBoundingClientRect(), tr = t.getBoundingClientRect();
    if (tr.right > pr.right + 1) issues.push(`table overflows by ${Math.round(tr.right - pr.right)}px: ${txt(t.querySelector("th") || t)}`);
  }
  for (const th of document.querySelectorAll("th")) if (th.getBoundingClientRect().height > 40) issues.push(`header wraps: ${txt(th)}`);
  for (const td of document.querySelectorAll("td, th")) if (td.scrollWidth > td.clientWidth + 2 && getComputedStyle(td).textOverflow !== "ellipsis") issues.push(`cell spills ${td.scrollWidth - td.clientWidth}px: ${txt(td)}`);
  for (const el of document.querySelectorAll(".tb-m, .ws-tools, .btn-group, header")) if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === "visible") issues.push(`row overflows ${el.scrollWidth - el.clientWidth}px: ${el.className}`);
  return [...new Set(issues)].slice(0, 15);
}

// Workspaces live on subdomains (floorcode.apps.pagka.local:3100); map them to this machine.
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE || "/opt/pw-browsers/chromium",
  args: ["--host-resolver-rules=MAP *.pagka.local 127.0.0.1"],
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: "*.pagka.local,localhost,127.0.0.1" } } : {}),
});
const open = async (target, width, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...(opts.state ? { storageState: opts.state } : {}) });
  const page = await ctx.newPage();
  await page.goto(target, { waitUntil: "networkidle", timeout: 180000 }).catch(() => {});
  // A page that is still loading its data shows a skeleton: wait for the heading and a quiet second.
  await page.waitForSelector("main h1, h1", { timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector("[aria-busy=true], .animate-pulse"), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  return page;
};

const bp = await open(pathToFileURL(path.resolve(boardFile)).href, 1440);
const want = await bp.evaluate(collect);
const ap = await open(url, 1440, { state });
if (/\/login|\/signup/.test(ap.url())) { console.log(`not signed in: landed on ${ap.url()}`); await browser.close(); process.exit(3); }
const have = new Set(await ap.evaluate(collect));
// Compare on letters only: counts, spacing and punctuation are data or rendering, not design.
const key = (s) => s.toLowerCase().replace(/[^a-z\[\]:]+/g, "");
const bare = (s) => key(s.replace(/^\w+: /, "").replace(/ \[.*\]$/, ""));
const haveKeys = new Set([...have].map(key));
const haveBare = new Set([...have].map(bare));
const missing = [], moved = [];
for (const w of want) { if (haveKeys.has(key(w))) continue; (haveBare.has(bare(w)) ? moved : missing).push(w); }
const score = want.length ? ((want.length - missing.length - moved.length * 0.5) / want.length) * 100 : 100;
console.log(`${path.basename(boardFile, ".html")} → ${url}`);
console.log(`score ${score.toFixed(1)}%  (${want.length} items; ${missing.length} missing, ${moved.length} differ in kind or shortcut)`);
if (missing.length) console.log("missing:\n  " + missing.join("\n  "));
if (moved.length) console.log("differ:\n  " + moved.join("\n  "));
if (verbose) console.log("extra on the page:\n  " + [...have].filter((h) => !want.includes(h)).slice(0, 30).join("\n  "));
const g = await ap.evaluate(geometry);
console.log(g.length ? "1440:\n  " + g.join("\n  ") : "1440: clean");
if (narrow) {
  const np = await open(url, 390, { state });
  const g2 = await np.evaluate(geometry);
  console.log(g2.length ? "390:\n  " + g2.join("\n  ") : "390: clean");
}
if (shot) {
  const a = await bp.screenshot(), b = await ap.screenshot();
  const sp = await (await browser.newContext({ viewport: { width: 1440, height: 450 } })).newPage();
  await sp.setContent(`<body style="margin:0;display:flex;gap:0;background:#888"><img style="width:720px" src="data:image/png;base64,${a.toString("base64")}"><img style="width:720px" src="data:image/png;base64,${b.toString("base64")}"></body>`);
  await sp.screenshot({ path: shot });
  console.log("shot " + shot);
}
await browser.close();
