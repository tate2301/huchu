import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { settlePayment } from "@/lib/admin/billing";

import { paymentsByIds } from "../_find";

/** Payments › Confirm as paid. Each on its own; one settled already is named, the rest go through. */
export const POST = bulkRoute("payment.review", (operator, { ids }) =>
  eachOf(ids, paymentsByIds, (payment) => settlePayment(operator, payment.id, "PAID", ""), "payment"),
);
