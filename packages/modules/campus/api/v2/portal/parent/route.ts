import { NextRequest } from "next/server";
import { handleParentPortalGet } from "../_handlers";

export async function GET(request: NextRequest) {
  return handleParentPortalGet(request);
}
