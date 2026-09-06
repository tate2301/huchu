import { redirect } from "next/navigation"

import { goldRoutes } from "@/app/gold/routes"

export default function GoldPurchaseCreateRedirectPage() {
  redirect(goldRoutes.intake.createPurchase)
}
