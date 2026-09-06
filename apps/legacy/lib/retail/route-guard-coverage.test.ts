/**
 * Every retail API handler declares who may call it.
 *
 * This is a coverage test rather than a behaviour test. The route registry does
 * run for `/api/v2/**` — `requireApiAuth` calls `canAccessRouteWithToken` — but it
 * gates on the tenant's features, not on the caller. A handler that forgets its own
 * check is open to every signed-in user in a tenant that has retail switched on,
 * which includes cashiers and stock clerks.
 *
 * ## Per handler, not per file
 *
 * The first version of this test asked whether a *file* named a gate, which is the
 * question the two hand audits before it asked as well. All three got the same
 * wrong answer. `purchasing/orders/route.ts` names `requireRetailStock` — in its
 * `POST`. Its `GET` has no gate, and the file also imported `requireRetailManager`
 * without ever calling it, so a dead import was enough to make the file look
 * covered. File-level counting reported 9 ungated routes; the truth is 22 ungated
 * handlers.
 *
 * A route file is not a unit of authorisation. A handler is.
 *
 * ## Why the canonical gate list lives here
 *
 * Retail's gates used to be spread across two modules under five names. Auditing
 * them by grepping for the names schools and HR use returned "1 of 34 routes
 * guarded" — an alarming finding that was simply wrong. Correcting for one name
 * gave 23, then a second gave 25, and going per-handler gave a different answer
 * again.
 *
 * The lesson is not "grep more carefully". It is that the canonical list has to
 * live somewhere a new gate has to be added deliberately, rather than being
 * reinvented by whoever is looking. That is this file.
 *
 * R-2.4 has since collapsed the five names to one matrix, which is what makes
 * the list short enough to read — but the reason it lives here has not changed,
 * and `RETIRED_GATES` below now guards the collapse itself.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { canRetailRoleDo } from "./permissions";

const RETAIL_API = join(process.cwd(), "app/api/v2/retail");

/**
 * The POS collection route sits outside `/api/v2/retail` but is retail's, and is
 * gated on `retail.pos` in the route registry. Auditing retail without it would
 * leave one handler nobody owns.
 */
const POS_API = join(process.cwd(), "app/api/v2/pos");

/**
 * The names that answer "may this person". Adding one is a deliberate act: it
 * goes here, or the handler that uses it fails this test.
 *
 * R-2.4 cut this list from eight to three. What went were the role sets —
 * `requireRetailManager`, `requireRetailStock`, `requireRetailPos` and
 * `canManageRetailTransactions` — which could answer "is this person a stock
 * person" and could not answer "may a cashier read the catalogue but not its
 * cost price". Every retail handler now names `lib/retail/permissions.ts`.
 */
const GUARD_MARKERS = [
  /**
   * The matrix, as a door. `requireRetailPermission(session, resource, action)`
   * returns the 403 to hand back, or null.
   */
  "requireRetailPermission",
  /**
   * The same matrix read as a boolean, for handlers that answer "may this caller
   * do it *or* has a manager approved it here" rather than simply refusing. The
   * two reversal endpoints need that shape: the POS portal admits only cashiers,
   * and `RUN_A_TILL` withholds `refund` and `void`, so a flat refusal would put
   * reversals out of reach of the shop floor entirely.
   */
  "canRetailRoleDo",
  /**
   * `lib/retail/pos-host.ts` — which portal you may sign into. Deliberately not
   * folded into the matrix: it is a question about hosts and sessions, not about
   * resources, and the till routes ask it *as well as* the matrix rather than
   * instead of it.
   */
  "canAccessPosPortal",
];

/**
 * The gates R-2.4 deleted. Naming one is now a regression, not a style choice —
 * they no longer exist, so a handler that reintroduces one has either brought
 * back a role set or copied a stale example.
 */
const RETIRED_GATES = [
  "requireRetailManager",
  "requireRetailStock",
  "requireRetailPos",
  "canManageRetailTransactions",
];

/**
 * Reads with no gate in front of them. **Empty, and it stays empty.**
 *
 * It held sixteen entries — 22 of retail's 24 `GET` handlers when this file was
 * written. Every one authenticated and scoped to `session.user.companyId`, so
 * none was a tenant leak, but each was readable by any role in a retail tenant:
 * a stock clerk could pull the trading dashboard, and a cashier could read cost
 * price off the catalogue.
 *
 * R-2.3 decided them one at a time rather than gating them blind, because the
 * right answer differed: `pos/catalog` stays open to a cashier — a till that
 * cannot list its stock cannot sell — while what it *returns* drops the cost
 * column, and `purchasing/orders` closed to the counter entirely.
 *
 * The object is kept rather than deleted so the assertions below still have
 * something to hold: an entry added back here fails the "must stay empty" test,
 * which is a louder way of saying "somebody decided a read needs no gate" than a
 * missing gate would be.
 */
const UNGATED_READS: Record<string, string> = {};

type Handler = { file: string; method: string; key: string; body: string; source: string };

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...routeFiles(full));
    } else if (entry === "route.ts") {
      found.push(full);
    }
  }
  return found;
}

/** Posix-style and repo-relative, so the allowlist keys read the same on Windows. */
function label(file: string): string {
  return relative(process.cwd(), file).split(sep).join("/");
}

/**
 * Slices a route file into its exported handlers. Each body runs from its own
 * `export async function` to the next one, so a gate called in `POST` cannot be
 * read as covering the `GET` above it.
 */
function handlers(file: string): Handler[] {
  const source = readFileSync(file, "utf8");
  const found = [...source.matchAll(/export async function ([A-Z]+)\s*\(/g)];
  return found.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < found.length ? (found[index + 1].index ?? source.length) : source.length;
    return {
      file: label(file),
      method: match[1],
      key: `${label(file)} ${match[1]}`,
      body: source.slice(start, end),
      source,
    };
  });
}

/**
 * A file that only forwards inherits the guard of whatever it forwards to. It has
 * to be genuinely empty of its own logic to qualify, not merely importing a
 * handler — so it must not reach the database itself.
 */
function isDelegate(source: string): boolean {
  const forwards =
    /^export \{[^}]*\} from/m.test(source) || source.includes("buildV2CollectionResponse");
  return forwards && !source.includes("prisma.");
}

/**
 * Source with its comments removed.
 *
 * Several handlers explain in a comment what they used to be gated on, and the
 * retired gate names appear there. Asserting against raw source would read the
 * explanation as the thing it warns about.
 */
function stripComments(body: string): string {
  return body
    .replace(new RegExp("\\/\\*[\\s\\S]*?\\*\\/", "g"), " ")
    .replace(new RegExp("\\/\\/[^\\n]*", "g"), " ");
}
const files = [...routeFiles(RETAIL_API), ...routeFiles(POS_API)];
const allHandlers = files.flatMap(handlers);
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

describe("retail API handler guards", () => {
  it("finds the routes and handlers at all", () => {
    // A silent zero here would make every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(30);
    expect(allHandlers.length).toBeGreaterThan(40);
  });

  it.each(allHandlers.map((h) => [h.key, h] as const))("%s declares who may call it", (key, h) => {
    if (key in UNGATED_READS || isDelegate(h.source)) return;
    expect(GUARD_MARKERS.some((marker) => h.body.includes(marker))).toBe(true);
  });

  /**
   * The allowlist reaching zero is R-2.4's definition of done, and leaving the
   * object in place with nothing in it is what makes that a test rather than a
   * claim in a commit message.
   */
  it("has no ungated reads left", () => {
    expect(Object.keys(UNGATED_READS)).toEqual([]);
  });

  it.each(allHandlers.map((h) => [h.key, h] as const))(
    "%s names no retired gate",
    (_key, h) => {
      // Comments explain what the handlers used to be gated on, and those
      // explanations name the retired gates. Read the code, not the prose.
      const source = stripComments(h.body);
      expect(RETIRED_GATES.filter((gate) => source.includes(gate))).toEqual([]);
    },
  );

  /**
   * The line that must not move. Reads are a product decision still being made;
   * a write reachable by any signed-in user in the tenant is not.
   */
  it("gates every write, with no allowlist", () => {
    const ungatedWrites = allHandlers
      .filter((h) => WRITE_METHODS.has(h.method))
      .filter((h) => !isDelegate(h.source))
      .filter((h) => !GUARD_MARKERS.some((marker) => h.body.includes(marker)))
      .map((h) => h.key);
    expect(ungatedWrites).toEqual([]);
  });

});

/**
 * Reversals are gated on the matrix, never on the role list.
 *
 * S-7.7. `requireRetailPos` admits `RETAIL_MANAGER_ROLES` **plus `CASHIER`**,
 * and `pos/sales/[id]/refund` and `.../void` both used it — so a cashier could
 * POST either endpoint and reverse a posted sale. `RUN_A_TILL` in
 * `lib/retail/permissions.ts` grants `view`, `create`, `open-shift` and
 * `close-shift` and deliberately withholds `refund` and `void`; the till's own
 * history screen hides both buttons accordingly. The endpoints were the only
 * thing that disagreed.
 *
 * The suite above could not catch it, and that is the point of this block: it
 * asks "is there a gate?", and there was one — the wrong one. These two
 * handlers are held to the specific gate rather than to any gate.
 */
describe("reversing a sale is a manager act", () => {
  const REVERSALS: Array<{ key: string; action: "refund" | "void" }> = [
    { key: "pos/sales/[id]/refund/route.ts POST", action: "refund" },
    { key: "pos/sales/[id]/void/route.ts POST", action: "void" },
  ];

  /** `label()` normalises to forward slashes, so the tail matches as written. */
  function findHandler(key: string) {
    return allHandlers.find((candidate) => candidate.key.endsWith(key));
  }

  it.each(REVERSALS)("$key gates on retail.sell $action", ({ key, action }) => {
    const handler = findHandler(key);
    expect(handler, `no handler found for ${key}`).toBeDefined();
    if (!handler) return;

    const source = stripComments(handler.body);
    // The caller is measured against the matrix for this exact action …
    expect(source).toContain("canRetailRoleDo");
    expect(source).toContain(`"retail.sell", "${action}"`);
    // … and the only way past a refusal is a verified manager approval.
    expect(source).toContain("verifyManagerOverride");
    expect(source).toContain(`action: "${action}"`);
  });

  it.each(REVERSALS)("$key does not fall back to the role list", ({ key }) => {
    const handler = findHandler(key);
    expect(handler).toBeDefined();
    // `requireRetailPos` here is the exact regression this block exists for.
    expect(stripComments(handler?.body ?? "")).not.toContain("requireRetailPos");
  });

  it("the matrix itself still withholds both from a cashier", () => {
    // If this ever flips, the gates above stop meaning what they are here for.
    expect(canRetailRoleDo("CASHIER", "retail.sell", "refund")).toBe(false);
    expect(canRetailRoleDo("CASHIER", "retail.sell", "void")).toBe(false);
    expect(canRetailRoleDo("CASHIER", "retail.sell", "create")).toBe(true);
    expect(canRetailRoleDo("MANAGER", "retail.sell", "refund")).toBe(true);
    expect(canRetailRoleDo("MANAGER", "retail.sell", "void")).toBe(true);
  });
});
