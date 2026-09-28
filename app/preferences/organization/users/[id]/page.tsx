import { requirePreferencesAccess } from "@/lib/preferences/server";

import { UsersRegister } from "../_components/users-register";

/**
 * Unchanged: same gate, same item id as the list route.
 *
 * The record is not a page of its own any more — it is the right-hand column of
 * the register, with the list beside it and this row selected. The route is
 * unchanged, so every link into it still lands where it did.
 */
export default async function PreferencesUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePreferencesAccess("users");
  const { id } = await params;

  return <UsersRegister selectedId={id} />;
}
