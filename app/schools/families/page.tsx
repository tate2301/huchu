import { redirect } from "next/navigation";

/** Families is a group of three pages; its own address opens the first. */
export default function SchoolsFamiliesPage() {
  redirect("/schools/families/messages");
}
