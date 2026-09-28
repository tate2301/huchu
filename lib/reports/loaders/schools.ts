import { prisma } from "@/lib/prisma";
import { dateRange } from "@/lib/reports/params";
import { day, label, num, result, TAKE } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportParams } from "@/lib/reports/types";

function pupil(student: { firstName: string; lastName: string }): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

async function loadFeeBalances(ctx: ReportContext, params: ReportParams) {
  const owing = params.status !== "all";
  const found = await prisma.schoolFeeInvoice.findMany({
    where: {
      companyId: ctx.companyId,
      issueDate: dateRange(params),
      status: owing ? { in: ["ISSUED", "PART_PAID"] } : { notIn: ["DRAFT", "VOIDED"] },
      ...(owing ? { balanceAmount: { gt: 0 } } : {}),
    },
    select: {
      id: true,
      invoiceNo: true,
      status: true,
      issueDate: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      waivedAmount: true,
      balanceAmount: true,
      studentId: true,
      term: { select: { name: true } },
      student: {
        select: { firstName: true, lastName: true, studentNo: true, currentClass: { select: { name: true } } },
      },
    },
    orderBy: { dueDate: "asc" },
    take: TAKE,
  });
  const today = Date.now();
  return result(
    found.map((invoice) => {
      const balance = num(invoice.balanceAmount) ?? 0;
      const late = Math.floor((today - invoice.dueDate.getTime()) / 86_400_000);
      return {
        id: invoice.id,
        studentId: invoice.studentId,
        invoiceNo: invoice.invoiceNo,
        student: pupil(invoice.student),
        studentNo: invoice.student.studentNo,
        class: invoice.student.currentClass?.name ?? null,
        term: invoice.term.name,
        status: label(invoice.status),
        issued: day(invoice.issueDate),
        due: day(invoice.dueDate),
        daysOverdue: balance > 0 && late > 0 ? late : null,
        total: num(invoice.totalAmount),
        paid: num(invoice.paidAmount),
        waived: num(invoice.waivedAmount),
        balance,
      };
    }),
  );
}

async function loadFeeReceipts(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.schoolFeeReceipt.findMany({
    where: { companyId: ctx.companyId, receiptDate: dateRange(params), status: { not: "DRAFT" } },
    select: {
      id: true,
      receiptNo: true,
      receiptDate: true,
      paymentMethod: true,
      reference: true,
      status: true,
      amountReceived: true,
      amountUnallocated: true,
      studentId: true,
      student: { select: { firstName: true, lastName: true, currentClass: { select: { name: true } } } },
    },
    orderBy: { receiptDate: "desc" },
    take: TAKE,
  });
  return result(
    found.map((receipt) => ({
      id: receipt.id,
      studentId: receipt.studentId,
      receiptNo: receipt.receiptNo,
      date: day(receipt.receiptDate),
      student: pupil(receipt.student),
      class: receipt.student.currentClass?.name ?? null,
      method: label(receipt.paymentMethod),
      reference: receipt.reference,
      status: label(receipt.status),
      // A voided receipt took nothing in.
      amount: receipt.status === "VOIDED" ? 0 : num(receipt.amountReceived),
      unallocated: receipt.status === "VOIDED" ? 0 : num(receipt.amountUnallocated),
    })),
  );
}

async function loadRegisters(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.schoolAttendanceSessionLine.findMany({
    where: { companyId: ctx.companyId, session: { attendanceDate: dateRange(params) } },
    select: {
      id: true,
      status: true,
      remarks: true,
      session: { select: { attendanceDate: true, classId: true } },
      student: { select: { firstName: true, lastName: true, studentNo: true } },
    },
    orderBy: { session: { attendanceDate: "desc" } },
    take: TAKE,
  });
  // A session names its class by id only; one query for every name.
  const classIds = [...new Set(found.map((line) => line.session.classId))];
  const classes = classIds.length
    ? await prisma.schoolClass.findMany({ where: { id: { in: classIds }, companyId: ctx.companyId }, select: { id: true, name: true } })
    : [];
  const className = new Map(classes.map((entry) => [entry.id, entry.name]));
  return result(
    found.map((line) => ({
      id: line.id,
      date: day(line.session.attendanceDate),
      class: className.get(line.session.classId) ?? null,
      student: pupil(line.student),
      studentNo: line.student.studentNo,
      status: label(line.status),
      remarks: line.remarks,
    })),
  );
}

async function loadRoll(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.schoolStudent.findMany({
    where: { companyId: ctx.companyId, ...(params.status === "all" ? {} : { status: "ACTIVE" }) },
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      gender: true,
      isBoarding: true,
      house: true,
      status: true,
      admissionDate: true,
      dateOfBirth: true,
      currentClass: { select: { name: true } },
      currentStream: { select: { name: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: TAKE,
  });
  return result(
    found.map((student) => ({
      id: student.id,
      studentNo: student.studentNo,
      name: pupil(student),
      class: student.currentClass?.name ?? null,
      stream: student.currentStream?.name ?? null,
      gender: label(student.gender),
      boarding: student.isBoarding ? "Boarder" : "Day",
      house: student.house,
      status: label(student.status),
      admitted: day(student.admissionDate),
      born: day(student.dateOfBirth),
    })),
  );
}

export const SCHOOL_LOADERS: Record<string, ReportLoader> = {
  "school-fee-balances": { load: loadFeeBalances },
  "school-fee-receipts": { load: loadFeeReceipts },
  "school-attendance": { load: loadRegisters },
  "school-roll": { load: loadRoll },
};
