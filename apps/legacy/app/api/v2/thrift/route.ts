import { NextRequest } from "next/server";
import { errorResponse } from "@corelithzw/platform/api-response";
import { buildV2CollectionResponse } from "@corelithzw/platform/v2-collection";

export async function GET(request: NextRequest) {
  try {
    return await buildV2CollectionResponse(request, "retail");
  } catch (error) {
    console.error("[API] GET /api/v2/thrift error:", error);
    return errorResponse("Failed to fetch retail v2 data");
  }
}
