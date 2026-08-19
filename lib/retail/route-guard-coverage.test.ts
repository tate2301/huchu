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
 * Retail's gates are spread across two modules under five names. Auditing them by
 * grepping for the names schools and HR use returned "1 of 34 routes guarded" — an
 * alarming finding that was simply wrong. Correcting for one name gave 23, then a
 * second gave 25, and going per-handler gave a different answer again.
 *
 * The lesson is not "grep more carefully". It is that the canonical list has to
 * live somewhere a new gate has to be added deliberately, rather than being
 * reinvented by whoever is looking. That is this file.
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
 * The five names that answer "may this person". Adding a sixth is a deliberate
 * act: it goes here, or the handler that uses it fails this test.
 *
 * These are role-set gates, not a resource × action matrix. A role set can answer
 * "is this person a stock person"; it cannot express "a cashier may read the
 * catalogue but not its cost price". Replacing them with a matrix is R-2.1 of
 * `docs/retail/retail-hardening-plan-2026-08-12.md`; until then this list is what
 * there is, and pinning it stops the number drifting while that work is in flight.
 */
const GUARD_MARKERS = [
  /** `app/api/v2/retail/_helpers.ts` — SUPERADMIN, MANAGER, SHOP_MANAGER. */
  "requireRetailManager",
  /** The manager set plus STOCK_CLERK. */
  "requireRetailStock",
  /** The manager set plus CASHIER. */
  "requireRetailPos",
  /** The manager set, as a boolean rather than a response. */
  "canManageRetailTransactions",
  /** `lib/retail/pos-host.ts` — the POS-capable roles, used by the till routes. */
  "canAccessPosPortal",
  /**
   * R-2.3. `lib/retail/permissions.ts` — the resource × action × role matrix
   * that is replacing the five role sets above. A handler naming this is gated,
   * and the six reads it now stands in front of have left the allowlist below.
   */
  "requireRetailPermission",
  /**
   * S-7.7. The same matrix read as a boolean, for handlers that answer "may
   * this caller do it *or* has a manager approved it here" rather than simply
   * refusing. The two reversal endpoints need that shape: the POS portal admits
   * only cashiers, and `RUN_A_TILL` withholds `refund` and `void`, so a flat
   * refusal would put reversals out of reach of the shop floor entirely.
   */
  "canRetailRoleDo",
];

/**
 * Reads that no gate stands in front of — 22 of the module's 24 `GET` handlers.
 * Only `pos/context` and `shifts/context` check a role before answering.
 *
 * Every one of these still authenticates and scopes its queries to
 * `session.user.companyId`, so none is a tenant leak. But each is readable by any
 * role in a retail tenant, which is a product decision nobody has made: a stock
 * clerk can currently pull the trading dashboard, and a cashier can read cost
 * price off the catalogue.
 *
 * R-2.3 decides each one — grant it in the permissions matrix, or gate it. They
 * are not to be gated blind: `pos/catalog` being open to a cashier is correct, and
 * `setup/overview` being open to one probably is not.
 *
 * This list is asserted to be exact, not merely permissive. An entry that gains a
 * gate fails the test until it is deleted from here, so the allowlist cannot
 * outlive the work; an entry naming a handler that no longer exists fails too.
 */
const UNGATED_READS: Record<string, string> = {
  "app/api/v2/retail/catalog/route.ts GET": "The admin catalogue list. Carries cost and margin.",
  "app/api/v2/retail/catalog/[id]/route.ts GET": "One catalogue item, with its inventory position.",
  "app/api/v2/retail/customers/route.ts GET": "The customer list.",
  "app/api/v2/retail/customers/search/route.ts GET":
    "Customer lookup for the till. A cashier needs it; the question is what it returns.",
  "app/api/v2/retail/customers/[id]/loyalty/route.ts GET":
    "One customer's loyalty balance and history, read at the point of sale.",
  "app/api/v2/retail/promotions/route.ts GET": "Active and scheduled promotions.",
  "app/api/v2/retail/purchasing/orders/route.ts GET":
    "Purchase orders, with supplier and unit cost. The GET a dead import made look covered.",
  "app/api/v2/retail/purchasing/receipts/route.ts GET": "Goods receipts, with unit cost.",
  "app/api/v2/retail/pos/catalog/route.ts GET":
    "The sellable catalogue. Open to a cashier is correct — but it carries cost price.",
  "app/api/v2/retail/pos/catalog/categories/route.ts GET":
    "Category list for the till's filter rail. Names only.",
  "app/api/v2/retail/pos/current-shift/route.ts GET":
    "The caller's own open shift. Arguably self-scoped already.",
  "app/api/v2/retail/pos/held-carts/route.ts GET": "Carts parked at the till.",
  "app/api/v2/retail/pos/sales/route.ts GET": "The sales list, with line-level cost.",
  "app/api/v2/retail/pos/sales/[id]/route.ts GET":
    "One posted sale, with its lines, payments and unit cost.",
  "app/api/v2/retail/pos/sync/route.ts GET": "Offline queue state for the till.",
  "app/api/v2/pos/route.ts GET":
    "A stub. Delegates to buildV2CollectionResponse and returns an empty collection.",
};

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

  describe("the ungated reads", () => {
    it("are all still there", () => {
      const present = new Set(allHandlers.map((h) => h.key));
      expect(Object.keys(UNGATED_READS).filter((key) => !present.has(key))).toEqual([]);
    });

    it("are all still reads", () => {
      // The allowlist is for reads nobody has classified yet. It must never become
      // somewhere a write can hide.
      const notReads = Object.keys(UNGATED_READS).filter((key) => !key.endsWith(" GET"));
      expect(notReads).toEqual([]);
    });

    it("are still ungated — an entry that gains a gate leaves this list", () => {
      const byKey = new Map(allHandlers.map((h) => [h.key, h]));
      const nowGated = Object.keys(UNGATED_READS).filter((key) => {
        const h = byKey.get(key);
        return h ? GUARD_MARKERS.some((marker) => h.body.includes(marker)) : false;
      });
      expect(nowGated).toEqual([]);
    });

    it.each(Object.keys(UNGATED_READS))("%s authenticates and scopes to a tenant", (key) => {
      const h = allHandlers.find((candidate) => candidate.key === key);
      expect(h).toBeDefined();
      if (!h || isDelegate(h.source)) return;
      expect(h.source).toMatch(/requireRetailSession|validateSession|requireApiAuth/);
      expect(h.source).toContain("companyId");
    });
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

  /**
   * Code only.
   *
   * The two handlers explain in a comment what they used to be gated on, and
   * the words `requireRetailPos` appear there. Asserting against raw source
   * would read the explanation as the thing it warns about.
   */
  function code(body: string) {
    return body
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
  }

  /** `label()` normalises to forward slashes, so the tail matches as written. */
  function findHandler(key: string) {
    return allHandlers.find((candidate) => candidate.key.endsWith(key));
  }

  it.each(REVERSALS)("$key gates on retail.sell $action", ({ key, action }) => {
    const handler = findHandler(key);
    expect(handler, `no handler found for ${key}`).toBeDefined();
    if (!handler) return;

    const source = code(handler.body);
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
    expect(code(handler?.body ?? "")).not.toContain("requireRetailPos");
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
