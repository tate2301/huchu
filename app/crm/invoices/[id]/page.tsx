import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { booksAddressOf } from "@/lib/crm/moved-documents";

/** One invoice, at its Books address (design/books/NOTES.md §2). */
export default async function CrmInvoiceMoved({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) redirect("/login");
  const { id } = await params;
  redirect(await booksAddressOf(session.user.companyId, id, "INVOICE"));
}
