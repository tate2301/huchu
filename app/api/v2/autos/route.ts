import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api-utils";
import { buildV2CollectionResponse } from "../_shared";

export async function GET(request: NextRequest) {
  try {
    return await buildV2CollectionResponse(request, "autos");
  } catch (error) {
    console.error("[API] GET /api/v2/autos error:", error);
    return errorResponse("Failed to fetch autos v2 data");
  }
}
