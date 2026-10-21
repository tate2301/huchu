import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { booksAddressOf } from "@/lib/crm/moved-documents";

/** One receipt, at its Books address (design/books/NOTES.md §2). */
export default async function CrmReceiptMoved({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) redirect("/login");
  const { id } = await params;
  redirect(await booksAddressOf(session.user.companyId, id, "RECEIPT"));
}
