import { redirect } from "next/navigation";

import { goldRoutes } from "../../../../../routes";

export default function GoldIntakePoursCreateRedirectPage() {
  redirect(goldRoutes.intake.create);
}
