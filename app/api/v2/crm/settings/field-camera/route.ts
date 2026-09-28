/**
 * Which camera app the tenant's reps are told to take site photos with.
 *
 * Reading is open to anybody in the CRM: the recommendation is shown on the
 * site-visit list and in every visit report, to the people taking the photos.
 * Changing it is a settings change, gated like the rest of the settings screen.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { resolveFieldCamera } from "@/lib/crm/geotag";
import { requireCrmCapability } from "../../_helpers";

/** A blank box means "use the default", not "call it nothing". */
const blankToNull = (value: string | null) => (value && value.trim() ? value.trim() : null);

const updateSchema = z.object({
  appName: z.string().max(80).nullable().transform(blankToNull),
  appUrl: z
    .string()
    .max(500)
    .nullable()
    .transform(blankToNull)
    .refine((value) => value === null || /^https:\/\/\S+$/i.test(value), {
      message: "The store link has to start with https://",
    }),
});

async function readFieldCamera(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { fieldCameraAppName: true, fieldCameraAppUrl: true },
  });
  const configured = {
    appName: company?.fieldCameraAppName ?? null,
    appUrl: company?.fieldCameraAppUrl ?? null,
  };
  return {
    // What reps are shown, defaults filled in.
    ...resolveFieldCamera({
      fieldCameraAppName: configured.appName,
      fieldCameraAppUrl: configured.appUrl,
    }),
    // What the tenant actually typed, for the settings form.
    configured,
  };
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    return successResponse({
      data: await readFieldCamera(session.user.companyId),
      canEdit: await requireCrmCapability(session, "settings.manage"),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/settings/field-camera error:", error);
    return errorResponse("Failed to load the field camera setting");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("You cannot change the CRM settings", 403);
    }

    const data = updateSchema.parse(await request.json());
    await prisma.company.update({
      where: { id: session.user.companyId },
      data: { fieldCameraAppName: data.appName, fieldCameraAppUrl: data.appUrl },
    });

    return successResponse({
      data: await readFieldCamera(session.user.companyId),
      canEdit: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/crm/settings/field-camera error:", error);
    return errorResponse("Failed to save the field camera setting");
  }
}
