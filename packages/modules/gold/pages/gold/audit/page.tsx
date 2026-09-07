import { redirect } from "next/navigation";
import { goldRoutes } from "../../../routes";

export default function GoldAuditLegacyPage() {
  redirect(`${goldRoutes.exceptions.home}?view=corrections`);
}
