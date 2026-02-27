import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api-utils";
import { buildV2CollectionResponse } from "../_shared";

export async function GET(request: NextRequest) {
  try {
    return await buildV2CollectionResponse(request, "schools");
  } catch (error) {
    console.error("[API] GET /api/v2/schools error:", error);
    return errorResponse("Failed to fetch schools v2 data");
  }
}
