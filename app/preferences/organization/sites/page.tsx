import { requirePreferencesAccess } from "@/lib/preferences/server";

import { SitesRegister } from "./sites-register";

/**
 * The gate is unchanged: `requirePreferencesAccess("sites")` still runs on the
 * server and still redirects, and the register below it draws its own shell so
 * the surface's single grid row reaches `RegisterLayout` intact.
 *
 * The lede this page used to hand the shell is gone rather than hidden —
 * rule 1. "Manage operational sites used across reporting and workflows" told
 * a reader of a page called Sites nothing they did not already have.
 */
export default async function PreferencesSitesPage() {
  await requirePreferencesAccess("sites");

  return <SitesRegister />;
}
