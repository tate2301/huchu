import { redirect } from "next/navigation";

import { goldRoutes } from "../../../../../routes";

export default function GoldTransitDispatchCreateRedirectPage() {
  redirect(goldRoutes.transit.create);
}
