import type { SchoolImportEntity } from "@corelithzw/db";

import { schoolPermissionDenial, type SessionLike } from "@/lib/schools/permissions";

/**
 * Who may import what.
 *
 * An import is not one permission. Loading the roll is registrar work; loading
 * fee structures and what every family already owes is the bursar's, and a
 * registrar who can quietly bill nine hundred families has more authority
 * through the import screen than they have anywhere else in the product. So the
 * money entity types need the fees permission on top.
 */
export function importPermissionDenial(
  session: SessionLike,
  entityType: SchoolImportEntity,
  action: "view" | "create",
): string | null {
  const base = schoolPermissionDenial(session, "schools.students", action);
  if (base) return base;

  if (entityType === "FEE_STRUCTURE" || entityType === "OPENING_BALANCE") {
    return schoolPermissionDenial(session, "schools.fees", action);
  }

  return null;
}
