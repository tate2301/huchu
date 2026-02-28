export const ROLES = [
  "SUPERADMIN",
  "MANAGER",
  "CLERK",
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
  return allowed.includes(role as UserRole)
}
