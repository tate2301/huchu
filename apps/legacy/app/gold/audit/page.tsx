import { redirect } from "next/navigation";
import { goldRoutes } from "@corelithzw/module-gold/routes";

export default function GoldAuditLegacyPage() {
  redirect(`${goldRoutes.exceptions.home}?view=corrections`);
}
