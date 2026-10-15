import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AdminRefusal } from "@/lib/admin/refusal";
import { createWorkspaceSite, siteRules } from "@/lib/admin/sites";
import { getSignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";

import { siteAnswer } from "./_answer";

async function workspaceOf(slug: string | null) {
  const workspace = slug
    ? await prisma.company.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, workspaceProfile: true } })
    : null;
  if (!workspace) throw new AdminRefusal("That workspace no longer exists.");
  return workspace;
}

/** What Add site asks for in this workspace (`?w=` its address): a short code or SITE-0001, a unit or none. */
export async function GET(request: NextRequest) {
  const operator = await getSignedInOperator();
  if (!operator) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const workspace = await prisma.company.findUnique({
    where: { slug: request.nextUrl.searchParams.get("w") ?? "" },
    select: { name: true, workspaceProfile: true },
  });
  if (!workspace) return NextResponse.json({ error: "That workspace no longer exists." }, { status: 404 });
  return NextResponse.json({ workspace: workspace.name, rules: siteRules(workspace.workspaceProfile) }, { headers: { "Cache-Control": "no-store" } });
}

const body = z.object({
  w: z.string().min(1).max(64),
  name: z.string().max(400),
  code: z.string().max(40).nullish(),
  location: z.string().max(400).nullish(),
  unit: z.string().max(40).nullish(),
});

/** Sites › Add site, in the workspace the body names. */
export async function POST(request: Request) {
  return siteAnswer("workspace.edit", async (operator) => {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdminRefusal("That request could not be read.");
    const workspace = await workspaceOf(parsed.data.w);
    const site = await createWorkspaceSite(operator, workspace, parsed.data);
    return { site };
  });
}
