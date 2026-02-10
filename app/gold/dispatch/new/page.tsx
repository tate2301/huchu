import { redirect } from "next/navigation";
import { goldRoutes } from "@/app/gold/routes";

export default function GoldDispatchNewLegacyPage() {
  redirect(goldRoutes.transit.newDispatch);
}
