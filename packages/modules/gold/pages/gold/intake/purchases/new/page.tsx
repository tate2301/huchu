import { redirect } from "next/navigation"

import { goldRoutes } from "../../../../../routes"

export default function GoldPurchaseCreateRedirectPage() {
  redirect(goldRoutes.intake.createPurchase)
}
