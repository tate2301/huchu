import { redirect } from "next/navigation";

/**
 * The shop's setup lives in the settings surface now, under Shop. This was a
 * checklist page of tiles and a coverage chart in the working sidebar; the
 * rail's own entries carry what still needs attention.
 */
export default function RetailSetupPage() {
  redirect("/retail/setup/operations");
}
