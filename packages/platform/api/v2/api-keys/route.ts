import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@corelithzw/db/client";
import { generatePlatformApiKey } from "../../../api-keys";
import { errorResponse, hasRole, successResponse, validateSession } from "../../../api-utils";
import { getFeatureMap } from "../../../features";

/**
 * A workspace's API keys: what exists, and minting one. The plaintext comes
 * back once, in the creation response, and never again.
 *
 * A scope is a feature key the tenant holds: a key cannot be given more than
 * the workspace has, so an admin sees the same list the sidebar is built from.
 */
const KEY_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  scopes: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string().trim().min(1).max(120)).min(1).max(200),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const keys = await prisma.platformApiKey.findMany({
      where: { companyId: session.user.companyId },
      select: KEY_SELECT,
      orderBy: { createdAt: "desc" },
    });
    return successResponse({ data: keys });
  } catch (error) {
    console.error("[API] GET /api/v2/api-keys error:", error);
    return errorResponse("Failed to fetch API keys");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("A name and at least one scope are required", 400, parsed.error.flatten());
    const scopes = Array.from(new Set(parsed.data.scopes));
    const features = await getFeatureMap(session.user.companyId);
    const unheld = scopes.filter((scope) => features[scope] !== true);
    if (unheld.length > 0) {
      return errorResponse("A key cannot carry a scope this workspace does not hold", 400, { code: "SCOPE_NOT_HELD", scopes: unheld });
    }

    const { key, prefix, hash } = generatePlatformApiKey();
    const created = await prisma.platformApiKey.create({
      data: {
        companyId: session.user.companyId,
        name: parsed.data.name,
        keyPrefix: prefix,
        keyHash: hash,
        scopes,
        createdById: session.user.id,
      },
      select: KEY_SELECT,
    });
    return successResponse({ data: { ...created, key } }, 201);
  } catch (error) {
    console.error("[API] POST /api/v2/api-keys error:", error);
    return errorResponse("Failed to create the API key");
  }
}
