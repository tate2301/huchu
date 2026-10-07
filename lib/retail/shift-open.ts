import { prisma } from "@/lib/prisma";
import { canRetailRoleDo, canRetailSessionDo, retailPermissionDenial, type SessionLike } from "@/lib/retail/permission-matrix";
import { tillWords } from "@/lib/retail/shift-open-rules";

/**
 * Who a shift may be opened for, and on which till (00-foundations 5.7.8):
 * the checks `POST /api/v2/retail/shifts` makes before it opens a drawer.
 *
 * - A shift for somebody else needs `retail.cash-control:update` (owner,
 *   manager); for yourself, the route's own `retail.sell:open-shift`.
 * - The cashier is an active person of the company who may sell at a till.
 * - The till is the company's, active, at an active site, with no open shift.
 * - The cashier has no other open shift.
 */

export type ShiftOpenRefusal = {
  status: 400 | 403 | 404 | 409;
  error: string;
  /** The sheet field the sentence belongs under (`till`, `who`, `float`). */
  field?: string;
};

export type ShiftOpenPlan = {
  register: { id: string; code: string; name: string; siteId: string };
  cashier: { id: string; name: string };
};

export async function planShiftOpen(input: {
  session: SessionLike & { user: { id: string; companyId: string; name?: string | null } };
  registerId: string;
  cashierId?: string;
}): Promise<{ refused: ShiftOpenRefusal } | { plan: ShiftOpenPlan }> {
  const { session } = input;
  const companyId = session.user.companyId;
  const cashierId = input.cashierId ?? session.user.id;

  if (cashierId !== session.user.id && !canRetailSessionDo(session, "retail.cash-control", "update")) {
    return { refused: { status: 403, error: retailPermissionDenial(session, "retail.cash-control", "update")! } };
  }

  const cashier = await prisma.user.findFirst({
    where: { id: cashierId, companyId, isActive: true },
    select: { id: true, name: true, role: true },
  });
  if (!cashier) return { refused: { status: 404, error: "Person not found", field: "who" } };
  if (!canRetailRoleDo(cashier.role, "retail.sell", "open-shift")) {
    return { refused: { status: 400, error: `${cashier.name} cannot sell at a till.`, field: "who" } };
  }

  const register = await prisma.retailRegister.findFirst({
    where: { id: input.registerId, companyId, isActive: true, site: { isActive: true } },
    select: { id: true, code: true, name: true, siteId: true },
  });
  if (!register) return { refused: { status: 404, error: "Till not found", field: "till" } };

  const tillBusy = await prisma.retailShift.findFirst({
    where: { companyId, registerId: register.id, status: "OPEN" },
    select: { id: true },
  });
  if (tillBusy) return { refused: { status: 409, error: `${register.name} already has an open shift.` } };

  const cashierBusy = await prisma.retailShift.findFirst({
    where: { companyId, cashierId: cashier.id, status: "OPEN" },
    select: { registerName: true },
  });
  if (cashierBusy) {
    return {
      refused: {
        status: 409,
        error: `${cashier.name} already has a shift open on ${tillWords(cashierBusy.registerName)}.`,
      },
    };
  }

  return { plan: { register, cashier: { id: cashier.id, name: cashier.name } } };
}
