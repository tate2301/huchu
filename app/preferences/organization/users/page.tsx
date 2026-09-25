import { requirePreferencesAccess } from "@/lib/preferences/server";

import { UsersRegister } from "./_components/users-register";

/**
 * The gate is unchanged: `requirePreferencesAccess("users")` still runs on the
 * server and still redirects on failure.
 *
 * The register draws its own shell so that `RegisterLayout` reaches the
 * surface's grid row as a direct child — handed a wrapped child instead, the
 * shell treats the screen as an unconverted page and draws a title line and a
 * second inset around a register that already has its own header.
 *
 * The lede this page used to pass ("Manage workspace users, roles and account
 * lifecycle") named nothing the list and the record do not already say, so it
 * is gone rather than restyled — rule 1.
 */
export default async function PreferencesUsersPage() {
  await requirePreferencesAccess("users");

  return <UsersRegister />;
}
