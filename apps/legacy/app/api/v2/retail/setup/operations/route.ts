import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@corelithzw/platform/api-response";
import { requireRetailPermission } from "@corelithzw/module-sell/permissions";
import {
  ensureRetailRegisterAccess,
  requireRetailSession,
  ensureSiteAccess,
  upsertRetailRegister,
} from "../../_helpers";
import {
  getRetailSetupProfile,
  saveRetailSetupProfile,
} from "@corelithzw/module-sell/setup-profile";
import { getRetailSetupSnapshot } from "@corelithzw/module-sell/setup-snapshot";

const operationSchema = z
  .object({
    defaultSiteId: z.string().uuid(),
    defaultRegisterId: z.string().uuid().optional().nullable(),
    newRegisterName: z.string().trim().max(120).optional().nullable(),
  })
  .refine(
    (value) => Boolean(value.defaultRegisterId || value.newRegisterName?.trim()),
    {
      message: "Choose an existing register or provide a new register name",
      path: ["defaultRegisterId"],
    },
  );

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. Registers, branches and terminal bindings.
  const gate = requireRetailPermission(session, "retail.setup", "view");
  if (gate) return gate;

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

  const gate = requireRetailPermission(session, "retail.setup", "update");
  if (gate) return gate;

  try {
    const body = await request.json();
    const validated = operationSchema.parse(body);
    const site = await ensureSiteAccess(
      session.user.companyId,
      validated.defaultSiteId,
    );
    if (!site) {
      return errorResponse("Invalid site", 400);
    }

    const register = validated.defaultRegisterId
      ? await ensureRetailRegisterAccess({
          companyId: session.user.companyId,
          siteId: site.id,
          registerId: validated.defaultRegisterId,
        })
      : await upsertRetailRegister({
          companyId: session.user.companyId,
          siteId: site.id,
          registerName: validated.newRegisterName?.trim() ?? "",
        });

    if (!register) {
      return errorResponse("Invalid register", 400);
    }

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
