import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RESERVED_PARAMS, readFilterValue, readState } from "./codec";
import { registerHref } from "./href";
import { REGISTERS } from "./registry";
import { isCustomFieldKey, type RegisterDef } from "./types";

function parse(href: string) {
  const [route, query = ""] = href.split("?");
  return { route, ...readState(REGISTERS.DEAL, new URLSearchParams(query)) };
}

describe("registerHref", () => {
  it("is the list's own address when there is nothing to say", () => {
    expect(registerHref("DEAL")).toBe("/crm/deals");
    expect(registerHref("PERSON")).toBe("/crm/people");
  });

  it("names a view on its own as that view, as saved", () => {
    const href = registerHref("DEAL", {}, { view: "won" });
    expect(href).toBe("/crm/deals?view=won");
    expect(parse(href)).toMatchObject({ route: "/crm/deals", view: "won", asSaved: true });
  });

  it("writes a state the list reads back whole", () => {
    const state = {
      q: "roof",
      filters: {
        stage: ["stage-1"],
        owner: ["me", "none"],
        close: { preset: "this-month" as const },
        value: { min: 1000 },
        stale: true as const,
      },
      sort: { key: "close", dir: "asc" as const },
      layout: "TABLE" as const,
      by: "owner",
    };
    const href = registerHref("DEAL", state);
    expect(parse(href)).toMatchObject({ route: "/crm/deals", state, asSaved: false });
  });
});

/**
 * Every link into a list typed into the code says only what that list reads:
 * a filter renamed in a definition must not leave a link behind that quietly
 * narrows nothing. `new=1` is the page's own — it opens the create form.
 */
describe("links into lists written in the code", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const DIRS = ["app", "components", "lib", "hooks"];
  const PAGE_PARAMS = new Set(["new"]);
  const byRoute = new Map<string, RegisterDef>(Object.values(REGISTERS).map((def) => [def.route, def]));
  const routes = [...byRoute.keys()].map((route) => route.replace(/\//g, "\\/")).join("|");
  const LINK = new RegExp(`["'\`](${routes})\\?([^"'\`\\s]*)`, "g");

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }

  const links = DIRS.flatMap((dir) => sources(path.join(ROOT, dir))).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(LINK)].map((match) => ({
      where: `${path.relative(ROOT, file)}: ${match[0].slice(1)}`,
      def: byRoute.get(match[1])!,
      query: match[2],
    })),
  );

  it("finds the links it is checking", () => {
    expect(links.length).toBeGreaterThan(0);
  });

  it("carries only keys each list reads, with values it can read", () => {
    const problems: string[] = [];
    for (const { where, def, query } of links) {
      for (const pair of query.split("&").filter(Boolean)) {
        const [key, value = ""] = pair.split("=");
        if (PAGE_PARAMS.has(key) || (RESERVED_PARAMS as readonly string[]).includes(key) || isCustomFieldKey(key)) {
          continue;
        }
        const filter = def.filters.find((candidate) => candidate.key === key);
        if (!filter) {
          problems.push(`${where} — ${def.noun.many} have no "${key}"`);
          continue;
        }
        // A value worked out at run time is the codec's to judge then.
        if (value.includes("${")) continue;
        if (readFilterValue(filter, decodeURIComponent(value)) === undefined) {
          problems.push(`${where} — "${value}" is not a ${filter.label.toLowerCase()} ${def.noun.many} can be narrowed to`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
