import type { SchoolImportEntity } from "@prisma/client";

import { schoolPermissionDenial, type SessionLike } from "@/lib/schools/permissions";

/**
 * Who may import what.
 *
 * An import is not one permission. Loading the roll is registrar work; loading
 * fee structures and what every family already owes is the bursar's, and a
 * registrar who can quietly bill nine hundred families has more authority
 * through the import screen than they have anywhere else in the product.
 *
 * So each entity type is checked against the one grant it belongs to, and not
 * against both. Requiring the money entities to satisfy the student grant as
 * well left only SCHOOL_ADMIN able to load opening balances at all: the bursar,
 * whose job this is, was refused with "Your role cannot create students".
 */
export function importPermissionDenial(
  session: SessionLike,
  entityType: SchoolImportEntity,
  action: "view" | "create",
): string | null {
  const isMoney = entityType === "FEE_STRUCTURE" || entityType === "OPENING_BALANCE";
  return schoolPermissionDenial(
    session,
    isMoney ? "schools.fees" : "schools.students",
    action,
  );
}
