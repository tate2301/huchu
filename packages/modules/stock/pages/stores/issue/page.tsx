import { redirect } from "next/navigation";

/**
 * Issuing stock is a dialog now, not a page.
 *
 * The route stays because it is bookmarked and linked from elsewhere; it lands
 * on the movement log with the dialog open, which is where you would have
 * ended up anyway after saving.
 */
export default function StoresIssuePage() {
  redirect("/stores/movements?record=issue");
}
