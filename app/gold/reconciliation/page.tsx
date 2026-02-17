import { redirect } from "next/navigation";
import { goldRoutes } from "@/app/gold/routes";

export default function GoldReconciliationLegacyPage() {
  redirect(`${goldRoutes.exceptions.home}?view=missing-sale`);
}
