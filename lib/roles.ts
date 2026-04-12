export const ROLES = [
  "SUPERADMIN",
  "MANAGER",
  "CLERK",
  "OPERATOR",
  "SCHOOL_ADMIN",
  "REGISTRAR",
  "BURSAR",
  "TEACHER",
  "PARENT",
  "STUDENT",
  "AUTO_MANAGER",
  "SALES_EXEC",
  "FINANCE_OFFICER",
  "SHOP_MANAGER",
  "CASHIER",
  "STOCK_CLERK",
] as const

export type UserRole = (typeof ROLES)[number]

export function hasRole(
  role: string | null | undefined,
  allowed: UserRole[],
) {
  if (!role) return false
  const normalizedRole = role.trim().toUpperCase() as UserRole
  if (allowed.includes(normalizedRole)) return true

  // Legacy compatibility: in scrap operations, CLERK users run the OPERATOR workflow.
  if (normalizedRole === "CLERK" && allowed.includes("OPERATOR")) {
    return true
  }

  return false
}
