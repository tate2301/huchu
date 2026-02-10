import { redirect } from "next/navigation";
import { goldRoutes } from "@/app/gold/routes";

export default function GoldPayoutsLegacyPage() {
  redirect(goldRoutes.settlement.payouts);
}
