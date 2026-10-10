import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireHostDevice } from "@/lib/retail/devices";
import { tillPrintJobs } from "@/lib/retail/labels/print";

/**
 * What this till has to print (PRD-06): its own register's waiting jobs,
 * oldest first, ten at a time. The device key is the credential.
 */
export async function GET(request: NextRequest) {
  const { device, response } = await requireHostDevice(request);
  if (response) return response as NextResponse;
  return successResponse({ jobs: await tillPrintJobs(device) });
}
