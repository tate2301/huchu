import "@/components/list-frame/list-frame.css";

import { Suspense } from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ListFrame } from "@/components/list-frame/list-frame";
import { Button } from "@/components/workspace/button";
import { authOptions } from "@/lib/auth";
import { navConditions } from "@/lib/retail/nav/conditions";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

/**
 * Stock › Transfers (30-stock 5.12, W-24): stock sent between the shop's
 * sites, drawn by ListFrame from the `retail-stock-transfers` source, with
 * "Move stock" opening the `transfer-new` sheet. A shop with one open site has
 * nowhere to send stock: the server answers "Transfers need a second site."
 * instead of the list (its source refuses the same way), and the nav item is
 * hidden.
 */
export default async function RetailStockTransfersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const conditions = await navConditions(session.user.companyId);
  if (!conditions["multi-site"]) {
    return <NeedsSecondSite canAdd={canRetailRoleDo(session.user.role, "retail.sites", "create")} />;
  }
  return (
    <Suspense>
      <ListFrame source="retail-stock-transfers" title="Transfers" />
    </Suspense>
  );
}

/** One open site (**Defined here**): "Transfers need a second site.", and the way to add one. */
function NeedsSecondSite({ canAdd }: { canAdd: boolean }) {
  return (
    <div className="cx-lf-refusal" role="alert">
      <span className="cx-lf-block__line">Transfers need a second site.</span>
      {canAdd ? (
        <Button asChild>
          <Link href="/retail/manage/sites?sheet=site-new">Add a site</Link>
        </Button>
      ) : null}
    </div>
  );
}
