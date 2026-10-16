/**
 * Who may use Explore. Management → Explore decides it by role
 * (`ExploreSettings.roles`, read with `exploreRoles` in `runs.ts`); with no
 * choice made it is the workspace's owners and managers, the roles that
 * already change the workspace's settings. Kept apart from `access.ts` so the
 * command bar can ask without the report registry; there, without the
 * workspace's choice to hand, the default answers.
 */
export const EXPLORE_ROLES: readonly string[] = ["SUPERADMIN", "MANAGER"];

export function canUseExplore(role: string | null | undefined, roles: readonly string[] = EXPLORE_ROLES): boolean {
  return Boolean(role && roles.includes(role));
}
