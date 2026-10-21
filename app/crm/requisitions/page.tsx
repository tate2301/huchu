import { redirect } from "next/navigation";

/** The CRM's queues, as Books' requisition tabs. */
const QUEUE_VIEW: Record<string, string> = { AWAITING_DECISION: "to-approve", APPROVED: "to-pay", OUTSTANDING: "to-account" };

/** The CRM's requisitions are Books' list, filtered to the CRM (bk-x-crm-reqs; design/books/NOTES.md §2). */
export default async function CrmRequisitionsMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const queue = (await searchParams).queue;
  const view = typeof queue === "string" ? QUEUE_VIEW[queue] : undefined;
  redirect(`/books/requisitions?source=crm${view ? `&view=${view}` : ""}`);
}
