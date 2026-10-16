import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { settlePayment } from "@/lib/admin/billing";

import { paymentsByIds } from "../_find";

/** Payments › Mark as failed, with the reason the customer's record keeps. */
export const POST = bulkRoute("payment.review", (operator, { ids, reason }) =>
  eachOf(ids, paymentsByIds, (payment) => settlePayment(operator, payment.id, "FAILED", reason ?? ""), "payment"),
);
