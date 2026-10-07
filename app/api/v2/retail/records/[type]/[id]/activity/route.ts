import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { readRecordActivity, recordActivityType } from "@/lib/retail/record-activity";
import { requireRetailSession } from "../../../../_helpers";

const pathSchema = z.object({ type: z.string().min(1).max(60), id: z.string().uuid() });
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * A record's Activity (W-60): `?page=1&size=10` → `{ total, rows }`, newest
 * first. The caller must be able to read the record and hold Activity read
 * (owner, manager, bookkeeper); 404 when the record is not this company's.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const path = pathSchema.safeParse(await params);
  if (!path.success) return errorResponse("Record not found", 404);
  const spec = recordActivityType(path.data.type);
  if (!spec) return errorResponse("Record not found", 404);

  const readGate = requireRetailPermission(session, spec.read[0], spec.read[1]);
  if (readGate) return readGate;
  const activityGate = requireRetailPermission(session, "retail.activity", "view");
  if (activityGate) return activityGate;

  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return errorResponse("Validation failed", 400, query.error.issues);

  const companyId = session.user.companyId;
  if (!(await spec.exists(companyId, path.data.id))) return errorResponse("Record not found", 404);

  const seeCost = canRetailSessionDo(session, "retail.catalog", "view-cost");
  return successResponse(await readRecordActivity(companyId, path.data.type, path.data.id, spec, { ...query.data, seeCost }));
}
