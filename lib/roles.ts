export const ROLES = ["SUPERADMIN", "MANAGER", "CLERK"] as const

export type UserRole = (typeof ROLES)[number]

export function hasRole(
  role: string | null | undefined,
  allowed: UserRole[],
) {
  if (!role) return false
  return allowed.includes(role as UserRole)
}
