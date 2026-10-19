import type { AccountingPeriodLockPolicy } from "@prisma/client";

/** Lock-policy words for the close screen. Kept apart from `close.ts` so the client bundle never pulls in the database. */
export const POLICY_LABEL: Record<AccountingPeriodLockPolicy, string> = {
  STRICT: "Nobody may post",
  MANAGER_OVERRIDE: "Managers may post, with a reason",
  SOFT_WARN: "Anyone may post, with a reason",
};
