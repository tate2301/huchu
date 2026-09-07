import { NextRequest } from "next/server";
import { handleTeacherPortalGet } from "../_handlers";

export async function GET(request: NextRequest) {
  return handleTeacherPortalGet(request);
}
