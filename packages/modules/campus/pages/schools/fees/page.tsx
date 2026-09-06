import { redirect } from "next/navigation";

/**
 * Two doors onto the same screen is how they drift. `/schools/finance` is the one
 * the navigation points at and the one S-4.6 turned into the year-group picker;
 * this was a byte-for-byte copy of the page it used to render.
 */
export default function SchoolsFeesPage() {
  redirect("/schools/finance");
}
