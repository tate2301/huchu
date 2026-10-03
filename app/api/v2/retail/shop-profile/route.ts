import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import {
  canChangeShopProfile,
  DEFAULT_SHOP_PROFILE,
  loadShopProfile,
  saveShopProfile,
  shopFeatures,
  shopProfileInput,
} from "@/lib/retail/shop-profile";
import { requireRetailSession } from "../_helpers";

/**
 * The shop's business type and the features it switches on.
 *
 * Read by Settings › General and by every screen that changes with the shop
 * type. Written by the owner alone: whether a till checks ID is a licence
 * question, not a shift manager's.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.setup", "view");
  if (gate) return gate;

  const profile = await loadShopProfile(session.user.companyId);
  return successResponse({
    data: profile,
    features: shopFeatures(profile),
    defaults: DEFAULT_SHOP_PROFILE,
    canChange: canChangeShopProfile(session.user.role),
  });
}

export async function PUT(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.setup", "update");
  if (gate) return gate;
  if (!canChangeShopProfile(session.user.role)) {
    return errorResponse("Only the owner can change what kind of shop this is", 403);
  }

  try {
    const input = shopProfileInput.parse(await request.json());
    const profile = await saveShopProfile(
      {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name ?? null,
        userRole: session.user.role ?? null,
      },
      input,
    );
    return successResponse({ data: profile, features: shopFeatures(profile) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PUT /api/v2/retail/shop-profile error:", error);
    return errorResponse("The shop profile was not saved");
  }
}
