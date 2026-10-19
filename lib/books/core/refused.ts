import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api-utils";

import { BankRefused } from "./bank";
import { BillRefusedError } from "./bills";
import { ClaimRefused } from "./claims";
import { CommissionRefused } from "./commission";
import { PettyCashRefused } from "./petty-cash";
import { PurchaseOrderRefused } from "./purchase-orders";
import { RevaluationRefused } from "./revaluation";
import { SupplierPaymentRefused } from "./supplier-payments";
import { VoidRefused } from "./void-money";
import { WithholdingRefused } from "./withholding";

const REFUSALS = [
  BankRefused,
  BillRefusedError,
  ClaimRefused,
  CommissionRefused,
  PettyCashRefused,
  PurchaseOrderRefused,
  RevaluationRefused,
  SupplierPaymentRefused,
  VoidRefused,
  WithholdingRefused,
] as const;

/** A Books core refusal as the route answers it: its own words and status; null for anything else. */
export function refusedResponse(error: unknown, invalid = "Validation failed"): NextResponse | null {
  if (error instanceof z.ZodError) return errorResponse(invalid, 400, error.issues);
  for (const Refusal of REFUSALS) {
    if (error instanceof Refusal) return errorResponse(error.message, (error as { status: number }).status);
  }
  return null;
}
