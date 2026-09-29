import type { DeviceApplicableTax } from "@/lib/accounting/fdms-device";
import { prisma } from "@/lib/prisma";

type TaxCodeRow = { id: string; code: string; rate: number; zimraTaxId: number | null };

export type ZimraTaxMappingPlan = {
  /** Tax codes that match exactly one of ZIMRA's taxes by rate. */
  mapped: Array<{ id: string; code: string; zimraTaxId: number }>;
  /** Codes whose rate ZIMRA charges under more than one taxID — 0% is the usual one. */
  ambiguous: string[];
  /** Codes at a rate ZIMRA does not list for this device. */
  unmatched: string[];
};

const percent = (value: number) => value.toFixed(2);

/**
 * Which of the company's tax codes can be given a ZIMRA taxID, and which one.
 *
 * `TaxCode.zimraTaxId` (FD-0.2) is what a fiscal receipt's tax lines are keyed
 * by, and nothing in the product set it: no screen, no route, no seed. Every
 * till sale was therefore refused as "no active tax code with a ZIMRA taxID
 * charges 15%". The device's own configuration lists the taxes ZIMRA applies
 * to it, with their rates, so a code whose rate matches exactly one of them is
 * mapped to it. A rate ZIMRA charges under two taxIDs is left alone and
 * reported, for the same reason the till refuses to guess one — and so is 0%
 * whenever ZIMRA also lists an exempt tax, which carries no percentage at all:
 * an EXEMPT code and a zero-rated one both sit at 0%.
 *
 * Codes that already carry a taxID are never changed.
 */
export function planZimraTaxMapping(
  codes: TaxCodeRow[],
  taxes: DeviceApplicableTax[],
): ZimraTaxMappingPlan {
  const plan: ZimraTaxMappingPlan = { mapped: [], ambiguous: [], unmatched: [] };

  // ZIMRA lists an exempt tax with no percentage. A code at 0% could be that
  // or zero-rated, and the rate alone cannot say which.
  const listsExempt = taxes.some((tax) => tax.taxID !== null && tax.taxPercent === null);

  for (const code of codes) {
    if (code.zimraTaxId !== null) continue;
    if (code.rate === 0 && listsExempt) {
      plan.ambiguous.push(code.code);
      continue;
    }
    const ids = [
      ...new Set(
        taxes
          .filter((tax) => tax.taxID !== null && tax.taxPercent !== null)
          .filter((tax) => percent(tax.taxPercent as number) === percent(code.rate))
          .map((tax) => tax.taxID as number),
      ),
    ];
    if (ids.length === 1) plan.mapped.push({ id: code.id, code: code.code, zimraTaxId: ids[0] });
    else if (ids.length > 1) plan.ambiguous.push(code.code);
    else plan.unmatched.push(code.code);
  }

  return plan;
}

/** Map the company's unmapped sales tax codes onto the device's taxes. */
export async function applyZimraTaxMapping(
  companyId: string,
  taxes: DeviceApplicableTax[],
): Promise<ZimraTaxMappingPlan> {
  const codes = await prisma.taxCode.findMany({
    where: {
      companyId,
      isActive: true,
      type: { not: "WITHHOLDING" },
      appliesTo: { in: ["SALES", "BOTH"] },
    },
    select: { id: true, code: true, rate: true, zimraTaxId: true },
    orderBy: { code: "asc" },
  });

  const plan = planZimraTaxMapping(codes, taxes);
  for (const entry of plan.mapped) {
    await prisma.taxCode.update({ where: { id: entry.id }, data: { zimraTaxId: entry.zimraTaxId } });
  }
  return plan;
}
