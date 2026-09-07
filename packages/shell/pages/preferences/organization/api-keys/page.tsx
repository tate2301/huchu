import { ApiKeysPreferences } from "../../../../preferences/organization/api-keys-preferences";
import { PreferencesShell } from "../../../../preferences/preferences-shell";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesApiKeysPage() {
  await requirePreferencesAccess("api-keys");

  return (
    <PreferencesShell
      title="API keys"
      description="Keys for the public API. Each carries the features it may reach; the plaintext is shown once."
    >
      <ApiKeysPreferences />
    </PreferencesShell>
  );
}
