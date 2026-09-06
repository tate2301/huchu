/**
 * HR's own bootstrap.
 *
 * Separate from `ensureAccountingDefaults` on purpose. Payroll has to run in a
 * workspace with no accounting module at all — that is the point of the
 * payroll-only product — so the statutory tables a payroll needs cannot be
 * seeded as a side effect of seeding a chart of accounts. A company that turns
 * on the payroll addon without accounting still gets its PAYE bands.
 *
 * Idempotent and cheap to call: one `count` when the tables are already there.
 * Called both at provisioning and lazily before a run computes, so a company
 * that enables payroll on an existing workspace gets its tables without anybody
 * re-provisioning it.
 */

import type { Prisma } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import {
  seedZimbabweStatutoryPack,
  type SeedStatutoryPackResult,
} from "@/lib/hr/statutory/zimbabwe-pack";

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * Make sure a company has the statutory tables a Zimbabwean payroll needs.
 *
 * Never overwrites: `seedZimbabweStatutoryPack` bails if any PAYE table exists,
 * so a corrected rate survives every subsequent call.
 */
export async function ensureHrPayrollDefaults(
  companyId: string,
  db: Db = prisma,
): Promise<SeedStatutoryPackResult> {
  return seedZimbabweStatutoryPack({ companyId }, db);
}
