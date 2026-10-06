import { Prisma } from "@prisma/client";

import { rolesView, type RoleLimits, type RolesView } from "@/lib/retail/roles-matrix";

/**
 * "Who can do what" (80-admin 5.4): the Roles matrix the server enforces,
 * with its limit sentences. The limits are the Approvals settings' defaults
 * — the values a shop has until it saves Approvals (ADM-04, whose
 * `getApprovalLimits` answers these same defaults for a shop with no row).
 */
export const APPROVAL_DEFAULTS: RoleLimits = {
  priceChanges: "MANAGERS",
  belowCostNeedsOwner: true,
  adjustmentPinOver: new Prisma.Decimal("50.00"),
  countDifferences: "OWNER_OVER_LIMIT",
  countOwnerOver: new Prisma.Decimal("100.00"),
  requisitionOwnerOver: new Prisma.Decimal("500.00"),
  accountOwnerOver: new Prisma.Decimal("250.00"),
};

export function peopleRolesView(limits: RoleLimits = APPROVAL_DEFAULTS): RolesView {
  return rolesView(limits);
}
