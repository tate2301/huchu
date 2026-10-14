"use server";

import { redirect } from "next/navigation";

import { AdminRefusal } from "@/lib/admin/refusal";
import { setUpWorkspace, type SetUpInput } from "@/lib/admin/set-up";
import { OperatorRefusal, requireOperatorFor } from "@/lib/operators/guards";

export async function setUp(input: SetUpInput): Promise<{ error: string }> {
  let slug: string;
  try {
    const operator = await requireOperatorFor("workspace.setUp");
    slug = (await setUpWorkspace(operator, input)).slug;
  } catch (error) {
    if (error instanceof AdminRefusal || error instanceof OperatorRefusal) return { error: error.message };
    throw error;
  }
  redirect(`/admin/w/${slug}`);
}
