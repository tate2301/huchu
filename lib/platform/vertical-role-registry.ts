import type { UserRole } from "@/lib/roles";
import type { WorkspaceProfile } from "@/lib/workspace-products";

export type ManagedWorkspaceProfile = WorkspaceProfile;

export type VerticalRoleRegistration = {
  roles: UserRole[];
};

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

export const VERTICAL_ROLE_REGISTRY: Record<ManagedWorkspaceProfile, VerticalRoleRegistration> = {
  GOLD_MINE: { roles: ["SUPERADMIN", "MANAGER", "CLERK", "FINANCE_OFFICER"] },
  SCRAP_METAL: { roles: ["SUPERADMIN", "MANAGER", "OPERATOR"] },
  AUTOS: { roles: ["SUPERADMIN", "MANAGER", "CLERK", "AUTO_MANAGER", "SALES_EXEC", "FINANCE_OFFICER"] },
  RETAIL: { roles: ["SUPERADMIN", "MANAGER", "CLERK", "SHOP_MANAGER", "CASHIER", "STOCK_CLERK", "FINANCE_OFFICER"] },
  SCHOOLS: { roles: ["SUPERADMIN", "MANAGER", "CLERK", "FINANCE_OFFICER"] },
  GENERAL: { roles: ["SUPERADMIN", "MANAGER", "CLERK", "OPERATOR", "FINANCE_OFFICER"] },
};

export function getRegisteredRoles(profile: ManagedWorkspaceProfile): UserRole[] {
  return VERTICAL_ROLE_REGISTRY[profile]?.roles ?? VERTICAL_ROLE_REGISTRY.GENERAL.roles;
}

