import type { WorkspaceRef } from "@/lib/admin/member-actions";
import { AdminRefusal } from "@/lib/admin/refusal";
import { requireOperatorFor, OperatorRefusal } from "@/lib/operators/guards";
import type { OperatorAction } from "@/lib/operators/roles";
import { prisma } from "@/lib/prisma";

/**
 * The one way a write inside a workspace starts: the operator, if their role
 * may do this, and the workspace the URL names. A page binds its route's slug
 * into its actions, so a control drawn inside one workspace acts on that
 * workspace; and every action refuses a record that belongs to another.
 */
export async function workspaceWrite(slug: string, action: OperatorAction) {
  const operator = await requireOperatorFor(action);
  const workspace: (WorkspaceRef & { slug: string }) | null = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, workspaceProfile: true },
  });
  if (!workspace) throw new AdminRefusal("That workspace no longer exists.");
  return { operator, workspace };
}

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Runs a write and turns a refusal into words the operator reads. Anything else is a fault and is thrown. */
export async function asResult(run: () => Promise<string>): Promise<ActionResult> {
  try {
    return { ok: true, message: await run() };
  } catch (error) {
    if (error instanceof AdminRefusal || error instanceof OperatorRefusal) return { ok: false, error: error.message };
    throw error;
  }
}
