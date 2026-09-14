/**
 * Every school API route is guarded, in every method it exports.
 *
 * This is a coverage test rather than a behaviour test. The route registry does
 * run for `/api/v2/**` — `requireApiAuth` calls `canAccessRouteWithToken` — but
 * it gates on the tenant's features, not on the caller. A route that forgets
 * its own check is open to every signed-in user in a tenant that has the module
 * switched on, which includes teachers, parents and students.
 *
 * The check is per exported handler, not per file, and a write is held to a
 * stricter set of markers than a read. Both parts come from the same hole:
 * `guardian-links/[id]` PATCH could move a child's results from one parent to
 * another with no grant check at all, and it looked guarded twice over — DELETE
 * in the same file called `schoolPermissionDenial`, and PATCH itself called
 * `canViewAnyPortalSubject`, which every member of the office passes. A GET
 * that leaks is bad; a write that leaks changes the school's records, so the
 * mutating methods are the ones asserted here.
 *
 * A new route file therefore fails this test until each of its writes declares
 * who may call it.
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
  /**
   * Three portal routes name a local wrapper rather than the helper inside it —
   * `guardianFor` and `readerFor` are one-line calls to `resolvePortalGuardian`
   * and `resolvePortalStudent`, and `ownedClassSubject` asks whether the class
   * belongs to the calling teacher before a lesson plan is written to it. They
   * are named here because each handler calls one and refuses on its answer,
   * which is the guard this test is looking for.
   */
  "guardianFor",
  "readerFor",
  "ownedClassSubject",
];

/**
 * Markers that answer a reading question and are not enough on their own for a
 * write.
 *
 * `canViewAnyPortalSubject` asks whether this role may look at pupil and
 * guardian records at all, and every member of the office passes it, the bursar
 * included. That is the right question for a screen and the wrong one for a
 * change: it is what let `guardian-links/[id]` PATCH move a child's results
 * from one parent to another on a fees clerk's say-so while still looking
 * guarded. A write names it in addition to a grant check, never instead of one.
 */
const VIEW_ONLY_MARKERS = ["canViewAnyPortalSubject"];

const WRITE_GUARD_MARKERS = GUARD_MARKERS.filter(
  (marker) => !VIEW_ONLY_MARKERS.includes(marker),
);

const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

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

/**
 * The source of one exported handler, or null when the file does not export it.
 *
 * Braces are counted rather than the whole file being split on a regex, because
 * a handler ends where its own body ends: a file exporting GET then POST would
 * otherwise hand back everything after `export async function POST` and lend
 * POST the guard of whatever came next. Strings, template literals and comments
 * are skipped so a brace inside a message or a `${}` does not move the count.
 */
function handlerBody(source: string, method: string): string | null {
  const signature = new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`);
  const match = signature.exec(source);
  if (!match) return null;

  // The parameter list can itself contain braces — a destructured argument or
  // an inline object type — so step over everything before the parentheses
  // close rather than taking the first brace in the file.
  let parens = 1;
  let cursor = match.index + match[0].length;
  while (parens > 0 && cursor < source.length) {
    const char = source[cursor];
    if (char === "(") parens += 1;
    else if (char === ")") parens -= 1;
    cursor += 1;
  }
  const index = source.indexOf("{", cursor);
  if (index === -1) return null;

  let depth = 0;
  for (let position = index; position < source.length; position += 1) {
    const char = source[position];
    const next = source[position + 1];

    if (char === "/" && next === "/") {
      position = source.indexOf("\n", position);
      if (position === -1) break;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", position + 2);
      if (end === -1) break;
      position = end + 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      position += 1;
      while (position < source.length) {
        if (source[position] === "\\") position += 2;
        else if (source[position] === quote) break;
        else position += 1;
      }
      continue;
    }

    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(index, position + 1);
    }
  }
  return null;
}

const files = [...routeFiles(SCHOOLS_API), ...routeFiles(RECORDS_API)];

type Case = [label: string, file: string, method: string];

const mutatingHandlers: Case[] = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const label = file.replace(process.cwd() + "/", "");
  for (const method of MUTATING_METHODS) {
    if (new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`).test(source)) {
      mutatingHandlers.push([`${label}#${method}`, file, method]);
    }
  }
}

describe("school and shared-record API route guards", () => {
  it("finds the route files at all", () => {
    // A silent zero here would make every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(60);
    expect(mutatingHandlers.length).toBeGreaterThan(100);
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

  it.each(mutatingHandlers)("%s guards itself", (label, file, method) => {
    const body = handlerBody(readFileSync(file, "utf8"), method);
    // Null here means the brace walk lost the handler, not that the handler is
    // open; either way the assertion below should not quietly pass.
    expect(body, `could not read the body of ${label}`).not.toBeNull();

    const guarded = WRITE_GUARD_MARKERS.some((marker) => body!.includes(marker));
    expect(guarded, `${label} does not check who is calling it`).toBe(true);
  });
});
