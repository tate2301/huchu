import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { ProductRefusal } from "@/lib/retail/products/create";
import { DefaultListMissing } from "@/lib/retail/prices/change";

import { ImportRefusal } from "./refusal";

/** A refusal in its own words and status, else a 500 that says nothing was saved. */
export function importFailure(error: unknown, where: string): NextResponse {
  if (error instanceof ImportRefusal) return errorResponse(error.message, error.status);
  if (error instanceof ProductRefusal) return errorResponse(error.message, error.status);
  if (error instanceof DefaultListMissing) return errorResponse(error.message, 500);
  console.error(`[API] ${where} error:`, error);
  return errorResponse("That did not work. Nothing was saved; try again.");
}
