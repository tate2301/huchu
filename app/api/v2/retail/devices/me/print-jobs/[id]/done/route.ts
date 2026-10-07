import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import { requireHostDevice } from "@/lib/retail/devices";
import { finishPrintJob } from "@/lib/retail/labels/print";

type Context = { params: Promise<{ id: string }> };

const outcome = z.object({ ok: z.boolean(), error: z.string().max(500).optional() });

/** The till printed a job, or could not (PRD-06): PRINTED, or FAILED with what went wrong. Its own register's jobs only. */
export async function POST(request: NextRequest, context: Context) {
  const { device, response } = await requireHostDevice(request);
  if (response) return response as NextResponse;

  const parsed = outcome.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fieldErrorResponse("Say whether it printed.", { ok: "Say whether it printed." });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success || !(await finishPrintJob(device, id, parsed.data))) {
    return errorResponse("That print job is not one of this till's.", 404);
  }
  return new NextResponse(null, { status: 204 });
}
