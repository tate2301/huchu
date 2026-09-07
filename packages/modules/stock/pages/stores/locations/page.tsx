import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { StoresShell } from "../../../components/stores-shell";
import { StockLocationsPanel } from "../../../components/stock-locations-panel";

export default async function StoresLocationsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");

  return (
    <StoresShell activeTab="locations">
      <StockLocationsPanel />
    </StoresShell>
  );
}
