import { redirect } from "next/navigation";
import { goldRoutes } from "@/app/gold/routes";

export default function GoldPourNewLegacyPage() {
  redirect(goldRoutes.intake.newPour);
}
