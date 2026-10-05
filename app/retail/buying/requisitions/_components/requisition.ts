/** A requisition as the retail pages read it. */
export type RetailRequisition = {
  id: string;
  requisitionNo: string;
  status: string;
  category: string;
  purpose: string;
  notes: string | null;
  amount: string;
  approvedAmount: string | null;
  currency: string;
  neededBy: string | null;
  createdAt: string;
  approvedAt: string | null;
  disbursedAt: string | null;
  decisionNote: string | null;
  site: { id: string; name: string } | null;
  requestedBy: { id: string; name: string | null } | null;
  approvedBy: { id: string; name: string | null } | null;
  disbursedBy: { id: string; name: string | null } | null;
};

/** What was approved, when it was cut; what was asked, otherwise. */
export function requisitionAmount(requisition: Pick<RetailRequisition, "amount" | "approvedAmount">) {
  return Number(requisition.approvedAmount ?? requisition.amount);
}
