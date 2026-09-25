import { requirePreferencesAccess } from "@/lib/preferences/server";

import { DepartmentsRegister } from "./departments-register";

/**
 * The gate is unchanged: `requirePreferencesAccess("departments")` still runs
 * on the server and still redirects. The register draws its own shell, so the
 * surface's single grid row reaches `RegisterLayout` intact — handing the shell
 * a wrapped child instead makes it draw a title line and a second inset around
 * a screen that already has its own header.
 *
 * The lede this page used to pass is gone rather than hidden — rule 1.
 */
export default async function PreferencesDepartmentsPage() {
  await requirePreferencesAccess("departments");

  return <DepartmentsRegister />;
}
