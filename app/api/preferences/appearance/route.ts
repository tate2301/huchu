import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import {
  DISPLAY_PREFERENCE_DEFAULTS,
  DISPLAY_DENSITIES,
  DISPLAY_OPEN_ON,
} from "@/lib/preferences/display";
import { prisma } from "@/lib/prisma";

/**
 * The Display section of `Appearance.dc.html` — Density, Open on, Reduce motion.
 *
 * Only those three. The theme is not here and should not be: it has to be
 * applied before first paint or the page flashes the wrong one, and
 * `components/providers/appearance-provider.tsx` already reads it synchronously
 * from `localStorage` under `huchu.appearance`. A server round trip cannot be
 * awaited in that position.
 *
 * Shaped after `/api/notifications/preferences`, which is the one other per-user
 * preference route: a row per user, absent until they change something, read
 * through the drawn defaults so an account with no row answers the same as one
 * that kept every default.
 */
const updateDisplayPreferenceSchema = z
  .object({
    density: z.enum(DISPLAY_DENSITIES).optional(),
    openOn: z.enum(DISPLAY_OPEN_ON).optional(),
    reduceMotion: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one display preference field is required",
  });

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const preference = await prisma.userDisplayPreference.findUnique({
      where: { userId: session.user.id },
    });

    return successResponse(
      preference ?? {
        userId: session.user.id,
        ...DISPLAY_PREFERENCE_DEFAULTS,
      },
    );
  } catch (error) {
    console.error("[API] GET /api/preferences/appearance error:", error);
    return errorResponse("Failed to fetch appearance preferences");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = updateDisplayPreferenceSchema.parse(body);

    const preference = await prisma.userDisplayPreference.upsert({
      where: { userId: session.user.id },
      update: validated,
      // The first save writes the row. Fields the form did not send fall to the
      // column defaults, which are the same values the GET falls back to, so a
      // partial first save cannot invent a preference nobody chose.
      create: {
        userId: session.user.id,
        ...validated,
      },
    });

    return successResponse(preference);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/preferences/appearance error:", error);
    return errorResponse("Failed to update appearance preferences");
  }
}
