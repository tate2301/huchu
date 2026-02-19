import { redirect } from "next/navigation";

import { goldRoutes } from "@/app/gold/routes";

export default function GoldSettlementReceiptCreateRedirectPage() {
  redirect(goldRoutes.settlement.create);
}
