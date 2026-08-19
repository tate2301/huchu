/**
 * A manager standing at the till, approving something the cashier may not do.
 *
 * S-7.7. The shape of this already existed inside `pos/sales` for price
 * overrides — find the named user, check they are a retail manager, check their
 * password with bcrypt, refuse otherwise. It is lifted out here because refund
 * and void need exactly the same act, and three hand-written copies of a
 * password check is three chances to get one of them subtly wrong.
 *
 * ── Why the till needs this at all ─────────────────────────────────────────
 *
 * `RUN_A_TILL` in `./permissions.ts` withholds `refund` and `void` from a
 * cashier, deliberately: a reversal moves money back out of the drawer and
 * stock back onto the shelf, and it is not the till operator's call. But the
 * POS portal admits **only** cashiers (`canAccessPosPortal`), so before this
 * existed the two buttons were gated on a condition no POS user could ever
 * satisfy and reversals were unreachable from the shop floor entirely.
 *
 * Moving them to the back office is not the answer either, and the reason is
 * concrete rather than aesthetic: a refund needs a `shiftId`, because the cash
 * going back to the customer comes out of a real drawer and has to land against
 * the count at cash-up. A manager sitting in the office has no drawer. The
 * reversal has to happen *at a till*, which means the manager has to be able to
 * approve one *at the till*.
 *
 * ── What this is not ───────────────────────────────────────────────────────
 *
 * Not a session. Approving one refund does not log the manager in, does not
 * widen what the cashier may do next, and leaves nothing behind that the next
 * sale can reuse. The approval is checked once, for one act, and its only trace
 * is the approver's name recorded on the reversal — which is the thing a shop
 * investigating a suspicious refund actually wants to read.
 */

import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { canRetailRoleDo } from "./permissions";
import type { RetailAction } from "./permissions";

export const managerOverrideSchema = z
  .object({
    managerUserId: z.string().uuid().optional(),
    managerEmail: z.string().email().optional(),
    managerPassword: z.string().min(1).max(200),
    reason: z.string().max(240).optional().nullable(),
  })
  .refine((value) => Boolean(value.managerUserId || value.managerEmail), {
    message: "Manager approver is required",
    path: ["managerUserId"],
  });

export type ManagerOverrideInput = z.infer<typeof managerOverrideSchema>;

export type ManagerOverrideResult =
  | { ok: true; approver: { id: string; name: string } }
  | { ok: false; error: string };

/**
 * Check an approval, and say who gave it.
 *
 * Every refusal returns the same words on purpose. Distinguishing "no such
 * user" from "not a manager" from "wrong password" would turn this endpoint
 * into a way to enumerate which of a shop's staff are managers, and then into a
 * way to test passwords against them — from a tablet on the shop floor that
 * anybody can pick up.
 */
export async function verifyManagerOverride(input: {
  companyId: string;
  override: ManagerOverrideInput;
  /** The thing being approved, checked against the approver's own grants. */
  action: RetailAction;
}): Promise<ManagerOverrideResult> {
  const refused: ManagerOverrideResult = { ok: false, error: "Manager approval is invalid" };

  const manager = await prisma.user.findFirst({
    where: {
      companyId: input.companyId,
      isActive: true,
      ...(input.override.managerUserId
        ? { id: input.override.managerUserId }
        : {
            email: {
              equals: input.override.managerEmail ?? "",
              mode: "insensitive",
            },
          }),
    },
    select: { id: true, name: true, email: true, password: true, role: true },
  });

  if (!manager) return refused;

  /*
    The approver is held to the same matrix the caller would have been. An
    approval cannot grant what the approver does not themselves hold — otherwise
    a shop could route a refund through whichever manager role happened to have
    been given the least thought.
  */
  if (!canRetailRoleDo(manager.role, "retail.sell", input.action)) return refused;
  if (!manager.password) return refused;

  const valid = await bcrypt.compare(input.override.managerPassword, manager.password);
  if (!valid) return refused;

  return { ok: true, approver: { id: manager.id, name: manager.name || manager.email || "manager" } };
}

/** `"Customer changed their mind (approved by Tafara Nyathi)"`. */
export function withApprover(reason: string, approverName: string) {
  return `${reason} (approved by ${approverName})`;
}
