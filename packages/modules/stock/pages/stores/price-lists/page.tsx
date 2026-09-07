import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { StoresShell } from "../../../components/stores-shell";
import { PriceListsPanel } from "../../../components/price-lists-panel";

/**
 * Price lists had a model, an API and a resolver, and no screen — so the
 * feature existed and could not be used.
 */
export default async function StoresPriceListsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");

  return (
    <StoresShell activeTab="price-lists">
      <PriceListsPanel />
    </StoresShell>
  );
}
