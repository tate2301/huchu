import { redirect } from "next/navigation";

/** Collections are the overdue invoices in Books (design/books/NOTES.md §2). */
export default function CrmCollectionsMoved() {
  redirect("/books/invoices?view=overdue");
}
