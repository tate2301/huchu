import { redirect } from "next/navigation";
import { getTicketPdfUrl } from "@/lib/scrap-metal/print-adapter";

type PrintSalePageProps = {
  params: Promise<{ id: string }>;
};

export default async function PrintSaleTicketPage({ params }: PrintSalePageProps) {
  const { id } = await params;
  redirect(getTicketPdfUrl({ ticketType: "sale", ticketId: id, download: false }));
}
