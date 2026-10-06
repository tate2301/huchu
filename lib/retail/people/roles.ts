import type { UserRole } from "@prisma/client";

import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

/**
 * The five roles a shop gives its people (80-admin 4.1, Decisions 2), and how
 * each is stored: Owner is the tenant's SUPERADMIN, Manager is MANAGER (or the
 * older SHOP_MANAGER), Bookkeeper is FINANCE_OFFICER.
 */

export const PERSON_ROLES = ["OWNER", "MANAGER", "CASHIER", "STOCK_CLERK", "BOOKKEEPER"] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export const PERSON_ROLE_LABELS: Record<PersonRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
  STOCK_CLERK: "Stock clerk",
  BOOKKEEPER: "Bookkeeper",
};

/** The role cards on Invite someone and a person's sheet, the board's words. */
export const PERSON_ROLE_CARDS: Record<PersonRole, string> = {
  OWNER: "Everything, including money settings, approvals and the plan.",
  MANAGER: "Runs the shop: stock, buying, prices, shifts, staff PINs. Approves up to the limits.",
  CASHIER: "The till only. Opens and closes their own shift.",
  STOCK_CLERK: "Receives, counts and moves stock. No prices or money.",
  BOOKKEEPER: "Bills, payments, posting and reports. Read-only on the shop.",
};

const TO_USER_ROLE: Record<PersonRole, UserRole> = {
  OWNER: "SUPERADMIN",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
  STOCK_CLERK: "STOCK_CLERK",
  BOOKKEEPER: "FINANCE_OFFICER",
};

/** The stored roles a shop's people hold; anyone else in the company is not on People. */
export const PEOPLE_USER_ROLES: UserRole[] = ["SUPERADMIN", "MANAGER", "SHOP_MANAGER", "CASHIER", "STOCK_CLERK", "FINANCE_OFFICER"];

export function userRoleOf(role: PersonRole): UserRole {
  return TO_USER_ROLE[role];
}

export function personRoleOf(role: string | null | undefined): PersonRole | null {
  switch ((role ?? "").trim().toUpperCase()) {
    case "SUPERADMIN":
      return "OWNER";
    case "MANAGER":
    case "SHOP_MANAGER":
      return "MANAGER";
    case "CASHIER":
      return "CASHIER";
    case "STOCK_CLERK":
      return "STOCK_CLERK";
    case "FINANCE_OFFICER":
      return "BOOKKEEPER";
    default:
      return null;
  }
}

export function personRoleLabel(role: string | null | undefined): string {
  const person = personRoleOf(role);
  return person ? PERSON_ROLE_LABELS[person] : "";
}

/** "a cashier", "an owner": the role in a sentence. */
export function roleInSentence(role: PersonRole): string {
  const word = PERSON_ROLE_LABELS[role].toLowerCase();
  return /^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`;
}

/** The roles a manager may give and change: Roles row "People and PINs", its limit. */
export const MANAGER_ROLES: readonly PersonRole[] = ["CASHIER", "STOCK_CLERK"];

/**
 * Whether the caller is owner-level on People: they may remove access (D),
 * which the matrix gives the owner and Corelith support only. Owner-level
 * callers give and change any role; a manager only cashiers and stock clerks.
 */
export function isOwnerLevel(roleKey: string | null | undefined): boolean {
  return canRetailRoleDo(roleKey, "retail.people", "delete");
}

/** The roles the caller may give. Nobody without `retail.people:create` gives any. */
export function rolesCallerMayGive(roleKey: string | null | undefined): PersonRole[] {
  if (!canRetailRoleDo(roleKey, "retail.people", "create")) return [];
  return isOwnerLevel(roleKey) ? [...PERSON_ROLES] : [...MANAGER_ROLES];
}

/** Whether the caller may change someone who holds `target` (a manager: cashiers and stock clerks only). */
export function mayChangeRole(roleKey: string | null | undefined, target: PersonRole): boolean {
  if (!canRetailRoleDo(roleKey, "retail.people", "update")) return false;
  return isOwnerLevel(roleKey) || MANAGER_ROLES.includes(target);
}

/** Owners and bookkeepers sign in to the admin, so they need an email. */
export function needsEmail(role: PersonRole): boolean {
  return role === "OWNER" || role === "BOOKKEEPER";
}

/** Cashiers, managers and stock clerks get a till PIN unless told otherwise. */
export function pinByDefault(role: PersonRole): boolean {
  return role === "MANAGER" || role === "CASHIER" || role === "STOCK_CLERK";
}
