import { redirect } from "next/navigation";

import { goldRoutes } from "@corelithzw/module-gold/routes";

export default function GoldIntakePoursCreateRedirectPage() {
  redirect(goldRoutes.intake.create);
}
