import "@/components/list-frame/list-frame.css";

import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { ListFrame } from "@/components/list-frame/list-frame";
import { authOptions } from "@/lib/auth";
import { navConditions } from "@/lib/retail/nav/conditions";

/**
 * Stock › Empties (30-stock 5.17, W-27): the Empties ledger, drawn by
 * ListFrame from the `retail-empties` source, with "Return empties to a
 * supplier" opening the `empties-return` sheet. Only a liquor store with
 * "Empties and deposits" on has one; anywhere else the page is not there.
 */
export default async function RetailStockEmptiesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const conditions = await navConditions(session.user.companyId);
  if (!conditions["liquor-empties"]) notFound();
  return (
    <Suspense>
      <ListFrame source="retail-empties" title="Empties" />
    </Suspense>
  );
}
