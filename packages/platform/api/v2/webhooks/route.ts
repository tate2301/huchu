import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@corelithzw/db/client";
import { errorResponse, hasRole, successResponse, validateSession } from "../../../api-utils";
import { registeredOutboxEvents } from "../../../manifest";
import { endpointSubscribes, generateWebhookSecret } from "../../../outbox";

/**
 * A workspace's webhook endpoints: what exists, and registering one. The
 * signing secret comes back once, in the creation response, and never again.
 * A subscription names event types the composed modules announce, `*`, or a
 * module prefix such as `books.*`.
 */
const ENDPOINT_SELECT = {
  id: true,
  url: true,
  events: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

const createSchema = z.object({
  url: z.string().trim().url().max(2000).refine((value) => value.startsWith("https://"), "The endpoint must be https"),
  events: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const endpoints = await prisma.platformWebhookEndpoint.findMany({
      where: { companyId: session.user.companyId },
      select: {
        ...ENDPOINT_SELECT,
        _count: { select: { deliveries: { where: { status: "PENDING" } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    return successResponse({
      data: endpoints.map(({ _count, ...endpoint }) => ({ ...endpoint, pendingDeliveries: _count.deliveries })),
      events: registeredOutboxEvents(),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/webhooks error:", error);
    return errorResponse("Failed to fetch webhook endpoints");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("An https URL and at least one event are required", 400, parsed.error.flatten());
    const events = Array.from(new Set(parsed.data.events));
    const known = registeredOutboxEvents().map((entry) => entry.type);
    const unknown = events.filter((entry) => entry !== "*" && !known.some((type) => endpointSubscribes([entry], type)));
    if (unknown.length > 0) {
      return errorResponse("A subscription must name an event this host announces", 400, { code: "EVENT_UNKNOWN", events: unknown });
    }

    const secret = generateWebhookSecret();
    const created = await prisma.platformWebhookEndpoint.create({
      data: { companyId: session.user.companyId, url: parsed.data.url, secret, events, createdById: session.user.id },
      select: ENDPOINT_SELECT,
    });
    return successResponse({ data: { ...created, secret } }, 201);
  } catch (error) {
    console.error("[API] POST /api/v2/webhooks error:", error);
    return errorResponse("Failed to register the webhook endpoint");
  }
}
