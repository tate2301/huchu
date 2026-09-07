/**
 * Everything an import needs to know about the school it is landing in,
 * fetched once.
 *
 * Nine hundred rows must not become nine hundred round trips, and every entity
 * type here refers to the others — a student names a class, a fee structure
 * names a class and a term, an opening balance names a student. One shared
 * lookup, built at the top of a dry run or a commit, keeps that honest and
 * makes "does this class exist?" a Map read.
 */
import type { Prisma, PrismaClient } from "@corelithzw/db";

import { normalizeName, normalizePhone } from "./cells";

type Db = PrismaClient | Prisma.TransactionClient;

export type ImportLookup = {
  /** Both name and code, normalised, because a school uses them interchangeably. */
  classesByName: Map<string, { id: string; name: string; code: string }>;
  classNames: string[];
  termsByName: Map<string, { id: string; name: string; code: string }>;
  termNames: string[];
  activeTermId: string | null;
  activeYearId: string | null;
  studentsByNo: Map<string, { id: string; name: string }>;
  studentNumbers: string[];
  guardiansByPhone: Map<string, { id: string; name: string }>;
  guardiansByEmail: Map<string, { id: string; name: string }>;
  feeStructuresByKey: Map<string, { id: string; name: string; currency: string }>;
  /** Highest numeric suffix already used, per generated-number prefix. */
  nextStudentSeq: number;
  nextGuardianSeq: number;
  nextInvoiceSeq: number;
  baseCurrency: string;
};

export function feeStructureKey(termId: string, classId: string, name: string): string {
  return `${termId}|${classId}|${normalizeName(name)}`;
}

/** Pull the trailing digits off SS-0042 / G0007 / INV-000123. */
function trailingNumber(value: string): number {
  const match = /(\d+)\s*$/.exec(value);
  return match ? Number(match[1]) : 0;
}

export async function buildImportLookup(db: Db, companyId: string): Promise<ImportLookup> {
  const [classes, terms, students, guardians, feeStructures, invoices, accounting] =
    await Promise.all([
      db.schoolClass.findMany({
        where: { companyId },
        select: { id: true, name: true, code: true },
      }),
      db.schoolTerm.findMany({
        where: { companyId },
        select: { id: true, name: true, code: true, isActive: true, academicYearId: true },
      }),
      db.schoolStudent.findMany({
        where: { companyId },
        select: { id: true, studentNo: true, firstName: true, lastName: true },
      }),
      db.schoolGuardian.findMany({
        where: { companyId },
        select: {
          id: true,
          guardianNo: true,
          phone: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      }),
      db.schoolFeeStructure.findMany({
        where: { companyId },
        select: { id: true, name: true, termId: true, classId: true, currency: true },
      }),
      db.schoolFeeInvoice.findMany({
        where: { companyId },
        select: { invoiceNo: true },
      }),
      db.accountingSettings.findUnique({
        where: { companyId },
        select: { baseCurrency: true },
      }),
    ]);

  const classesByName = new Map<string, { id: string; name: string; code: string }>();
  for (const record of classes) {
    classesByName.set(normalizeName(record.name), record);
    // A code collides with nothing here, and schools type "1B" as often as
    // "Form 1 Blue".
    if (!classesByName.has(normalizeName(record.code))) {
      classesByName.set(normalizeName(record.code), record);
    }
  }

  const termsByName = new Map<string, { id: string; name: string; code: string }>();
  for (const record of terms) {
    termsByName.set(normalizeName(record.name), record);
    if (!termsByName.has(normalizeName(record.code))) {
      termsByName.set(normalizeName(record.code), record);
    }
  }

  const activeTerm = terms.find((term) => term.isActive) ?? null;

  const studentsByNo = new Map<string, { id: string; name: string }>();
  let nextStudentSeq = 0;
  for (const record of students) {
    studentsByNo.set(normalizeName(record.studentNo), {
      id: record.id,
      name: `${record.firstName} ${record.lastName}`.trim(),
    });
    nextStudentSeq = Math.max(nextStudentSeq, trailingNumber(record.studentNo));
  }

  const guardiansByPhone = new Map<string, { id: string; name: string }>();
  const guardiansByEmail = new Map<string, { id: string; name: string }>();
  let nextGuardianSeq = 0;
  for (const record of guardians) {
    const entry = {
      id: record.id,
      name: `${record.firstName} ${record.lastName}`.trim(),
    };
    const phone = normalizePhone(record.phone);
    if (phone) guardiansByPhone.set(phone, entry);
    if (record.email) guardiansByEmail.set(record.email.trim().toLowerCase(), entry);
    nextGuardianSeq = Math.max(nextGuardianSeq, trailingNumber(record.guardianNo));
  }

  const feeStructuresByKey = new Map<string, { id: string; name: string; currency: string }>();
  for (const record of feeStructures) {
    feeStructuresByKey.set(feeStructureKey(record.termId, record.classId, record.name), {
      id: record.id,
      name: record.name,
      currency: record.currency,
    });
  }

  let nextInvoiceSeq = 0;
  for (const record of invoices) {
    nextInvoiceSeq = Math.max(nextInvoiceSeq, trailingNumber(record.invoiceNo));
  }

  return {
    classesByName,
    classNames: classes.map((record) => record.name),
    termsByName,
    termNames: terms.map((record) => record.name),
    activeTermId: activeTerm?.id ?? null,
    activeYearId: activeTerm?.academicYearId ?? null,
    studentsByNo,
    studentNumbers: students.map((record) => record.studentNo),
    guardiansByPhone,
    guardiansByEmail,
    feeStructuresByKey,
    nextStudentSeq,
    nextGuardianSeq,
    nextInvoiceSeq,
    baseCurrency: accounting?.baseCurrency ?? "USD",
  };
}
