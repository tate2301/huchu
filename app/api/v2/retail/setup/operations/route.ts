import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { normalizeProvidedId } from "@/lib/id-generator";
import { requireRetailSession, ensureSiteAccess, upsertRetailRegister } from "../../_helpers";
import { getRetailSetupProfile, saveRetailSetupProfile } from "@/lib/retail/setup-profile";
import { getRetailSetupSnapshot } from "@/lib/retail/setup-snapshot";

const operationSchema = z.object({
  defaultSiteId: z.string().uuid(),
  defaultRegisterName: z.string().trim().min(1).max(120),
  defaultRegisterCode: z.string().trim().max(50).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  try {
    const snapshot = await getRetailSetupSnapshot(session.user.companyId);
    return successResponse({
      profile: await getRetailSetupProfile(session.user.companyId),
      ...snapshot,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/retail/setup/operations error:", error);
    return errorResponse("Failed to fetch retail operations setup");
  }
}

export async function PUT(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  if (!["SUPERADMIN", "MANAGER", "SHOP_MANAGER"].includes(session.user.role ?? "")) {
    return errorResponse("Only managers can update retail operations setup", 403);
  }

  try {
    const body = await request.json();
    const validated = operationSchema.parse(body);
    const site = await ensureSiteAccess(session.user.companyId, validated.defaultSiteId);
    if (!site) {
      return errorResponse("Invalid site", 400);
    }

    const register = await upsertRetailRegister({
      companyId: session.user.companyId,
      siteId: site.id,
      registerName: validated.defaultRegisterName,
      registerCode: validated.defaultRegisterCode ? normalizeProvidedId(validated.defaultRegisterCode, "RETAIL_REGISTER") : null,
    });

    const profile = {
      defaultSiteId: site.id,
      defaultRegisterId: register.id,
      defaultRegisterName: register.name,
      defaultRegisterCode: register.code,
    };
    await saveRetailSetupProfile(session.user.companyId, profile);

    return successResponse({
      ok: true,
      profile,
      register,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PUT /api/v2/retail/setup/operations error:", error);
    return errorResponse("Failed to save retail operations setup");
  }
}

