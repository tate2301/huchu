import { NextResponse, type NextRequest } from "next/server";

import { findFreeWorkspaceSlug, isWorkspaceSlugTaken } from "@/lib/signup/service";
import { checkWorkspaceSlug, describeWorkspaceSlugProblem } from "@/lib/signup/workspace-address";
import { rateLimited } from "@/lib/signup/http";

/**
 * Is this workspace address free? Asked as the visitor types, so the answer
 * arrives before they press the button rather than after.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimited(request, "address", 120, 60 * 1000);
  if (limited) return limited;

  const slug = (request.nextUrl.searchParams.get("slug") ?? "").trim().toLowerCase();
  const problem = checkWorkspaceSlug(slug);
  if (problem) {
    return NextResponse.json({ slug, available: false, message: describeWorkspaceSlugProblem(problem) });
  }

  if (await isWorkspaceSlugTaken(slug)) {
    return NextResponse.json({
      slug,
      available: false,
      message: `${slug} is taken.`,
      suggestion: await findFreeWorkspaceSlug(slug),
    });
  }

  return NextResponse.json({ slug, available: true });
}
