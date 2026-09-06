import { redirect } from "next/navigation";

import { goldRoutes } from "@/app/gold/routes";

export default function GoldTransitDispatchCreateRedirectPage() {
  redirect(goldRoutes.transit.create);
}
