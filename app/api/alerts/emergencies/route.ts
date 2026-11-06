import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  detectEmergencyAlerts,
  executeBatchEmergencyWorkflow,
  executeEmergencyWorkflow,
  type EmergencyWorkflowActionKey,
} from "@/lib/alerts/emergency-framework";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import type { ShiftSession } from "@/lib/retail/floor/shifts";

const singleActionSchema = z.object({
  mode: z.literal("single").default("single"),
  actionKey: z.enum([
    "close-retail-shift",
    "close-retail-day",
    "close-fiscal-day",
    "close-cost-day",
    "submit-shift-report",
  ]),
  payload: z.record(z.string(), z.unknown()).default({}),
  note: z.string().max(1000).optional(),
});

const batchActionSchema = z.object({
  mode: z.literal("batch"),
  onlyPastDays: z.boolean().optional(),
  itemIds: z.array(z.string()).optional(),
  note: z.string().max(1000).optional(),
});

const postSchema = z.union([batchActionSchema, singleActionSchema]);

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const feed = await detectEmergencyAlerts({
      companyId: session.user.companyId,
      userId: session.user.id,
      userRole: session.user.role ?? null,
      userName: session.user.name ?? null,
      userEmail: session.user.email ?? null,
    });

    return successResponse(feed);
  } catch (error) {
    console.error("[API] GET /api/alerts/emergencies error:", error);
    return errorResponse("Could not load emergency and day-close alerts.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const rawBody = await request.json().catch(() => ({}));
    const parsed = postSchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorResponse("Invalid emergency workflow request.", 400, parsed.error.issues);
    }

    const ctx = {
      companyId: session.user.companyId,
      userId: session.user.id,
      userRole: session.user.role ?? null,
      userName: session.user.name ?? null,
      userEmail: session.user.email ?? null,
      session: session as unknown as ShiftSession,
    };

    const result =
      parsed.data.mode === "batch"
        ? await executeBatchEmergencyWorkflow(ctx, {
            onlyPastDays: parsed.data.onlyPastDays,
            itemIds: parsed.data.itemIds,
            note: parsed.data.note,
          })
        : await executeEmergencyWorkflow(ctx, {
            actionKey: parsed.data.actionKey as EmergencyWorkflowActionKey,
            payload: parsed.data.payload,
            note: parsed.data.note,
          });

    const feed = await detectEmergencyAlerts(ctx);

    if (!result.ok && parsed.data.mode === "single") {
      return errorResponse(result.message, 409, { result, feed });
    }

    return successResponse({ result, feed });
  } catch (error) {
    console.error("[API] POST /api/alerts/emergencies error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Could not run the close-day workflow.",
    );
  }
}
