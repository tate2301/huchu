import { redirect } from "next/navigation";
import { goldRoutes } from "@/app/gold/routes";

export default function GoldReceiptNewLegacyPage() {
  redirect(goldRoutes.settlement.newReceipt);
}
