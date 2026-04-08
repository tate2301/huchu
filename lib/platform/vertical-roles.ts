import type { WorkspaceProfile } from "@/lib/workspace-products";
import { inferWorkspaceProfileFromEnabledFeatures } from "@/lib/workspace-products";
import type { UserRole } from "@/lib/roles";

export type ManagedWorkspaceProfile = WorkspaceProfile;

export const USER_ROLE_LABELS: Partial<Record<UserRole, string>> = {
  SUPERADMIN: "Superadmin",
  MANAGER: "Manager",
  CLERK: "Clerk",
  OPERATOR: "Operator",
  SCHOOL_ADMIN: "School Admin",
  REGISTRAR: "Registrar",
  BURSAR: "Bursar",
  TEACHER: "Teacher",
  PARENT: "Parent",
  STUDENT: "Student",
  AUTO_MANAGER: "Auto Manager",
  SALES_EXEC: "Sales Executive",
  FINANCE_OFFICER: "Finance Officer",
  SHOP_MANAGER: "Shop Manager",
  CASHIER: "Cashier",
  STOCK_CLERK: "Stock Clerk",
};

export const VERTICAL_USER_ROLES: Record<ManagedWorkspaceProfile, UserRole[]> = {
  GOLD_MINE: ["SUPERADMIN", "MANAGER", "CLERK", "FINANCE_OFFICER"],
  SCRAP_METAL: ["SUPERADMIN", "MANAGER", "OPERATOR"],
  AUTOS: ["SUPERADMIN", "MANAGER", "CLERK", "AUTO_MANAGER", "SALES_EXEC", "FINANCE_OFFICER"],
  RETAIL: ["SUPERADMIN", "MANAGER", "CLERK", "SHOP_MANAGER", "CASHIER", "STOCK_CLERK", "FINANCE_OFFICER"],
  SCHOOLS: ["SUPERADMIN", "MANAGER", "CLERK", "FINANCE_OFFICER"],
  GENERAL: ["SUPERADMIN", "MANAGER", "CLERK", "FINANCE_OFFICER"],
};

export function resolveWorkspaceProfileForRoles(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): ManagedWorkspaceProfile {
  const normalized = String(args.workspaceProfile ?? "").trim().toUpperCase() as ManagedWorkspaceProfile;
  if (normalized in VERTICAL_USER_ROLES) return normalized;
  const inferred = inferWorkspaceProfileFromEnabledFeatures(args.enabledFeatures);
  if (inferred && inferred in VERTICAL_USER_ROLES) return inferred;
  return "GENERAL";
}

export function getAllowedUserRolesForWorkspace(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): UserRole[] {
  const profile = resolveWorkspaceProfileForRoles(args);
  return VERTICAL_USER_ROLES[profile] ?? VERTICAL_USER_ROLES.GENERAL;
}

export function getAllowedUserRoleOptionsForWorkspace(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): Array<{ value: UserRole; label: string }> {
  return getAllowedUserRolesForWorkspace(args).map((value) => ({
    value,
    label: USER_ROLE_LABELS[value] ?? value,
  }));
}

