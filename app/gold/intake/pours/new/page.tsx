import { redirect } from "next/navigation";

import { goldRoutes } from "@/app/gold/routes";

export default function GoldIntakePoursCreateRedirectPage() {
  redirect(goldRoutes.intake.create);
}
