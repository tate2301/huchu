import { NextRequest } from "next/server";
import { handleStudentPortalGet } from "../_handlers";

export async function GET(request: NextRequest) {
  return handleStudentPortalGet(request);
}
