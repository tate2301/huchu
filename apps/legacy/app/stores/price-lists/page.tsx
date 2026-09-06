import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { StoresShell } from "@/components/stores/stores-shell";
import { PriceListsPanel } from "@/components/inventory/price-lists-panel";
import { authOptions } from "@/lib/auth";

/**
 * Price lists had a model, an API and a resolver, and no screen — so the
 * feature existed and could not be used.
 */
export default async function StoresPriceListsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <StoresShell activeTab="price-lists">
      <PriceListsPanel />
    </StoresShell>
  );
}
