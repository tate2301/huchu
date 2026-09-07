import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { StoresShell } from "../../../components/stores-shell";
import { CataloguePanel } from "../../../components/catalogue-panel";

/**
 * The shared catalogue's own home.
 *
 * It was only reachable from CRM settings and by typing the URL, which is the
 * wrong door twice over: the catalogue is a Stock & Inventory concern that the
 * CRM, Retail and the workshop all read from. The CRM tab still works and
 * renders this same panel.
 */
export default async function StoresCataloguePage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");

  return (
    <StoresShell activeTab="catalogue">
      <CataloguePanel actionInBar />
    </StoresShell>
  );
}
