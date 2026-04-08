import { redirect } from "next/navigation";
import { getTicketPdfUrl } from "@/lib/scrap-metal/print-adapter";

type PrintPurchasePageProps = {
  params: Promise<{ id: string }>;
};

export default async function PrintPurchaseTicketPage({ params }: PrintPurchasePageProps) {
  const { id } = await params;
  redirect(getTicketPdfUrl({ ticketType: "purchase", ticketId: id, download: false }));
}
