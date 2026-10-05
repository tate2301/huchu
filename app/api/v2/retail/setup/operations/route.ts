import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import {
  ensureRetailRegisterAccess,
  requireRetailSession,
  ensureSiteAccess,
  upsertRetailRegister,
} from "../../_helpers";
import {
  getRetailSetupProfile,
  saveRetailSetupProfile,
} from "@/lib/retail/setup-profile";
import { getRetailSetupSnapshot } from "@/lib/retail/setup-snapshot";

const operationSchema = z
  .object({
    defaultSiteId: z.string().uuid(),
    defaultRegisterId: z.string().uuid().optional().nullable(),
    newRegisterName: z.string().trim().max(120).optional().nullable(),
    /**
     * False adds a till without moving the shop's default onto it — the
     * settings surface's New till. Left out, the till becomes the default, as
     * it always has.
     */
    makeDefault: z.boolean().optional(),
  })
  .refine(
    (value) => Boolean(value.defaultRegisterId || value.newRegisterName?.trim()),
    {
      message: "Choose a till or name a new one",
      path: ["defaultRegisterId"],
    },
  );

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. Registers, branches and terminal bindings.
  const gate = requireRetailPermission(session, "retail.tills", "view");
  if (gate) return gate;

  try {
    const snapshot = await getRetailSetupSnapshot(session.user.companyId);
    return successResponse({
      profile: await getRetailSetupProfile(session.user.companyId),
      ...snapshot,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/retail/setup/operations error:", error);
    return errorResponse("The tills would not load");
  }
}

export async function PUT(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.tills", "update");
  if (gate) return gate;

  try {
    const body = await request.json();
    const validated = operationSchema.parse(body);
    // Adding a till is `create` as well.
    if (validated.newRegisterName?.trim() && !validated.defaultRegisterId) {
      const createGate = requireRetailPermission(session, "retail.tills", "create");
      if (createGate) return createGate;
    }
    const site = await ensureSiteAccess(
      session.user.companyId,
      validated.defaultSiteId,
    );
    if (!site) {
      return errorResponse("That site is not in this workspace", 400);
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
      return errorResponse("That till is not at this site", 400);
    }

    if (validated.makeDefault === false) {
      return successResponse({ ok: true, profile: await getRetailSetupProfile(session.user.companyId), register });
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
    return errorResponse("The tills were not saved");
  }
}
