import { NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";

import { LabelRefusal } from "./print";

export function labelFailure(error: unknown, where: string): NextResponse {
  if (error instanceof LabelRefusal) {
    return Object.keys(error.fieldErrors).length
      ? fieldErrorResponse(error.message, error.fieldErrors, error.status)
      : errorResponse(error.message, error.status);
  }
  console.error(`[API] ${where} error:`, error);
  return errorResponse("The labels could not be printed. Nothing was sent; try again.");
}
