"use client";

import "@/components/list-frame/list-frame.css";

import { Suspense } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { useShellNav } from "@/components/layout/shell-nav";
import { ListFrame } from "@/components/list-frame/list-frame";
import { Button } from "@/components/workspace/button";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

/**
 * Stock › Transfers (30-stock 5.12, W-24): stock sent between the shop's
 * sites, drawn by ListFrame from the `retail-stock-transfers` source, with
 * "Move stock" opening the `transfer-new` sheet. A shop with one open site has
 * nowhere to send stock: the nav item is hidden and the page says so.
 */
export default function RetailStockTransfersPage() {
  const { conditions } = useShellNav();
  if (conditions?.["multi-site"] === false) return <NeedsSecondSite />;
  return (
    <Suspense>
      <ListFrame source="retail-stock-transfers" title="Transfers" />
    </Suspense>
  );
}

/** One open site (**Defined here**): "Transfers need a second site.", and the way to add one. */
function NeedsSecondSite() {
  const { data: session } = useSession();
  const canAdd = canRetailRoleDo(session?.user?.role, "retail.sites", "create");
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
