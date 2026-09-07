import { PreferencesShell } from "../../../../../preferences/preferences-shell";
import { UserDetail } from "../../../../../user-management/user-detail";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePreferencesAccess("users");
  const { id } = await params;

  return (
    <PreferencesShell
      title="User"
      description="Permissions, account lifecycle and everything recorded against this person."
    >
      <UserDetail userId={id} />
    </PreferencesShell>
  );
}
