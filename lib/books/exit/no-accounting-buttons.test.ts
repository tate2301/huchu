/**
 * The P1 exit test's last line (books-final §8): no Books button opens
 * /accounting. Every New…, Record… and the record pages' actions open a
 * Books form or page.
 *
 * Two halves:
 * - The sources of every Books screen (app/books, components/books, and the
 *   readers in lib/books that hand the screens their links) are read for an
 *   address under /accounting. The only ones allowed are the pages Books has
 *   no home for yet, each with the phase that builds it; never an
 *   `?action=new-*` form and never the Sales or Receivables pages P1 moved.
 * - With `BOOKS_CRAWL_ORIGIN` and `BOOKS_CRAWL_STATE` set (a running app and
 *   a signed-in browser state), every Books page is opened in a browser and
 *   its buttons and links (the page, not the panel) are read the same way.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { BOOKS_NAV_ITEMS } from "@/lib/navigation";

const root = process.cwd();

/** Pages Books links to until its own page is built, and the phase that builds it (books-final §8). */
const NOT_YET_IN_BOOKS: Record<string, string> = {
  "/accounting/chart-of-accounts": "P5, Ledger › Chart of accounts",
  "/accounting/posting-rules": "P5, Ledger › Posting rules",
  "/accounting/trial-balance": "P5, Ledger › Trial balance",
  "/accounting/financial-statements": "P5, Ledger › Financial statements",
  "/accounting/cost-centers": "P5, Ledger › Cost centres",
  "/accounting": "P5, Settings › Set up the books",
};

/** An address under /accounting a Books screen may show, or why not. */
export function accountingLinkProblem(href: string): string | null {
  const [pathname, query = ""] = href.split("?");
  if (/(^|&)action=/.test(query)) return `${href} opens an Accounting form; Books has its own`;
  if (!NOT_YET_IN_BOOKS[pathname]) return `${href} has a Books page now, or never had a place`;
  return null;
}

function files(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) files(rel, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/** Addresses in code, not in comments or API calls: "/accounting…" in a string or template. */
function linksIn(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return [...code.matchAll(/["'`](\/accounting(?:[/?][^"'`\s]*)?)["'`]/g)].map((match) => match[1].replace(/\$\{[^}]*\}.*$/, ""));
}

describe("no Books button opens /accounting (books-final §8, P1 exit)", () => {
  it("knows the rule: a form is never Accounting's, and only pages Books has no home for are linked", () => {
    expect(accountingLinkProblem("/accounting/sales?action=new-invoice")).toMatch(/form/);
    expect(accountingLinkProblem("/accounting/purchases?action=new-bill")).toMatch(/form/);
    expect(accountingLinkProblem("/accounting/sales")).toMatch(/Books page/);
    expect(accountingLinkProblem("/accounting/receivables")).toMatch(/Books page/);
    expect(accountingLinkProblem("/accounting/purchases")).toMatch(/Books page/);
    expect(accountingLinkProblem("/accounting/payables")).toMatch(/Books page/);
    expect(accountingLinkProblem("/accounting/banking")).toMatch(/Books page/);
    expect(accountingLinkProblem("/accounting/currency")).toMatch(/Books page/);
    expect(accountingLinkProblem("/accounting/fiscalisation")).toMatch(/Books page/);
    expect(accountingLinkProblem("/accounting/tax/setup")).toMatch(/Books page/);
    expect(accountingLinkProblem("/accounting/posting-rules")).toBeNull();
  });

  it("finds none in the sources of Books' screens", () => {
    const sources = [...files("app/books"), ...files("components/books"), ...files("lib/books").filter((file) => !file.includes(`${path.sep}core${path.sep}`))];
    const problems: string[] = [];
    for (const file of sources) {
      if (file.endsWith(path.join("lib", "books", "moved.ts"))) continue;
      for (const href of linksIn(fs.readFileSync(path.join(root, file), "utf8"))) {
        const problem = accountingLinkProblem(href);
        if (problem) problems.push(`${file}: ${problem}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("gives every Sales and Bills & spending row a Books address", () => {
    for (const item of BOOKS_NAV_ITEMS.filter((row) => row.group === "books-sales" || row.group === "books-spending")) expect(item.href.startsWith("/books/")).toBe(true);
  });

  const origin = process.env.BOOKS_CRAWL_ORIGIN;
  const state = process.env.BOOKS_CRAWL_STATE;
  it.skipIf(!origin || !state)(
    "finds none on the rendered Books pages either",
    async () => {
      const { chromium } = createRequire(path.join(root, "package.json"))("@playwright/test") as typeof import("@playwright/test");
      const browser = await chromium.launch({
        executablePath: process.env.PLAYWRIGHT_EXECUTABLE || "/opt/pw-browsers/chromium",
        args: ["--host-resolver-rules=MAP *.pagka.local 127.0.0.1"],
      });
      const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state })).newPage();
      const pages = [...new Set(BOOKS_NAV_ITEMS.map((item) => item.href).filter((href) => href.startsWith("/books")))];
      pages.push("/books/invoices/new", "/books/payments/new", "/books/bills/new", "/books/payments-made/new");
      const problems: string[] = [];
      const visit = async (href: string) => {
        // The app keeps a live channel open, so the network never goes quiet: wait for the page's own data instead.
        await page.goto(origin + href, { waitUntil: "domcontentloaded", timeout: 180_000 }).catch(() => undefined);
        await page.waitForSelector("main h1, header h1", { timeout: 120_000 }).catch(() => undefined);
        await page.waitForFunction(() => !document.querySelector("[aria-busy=true]"), null, { timeout: 60_000 }).catch(() => undefined);
        await page.waitForTimeout(1_000);
        // The page and its top bar, not the panel: a panel row may still point at a page Books has no home for.
        const links = await page.evaluate(() =>
          [...document.querySelectorAll("main a[href], header a[href]")].map((a) => a.getAttribute("href") ?? "").filter((h) => h.startsWith("/accounting")),
        );
        for (const link of links) {
          const problem = accountingLinkProblem(link);
          if (problem) problems.push(`${href}: ${problem}`);
        }
        return page.evaluate(() => [...document.querySelectorAll("main a[href^='/books/invoices/'], main a[href^='/books/customers/']")].map((a) => a.getAttribute("href") ?? ""));
      };
      const records: string[] = [];
      for (const href of pages) records.push(...(await visit(href)));
      // A record of each kind the lists link to.
      for (const href of [records.find((h) => /^\/books\/invoices\/[0-9a-f-]{36}$/.test(h)), records.find((h) => /^\/books\/customers\/[0-9a-f-]{36}$/.test(h))]) {
        if (href) await visit(href);
      }
      await browser.close();
      expect(problems).toEqual([]);
    },
    600_000,
  );
});
