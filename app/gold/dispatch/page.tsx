import { redirect } from "next/navigation";
import { goldRoutes } from "@/app/gold/routes";

export default function GoldDispatchLegacyPage() {
  redirect(goldRoutes.transit.dispatches);
}
