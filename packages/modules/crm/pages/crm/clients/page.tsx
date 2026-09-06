import { redirect } from "next/navigation";

/**
 * Clients became Companies when the CRM grew a full record set. Old links —
 * bookmarks, notification deep-links, anything already sent out — still work.
 */
export default function CrmClientsPage() {
  redirect("/crm/companies");
}
