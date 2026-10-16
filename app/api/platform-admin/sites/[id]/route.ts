import { NextResponse } from "next/server";
import { z } from "zod";

import { AdminRefusal } from "@/lib/admin/refusal";
import { findSite, siteRules, updateWorkspaceSite } from "@/lib/admin/sites";
import { getSignedInOperator } from "@/lib/operators/guards";

import { siteAnswer } from "../_answer";

/** One site for its Edit sheet, with how its workspace keeps sites. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await getSignedInOperator();
  if (!operator) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const site = await findSite((await params).id);
  if (!site) return NextResponse.json({ error: "That site no longer exists." }, { status: 404 });
  const rules = siteRules(site.company.workspaceProfile);
  return NextResponse.json(
    {
      site: { id: site.id, name: site.name, code: site.code, location: site.location, unit: site.measurementUnit, isActive: site.isActive },
      workspace: site.company.name,
      rules,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const body = z.object({
  name: z.string().max(400),
  code: z.string().max(40).nullish(),
  location: z.string().max(400).nullish(),
  unit: z.string().max(40).nullish(),
});

/** Sites › Edit: its name, code, location and unit, on its workspace's rules. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return siteAnswer("workspace.edit", async (operator) => {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdminRefusal("That request could not be read.");
    const site = await findSite(id);
    if (!site) throw new AdminRefusal("That site no longer exists.");
    return updateWorkspaceSite(operator, site, parsed.data);
  });
}
