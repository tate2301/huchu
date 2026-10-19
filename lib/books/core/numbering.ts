import type { Prisma, PrismaClient } from "@prisma/client";

import { reserveIdentifier, type ReservableIdEntity } from "@/lib/id-generator";

/**
 * `nextNumber`: the next number in a document's series, inside the issuing
 * transaction (books-final §1.1). For now it hands out today's numbers
 * (`reserveIdentifier`); gapless series for every type, given at issue (D8),
 * come in P1b behind this same call.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type NumberedDocument = "invoice" | "receipt" | "quotation" | "requisition";

const SERIES: Record<NumberedDocument, ReservableIdEntity> = {
  invoice: "SALES_INVOICE",
  receipt: "SALES_RECEIPT",
  quotation: "SALES_QUOTATION",
  requisition: "CRM_REQUISITION",
};

export class NoSeriesYet extends Error {
  constructor(type: string) {
    super(`${type} has no numbered series yet.`);
    this.name = "NoSeriesYet";
  }
}

export async function nextNumber(db: Db, companyId: string, type: NumberedDocument | string): Promise<string> {
  const entity = SERIES[type as NumberedDocument];
  if (!entity) throw new NoSeriesYet(type);
  return reserveIdentifier(db, { companyId, entity });
}
