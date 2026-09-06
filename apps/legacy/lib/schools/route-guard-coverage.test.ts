/**
 * Every school API route is guarded.
 *
 * This is a coverage test rather than a behaviour test. The route registry does
 * run for `/api/v2/**` — `requireApiAuth` calls `canAccessRouteWithToken` — but
 * it gates on the tenant's features, not on the caller. A route that forgets
 * its own check is open to every signed-in user in a tenant that has the module
 * switched on, which includes teachers, parents and students.
 *
 * A new route file therefore fails this test until it declares who may call it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SCHOOLS_API = join(process.cwd(), "app/api/v2/schools");

/**
 * S-4.2 — the module-neutral record routes are covered here too, and they need it
 * more than most: they are deliberately absent from the route registry, so the
 * feature gate that protects every other /api/v2 path does not run for them. The
 * handler's own guard is the only thing standing there.
 */
const RECORDS_API = join(process.cwd(), "app/api/v2/records");

/**
 * Portal routes answer "who is this" through `lib/schools/portal-identity`
 * instead of a role check — a parent is allowed in, but only to their own
 * children. Both count as guarded.
 */
const GUARD_MARKERS = [
  "schoolPermissionDenial",
  /**
   * S-4.2 — `/api/v2/records/**` gates per subject type, checking the owning
   * module's feature and then the caller's role. It is the only guard those
   * routes have, because they are not in the route registry.
   */
  "guardRecordSubject",
  /**
   * S-3.3. An import is not one permission: loading the roll is registrar work
   * and loading what every family owes is the bursar's, so the import routes
   * compose two `schoolPermissionDenial` calls behind one helper rather than
   * repeating the pair in six files.
   */
  "importPermissionDenial",
  /**
   * S-4.5 — global search does not refuse, it narrows. An arm the caller's role
   * cannot see is not queried at all, so there is no denial message to return
   * and `schoolPermissionDenial` is the wrong shape; the predicate underneath it
   * is what decides. A route naming this is still deciding by role.
   */
  "canSchoolRoleDo",
  /**
   * S-6.x — the parent portal's child routes. Each one answers three questions
   * before it returns anything (who is asking, is this their child, may they be
   * told this) and they all do it through one helper, because three inline copies
   * is how the fees route honours `canReceiveFinancials` and the attendance route
   * forgets.
   */
  "scopeToChild",
  /**
   * A parent's notices are scoped to their own `NotificationRecipient` rows, which
   * is the tightest scope there is — there is no id to check, because a query
   * filtered on `userId` cannot reach anybody else's post.
   */
  "notificationRecipient",
  "canViewAnyPortalSubject",
  "resolvePortalStudent",
  "resolvePortalGuardian",
  "getTeacherProfile",
];

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

const files = [...routeFiles(SCHOOLS_API), ...routeFiles(RECORDS_API)];

describe("school and shared-record API route guards", () => {
  it("finds the route files at all", () => {
    // A silent zero here would make every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(60);
  });

  it.each(files.map((file) => [file.replace(process.cwd() + "/", ""), file]))(
    "%s declares who may call it",
    (_label, file) => {
      const source = readFileSync(file, "utf8");

      // A file that only forwards inherits the guard of whatever it forwards
      // to. Two shapes qualify, and both are checked for actually being empty
      // of their own logic rather than merely importing a handler: a bare
      // `export { GET } from …`, and a thin wrapper that calls a shared
      // `_handlers` function. Neither may touch the database itself.
      const isBareReExport = /^export \{[^}]*\} from/m.test(source);
      const isHandlerDelegate =
        /_handlers"/.test(source) && !source.includes("prisma.");
      if (isBareReExport || isHandlerDelegate) {
        expect(source.includes("prisma.")).toBe(false);
        return;
      }

      const guarded = GUARD_MARKERS.some((marker) => source.includes(marker));
      expect(guarded).toBe(true);
    },
  );
});
