import { errorResponse, successResponse } from "@/lib/api-utils";
import { V2SuccessPayload } from "../_shared";

type V2HealthData = {
  service: "api-v2";
  status: "ok";
  timestamp: string;
};

type V2HealthResponse = V2SuccessPayload<V2HealthData>;

export async function GET() {
  try {
    const payload: V2HealthResponse = {
      success: true,
      data: {
        service: "api-v2",
        status: "ok",
        timestamp: new Date().toISOString(),
      },
    };

    return successResponse(payload);
  } catch (error) {
    console.error("[API] GET /api/v2/health error:", error);
    return errorResponse("Failed to fetch v2 health status");
  }
}
