import { redirect } from "next/navigation";

/**
 * What a receipt says about the shop — its name, tax numbers, contact details
 * and footer — is the company's branding, edited once for every document in
 * Settings → Branding. This page only ever checked it and linked there.
 */
export default function RetailSetupBrandingPage() {
  redirect("/preferences/organization/branding");
}
