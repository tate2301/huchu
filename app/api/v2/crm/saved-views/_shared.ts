import type { CrmRegister } from "@prisma/client";
import { z } from "zod";

import { REGISTERS, isEngineRegisterKey } from "@/lib/crm/registers/registry";
import { viewStateSchema } from "@/lib/crm/registers/schema";
import type { ViewState } from "@/lib/crm/registers/types";
import { hasCrmFullAccess } from "@/lib/crm/scope";
import { prisma } from "@/lib/prisma";

export const viewNameSchema = z.string().trim().min(1).max(80);

/**
 * Whether the author already has a view of this list by this name. Two in one
 * menu cannot be told apart, so a second is refused rather than listed.
 */
export async function viewNameTaken(params: {
  companyId: string;
  register: CrmRegister;
  createdById: string;
  name: string;
  exceptId?: string;
}): Promise<boolean> {
  const clash = await prisma.crmSavedView.findFirst({
    where: {
      companyId: params.companyId,
      register: params.register,
      createdById: params.createdById,
      name: { equals: params.name, mode: "insensitive" },
      ...(params.exceptId ? { id: { not: params.exceptId } } : {}),
    },
    select: { id: true },
  });
  return clash !== null;
}

export function nameTakenMessage(name: string): string {
  return `There is already a view called “${name}” on this list. Give this one another name.`;
}

export const VIEW_INCLUDE = { createdBy: { select: { id: true, name: true } } } as const;

/** Only whoever made a view, or a CRM manager, may change or delete it. */
export function canEditView(
  view: { createdById: string },
  user: { id: string; role?: string | null },
): boolean {
  return view.createdById === user.id || hasCrmFullAccess(user.role);
}

/**
 * A view's state, checked against the list it is a view of: every filter one
 * that list has, every answer the right shape, every column one it draws. A
 * view is read by everyone it is shared with, so it is checked on the way in
 * rather than trusted on the way out.
 *
 * Null for a list that is not on the list engine yet, which has no views to
 * save. Throws a `ZodError` for a state the list cannot hold.
 */
export function parseViewState(register: string, state: unknown): ViewState | null {
  if (!isEngineRegisterKey(register)) return null;
  return viewStateSchema(REGISTERS[register]).parse(state);
}
