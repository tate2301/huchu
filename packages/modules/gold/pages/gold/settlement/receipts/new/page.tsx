import { redirect } from "next/navigation";

import { goldRoutes } from "../../../../../routes";

export default function GoldSettlementReceiptCreateRedirectPage() {
  redirect(goldRoutes.settlement.create);
}
