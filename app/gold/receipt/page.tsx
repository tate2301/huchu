import { redirect } from "next/navigation";
import { goldRoutes } from "@/app/gold/routes";

export default function GoldReceiptLegacyPage() {
  redirect(goldRoutes.settlement.receipts);
}
