import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { activeNav } from "./match";
import { composeNav } from "./compose";
import { GROUP_LABEL, NAV_NODES, type NavKid } from "./registry";

const ROOT = path.resolve(__dirname, "../..");

function appRoutes(): RegExp[] {
  const routes: RegExp[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
        const rel = path.relative(path.join(ROOT, "app"), dir).split(path.sep);
        const segments = rel.filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"));
        const pattern = segments
          .map((s) => (/^\[\[?\.\.\./.test(s) ? ".*" : /^\[.*\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
          .join("/");
        routes.push(new RegExp(`^/${pattern}$`));
      }
    }
  };
  walk(path.join(ROOT, "app"));
  return routes;
}

const allKids = (): Array<{ node: (typeof NAV_NODES)[number]; kid: NavKid | null }> =>
  NAV_NODES.flatMap((node) => [{ node, kid: null as NavKid | null }, ...(node.kids ?? []).map((kid) => ({ node, kid }))]);

describe("registry", () => {
  it("has unique ids", () => {
    const ids = allKids().map(({ node, kid }) => (kid ?? node).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every destination one home: no two nodes share an address", () => {
    const seen = new Map<string, string>();
    for (const node of NAV_NODES) {
      const key = node.href;
      expect(seen.get(key), `${node.id} and ${seen.get(key)} share ${key}`).toBeUndefined();
      seen.set(key, node.id);
    }
  });

  it("keeps a child under its parent's address", () => {
    for (const node of NAV_NODES) {
      // Books' levels hold pages from several addresses (Sales: invoices, quotes, customers).
      if (node.group === "books") continue;
      for (const kid of node.kids ?? []) {
        expect(kid.href.startsWith(node.href), `${kid.id} ${kid.href} is not under ${node.href}`).toBe(true);
      }
    }
  });

  it("names a group label for every group a node uses", () => {
    for (const node of NAV_NODES) expect(GROUP_LABEL).toHaveProperty(node.group);
  });

  it("opens only pages that exist: the address each page is opened at has an app page", { timeout: 120_000 }, () => {
    const routes = appRoutes();
    const missing: string[] = [];
    for (const { node, kid } of allKids()) {
      const target = kid ?? node;
      for (const address of target.live ?? [target.href]) {
        const pathname = address.split("?")[0]!;
        if (!routes.some((r) => r.test(pathname))) missing.push(`${target.id}: ${address}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("lists pages that have not moved yet, so phase 9 is a to-do list that can reach zero", () => {
    const unmoved = allKids()
      .filter(({ node, kid }) => (kid ?? node).live)
      .map(({ node, kid }) => (kid ?? node).id);
    expect(unmoved.length).toBeGreaterThan(0);
  });
});

describe("composeNav", () => {
  const everything = () => true;
  const ids = (groups: ReturnType<typeof composeNav>) => groups.flatMap((g) => g.items.map((i) => i.id));

  it("draws groups in a fixed order: Home, the products, then the shared groups", () => {
    const groups = composeNav({ canOpen: everything, products: ["huchu", "tender"] });
    const order = groups.map((g) => g.id);
    expect(order[0]).toBe("top");
    expect(order.indexOf("huchu")).toBeLessThan(order.indexOf("tender"));
    expect(order.indexOf("tender")).toBeLessThan(order.indexOf("records"));
    expect(order.slice(-2)).not.toContain("top");
  });

  it("hides what cannot be opened, never greys it", () => {
    const groups = composeNav({ canOpen: (href) => href.startsWith("/retail/sales") || href === "/" });
    expect(groups.map((g) => g.id)).toEqual(["top", "tender"]);
    expect(ids(groups)).not.toContain("deals");
  });

  it("drops a group with nothing left in it", () => {
    const groups = composeNav({ canOpen: (href) => href === "/" });
    expect(groups.map((g) => g.id)).toEqual(["top"]);
  });

  it("shows a parent whose own page is closed when a child is open, and opens the child", () => {
    const groups = composeNav({ canOpen: (href) => href === "/retail/sales?state=held" });
    const sales = groups.flatMap((g) => g.items).find((i) => i.id === "sales");
    expect(sales?.href).toBe("/retail/sales?state=held");
    expect(sales?.kids).toEqual([]);
  });

  it("collapses a parent with one visible child to a plain row", () => {
    const groups = composeNav({ canOpen: (href) => href === "/retail/shifts" });
    const shifts = groups.flatMap((g) => g.items).find((i) => i.id === "shifts");
    expect(shifts?.kids).toEqual([]);
    expect(shifts?.href).toBe("/retail/shifts");
  });

  it("keeps every child's address under its parent's, whatever the person may open", () => {
    const rights = [everything, (h: string) => h.startsWith("/crm"), (h: string) => /^\/(retail|books)/.test(h), (h: string) => h === "/retail/sales?state=held"];
    // Once every page has moved, there is no `live` and the rule holds for what is drawn.
    const homed = NAV_NODES.map(({ live: _live, kids, ...rest }) => ({ ...rest, kids: kids?.map(({ live: _l, ...k }) => k) }));
    const home = new Map(NAV_NODES.map((n) => [n.id, n.href.split("?")[0]!]));
    for (const canOpen of rights) {
      for (const group of composeNav({ canOpen, nodes: homed })) {
        // Books' levels hold pages from several addresses (Sales: invoices, quotes, customers).
        if (group.id === "books") continue;
        for (const item of group.items) {
          for (const kid of item.kids) {
            expect(kid.href.startsWith(home.get(item.id)!), `${kid.id} ${kid.href}`).toBe(true);
          }
        }
      }
    }
  });

  it("takes the first live address the person may open", () => {
    const groups = composeNav({ canOpen: (href) => href === "/crm/companies" || href === "/" });
    const customers = groups.flatMap((g) => g.items).find((i) => i.id === "customers");
    expect(customers?.href).toBe("/crm/companies");
  });

  it("uses a trade's own words", () => {
    const groups = composeNav({ canOpen: everything, labels: { projects: "Jobs" }, groupLabels: { crm: "Work" } });
    expect(groups.flatMap((g) => g.items).find((i) => i.id === "projects")?.label).toBe("Jobs");
    expect(groups.find((g) => g.id === "crm")?.label).toBe("Work");
  });

  it("never lets pressing a sibling change the list of top-level pages", () => {
    const groups = composeNav({ canOpen: everything });
    const topLevel = ids(groups);
    for (const group of groups) {
      for (const item of group.items) {
        for (const kid of item.kids) {
          // The tree is a function of the person alone; the page being looked at never enters it.
          expect(ids(composeNav({ canOpen: everything }))).toEqual(topLevel);
          expect(activeNav(groups, kid.href.split("?")[0]!, null)).not.toBeNull();
        }
      }
    }
  });
});

describe("activeNav", () => {
  const groups = composeNav({ canOpen: () => true });
  const query = (s: string) => new URLSearchParams(s);

  it("picks the child that shares its parent's address", () => {
    expect(activeNav(groups, "/retail/sales", query(""))).toMatchObject({ nodeId: "sales", kidId: "sales-all" });
  });

  it("picks a child by its query", () => {
    expect(activeNav(groups, "/retail/sales", query("state=held"))).toMatchObject({ nodeId: "sales", kidId: "sales-held" });
  });

  it("matches a page under a node's address to that node", () => {
    expect(activeNav(groups, "/retail/laybys/L-12", query(""))).toMatchObject({ nodeId: "laybys", kidId: null });
  });

  it("answers null where no node stands for the page", () => {
    expect(activeNav(groups, "/nowhere/at/all", query(""))).toBeNull();
  });
});
