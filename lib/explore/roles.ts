/**
 * Who may use Explore. Management → Explore is to decide it by role; until
 * its settings have a table (`ExploreSettings`, waiting for approval with
 * Explore's reader), it is the workspace's owners and managers, the roles
 * that already change the workspace's settings. Kept apart from
 * `access.ts` so the command bar can ask without the report registry.
 */
export const EXPLORE_ROLES: readonly string[] = ["SUPERADMIN", "MANAGER"];

export function canUseExplore(role: string | null | undefined): boolean {
  return Boolean(role && EXPLORE_ROLES.includes(role));
}
