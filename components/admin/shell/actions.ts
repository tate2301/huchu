"use server";

import { PROFILE_LABEL, searchWorkspaces } from "@/lib/admin/workspaces";
import { requireOperator } from "@/lib/operators/guards";

/** The switcher's list: workspaces matching what was typed, alphabetically. */
export async function findWorkspacesToOpen(q: string) {
  await requireOperator();
  const rows = await searchWorkspaces(q);
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    product: row.product,
    profile: row.product === "CORELITH" ? PROFILE_LABEL[row.workspaceProfile] : null,
  }));
}
